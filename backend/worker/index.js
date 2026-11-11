import "../../dashboard/decoder.js";

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const SAFE_ID = /^[A-Za-z0-9_-]{1,64}$/;
const READ_DEVICES = new Set(["CS01", "CS02", "CS03", "CS04", "CS3_01", "CS3_02", "CS3_03", "CS3_04"]);
const ALLOWED_ORIGINS = new Set([
  "https://hui-aqua.github.io",
  "http://localhost:8000",
  "http://127.0.0.1:8000",
]);

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function error(detail, status) {
  return json({ detail }, status);
}

function validTimestamp(value) {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/i.test(value)
    && Number.isFinite(Date.parse(value));
}

function withReadCors(request, response) {
  const headers = new Headers(response.headers);
  const origin = request.headers.get("Origin");
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Vary", "Origin");
  }
  headers.set("Access-Control-Allow-Methods", "GET, OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Content-Type");
  headers.set("Access-Control-Max-Age", "86400");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function validR2Key(key) {
  const match = /^(CS0[1-4]|CS3_0[1-4])\/(\d{4})\/(\d{2})\/(\d{2})\/([A-Za-z0-9][A-Za-z0-9._-]*\.bin)$/.exec(key);
  if (!match || !READ_DEVICES.has(match[1])) return false;
  const [, , year, month, day] = match;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  return date.getUTCFullYear() === Number(year)
    && date.getUTCMonth() + 1 === Number(month)
    && date.getUTCDate() === Number(day);
}

async function listFiles(request, env, url) {
  const device = url.searchParams.get("device");
  if (!READ_DEVICES.has(device)) return withReadCors(request, error("Unsupported device", 400));
  if (!env.UPLOADS) return withReadCors(request, error("Upload storage is not configured", 503));

  const files = [];
  let cursor;
  do {
    const page = await env.UPLOADS.list({ prefix: `${device}/`, cursor, limit: 1000, include: ["customMetadata"] });
    for (const object of page.objects) {
      if (!object.key.toLowerCase().endsWith(".bin") || !validR2Key(object.key)) continue;
      const [, year, month, day, filename] = object.key.split("/");
      const metadata = object.customMetadata ?? {};
      const summaryHz = Number(metadata.summary_hz ?? (metadata.measurement_type === "motion_summary" ? metadata.sampling_frequency : NaN));
      files.push({ ...metadata, key: object.key, device_id: device, date: `${year}-${month}-${day}`, filename, size_bytes: object.size, summary_hz: [1, 10].includes(summaryHz) ? summaryHz : null, record_count: metadata.record_count != null ? Number(metadata.record_count) : null, uploaded: object.uploaded?.toISOString?.() ?? null });
    }
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);

  // Most complete snapshot first per day, newest upload breaks ties. Keep all versions.
  files.sort((a, b) => b.date.localeCompare(a.date) || b.size_bytes - a.size_bytes || String(b.uploaded).localeCompare(String(a.uploaded)) || a.key.localeCompare(b.key));
  const dates = new Set();
  for (const file of files) { file.preferred = !dates.has(file.date); dates.add(file.date); }
  return withReadCors(request, json({ device, files }));
}

async function getFileContent(request, env, url) {
  const key = url.searchParams.get("key") ?? "";
  if (!validR2Key(key)) return withReadCors(request, error("Invalid R2 key", 400));
  if (!env.UPLOADS) return withReadCors(request, error("Upload storage is not configured", 503));

  const object = await env.UPLOADS.get(key);
  if (!object) return withReadCors(request, error("File not found", 404));
  const filename = key.split("/").pop();
  const response = new Response(object.body, {
    headers: {
      "content-type": "application/octet-stream",
      "content-length": String(object.size),
      "content-disposition": `attachment; filename="${filename}"`,
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
    },
  });
  return withReadCors(request, response);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS" && ["/api/v1/files", "/api/v1/files/content"].includes(url.pathname)) {
      return withReadCors(request, new Response(null, { status: 204 }));
    }

    if (request.method === "GET" && url.pathname === "/api/v1/files") {
      return listFiles(request, env, url);
    }

    if (request.method === "GET" && url.pathname === "/api/v1/files/content") {
      return getFileContent(request, env, url);
    }

    if (request.method === "GET" && url.pathname === "/health") {
      return json({ status: "ok" });
    }

    if (request.method !== "POST" || url.pathname !== "/api/v1/upload") {
      return error("Not found", 404);
    }

    if (!env.DEVICE_API_KEY || request.headers.get("authorization") !== `Bearer ${env.DEVICE_API_KEY}`) {
      return error("Invalid device API key", 401);
    }

    const contentLength = Number(request.headers.get("content-length"));
    if (Number.isFinite(contentLength) && contentLength > MAX_FILE_BYTES + 64 * 1024) {
      return error("File exceeds 10 MiB limit", 413);
    }

    let form;
    try {
      form = await request.formData();
    } catch {
      return error("Expected multipart form data", 400);
    }

    const file = form.get("file");
    const deviceId = form.get("device_id");
    const timestamp = form.get("timestamp");
    const samplingFrequency = form.get("sampling_frequency");
    const measurementType = form.get("measurement_type");
    const fileFormat = form.get("file_format");
    const isSummary = measurementType === "motion_summary";

    if (!(file instanceof File) || typeof deviceId !== "string" || typeof timestamp !== "string"
      || (!isSummary && typeof samplingFrequency !== "string") || typeof measurementType !== "string"
      || typeof fileFormat !== "string") {
      return error("Missing or invalid upload fields", 422);
    }
    if (!SAFE_ID.test(deviceId)) return error("Invalid device_id", 422);
    if (!isSummary && (samplingFrequency !== "50" || measurementType !== "acceleration" || fileFormat !== "binary")) {
      return error("Unexpected measurement metadata", 422);
    }
    if (!validTimestamp(timestamp)) return error("timestamp must be ISO-8601 with timezone", 422);

    const originalName = file.name || "measurement.bin";
    if (!originalName.toLowerCase().endsWith(".bin")) return error("Only .bin files are accepted", 422);
    if (file.size > MAX_FILE_BYTES) return error("File exceeds 10 MiB limit", 413);
    if (file.size === 0) return error("Empty file", 422);
    if (!env.UPLOADS) return error("Upload storage is not configured", 503);

    const filename = originalName.split(/[\\/]/).pop();
    const captured = new Date(timestamp);
    const datePath = captured.toISOString().slice(0, 10).replaceAll("-", "/");
    let key = `${deviceId}/${datePath}/${filename}`;
    const bytes = await file.arrayBuffer();
    // RAW remains on the SD card; retain the legacy arbitrary-payload test route.
    if (new TextDecoder().decode(new Uint8Array(bytes, 0, Math.min(8, bytes.byteLength))) === "CS3RAW01") return error("RAW uploads are not supported", 422);
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    const sha256 = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");

    if (isSummary) {
      const hzText = form.get("summary_hz") ?? samplingFrequency;
      const hz = Number(hzText);
      const date = form.get("date");
      const crc = globalThis.motionCrc32(bytes);
      if (!READ_DEVICES.has(deviceId) || ![1, 10].includes(hz) || !["cs3_summary_v1", "cs3_summary_v2", "cs3_summary_v3"].includes(fileFormat)) return error("Invalid SUMMARY metadata", 422);
      if (samplingFrequency != null && Number(samplingFrequency) !== hz) return error("Conflicting SUMMARY frequencies", 422);
      if (typeof date !== "string" || date !== captured.toISOString().slice(0, 10)) return error("date must match timestamp UTC date", 422);
      if (typeof form.get("crc32") !== "string" || !/^[a-f0-9]{8}$/i.test(form.get("crc32")) || form.get("crc32").toLowerCase() !== crc) return error("CRC32 mismatch or invalid CRC32", 422);
      if (!/^\d+$/.test(form.get("size_bytes") ?? "") || Number(form.get("size_bytes")) !== bytes.byteLength) return error("size_bytes mismatch", 422);
      let decoded;
      try { decoded = globalThis.decodeBinary(bytes, { summaryHz: hz }); }
      catch (err) { return error(err.message, 422); }
      if (decoded.kind !== "summary" || decoded.tailBytes || decoded.header.device !== deviceId || fileFormat !== `cs3_summary_v${decoded.header.version}`) return error("SUMMARY header, device, format or record alignment mismatch", 422);
      if (decoded.header.version === 3 && decoded.recordCount === 0) return error("SUMMARY v3 upload requires at least one complete window", 422);
      key = `${deviceId}/${datePath}/${crc}.bin`;
      const existing = await env.UPLOADS.get(key);
      if (existing && (existing.size !== bytes.byteLength || existing.customMetadata?.sha256 !== sha256)) return error("CRC32 identity collision: existing snapshot differs", 409);
      const metadata = { sha256, crc32: crc, device_id: deviceId, date, timestamp, summary_hz: String(hz), sampling_frequency: String(hz), measurement_type: measurementType, file_format: fileFormat, original_filename: filename, size_bytes: String(bytes.byteLength), record_count: String(decoded.recordCount), represented_duration_seconds: String(decoded.representedDurationSeconds), firmware: decoded.header.firmware, created_utc: decoded.header.createdUtc };
      metadata.format_version = String(decoded.header.version);
      metadata.timestamp_semantics = decoded.header.timestampSemantics;
      if (decoded.header.version === 3) metadata.time_basis = String(decoded.header.timeBasis);
      if (!existing) await env.UPLOADS.put(key, bytes, { httpMetadata: { contentType: "application/octet-stream" }, customMetadata: metadata });
      return json({ status: existing ? "ALREADY_EXISTS" : "STORED", result: existing ? "ALREADY_EXISTS" : "STORED", device_id: deviceId, date, filename, size_bytes: bytes.byteLength, crc32: crc, sha256, summary_hz: existing ? Number(existing.customMetadata.summary_hz) : hz, sampling_frequency: hz, file_format: fileFormat, format_version: decoded.header.version, time_basis: decoded.header.timeBasis ?? null, record_count: decoded.recordCount, storage: "r2", path: key });
    }

    const existing = await env.UPLOADS.get(key);
    if (existing) {
      const existingDigest = existing.customMetadata?.sha256;
      if (existingDigest !== sha256) return error("Filename already exists with different content", 409);
    } else {
      await env.UPLOADS.put(key, bytes, {
        httpMetadata: { contentType: "application/octet-stream" },
        customMetadata: { sha256, device_id: deviceId, timestamp },
      });
    }

    return json({
      status: "success",
      device_id: deviceId,
      filename,
      size_bytes: file.size,
      sha256,
      storage: "r2",
      path: key,
    });
  },
};
