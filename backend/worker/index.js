const MAX_FILE_BYTES = 10 * 1024 * 1024;
const SAFE_ID = /^[A-Za-z0-9_-]{1,64}$/;
const READ_DEVICES = new Set(["CS01", "CS02", "CS03", "CS04"]);
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
  const match = /^(CS0[1-4])\/(\d{4})\/(\d{2})\/(\d{2})\/([A-Za-z0-9][A-Za-z0-9._-]*\.bin)$/.exec(key);
  if (!match || !READ_DEVICES.has(match[1])) return false;
  const [, , year, month, day] = match;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  return date.getUTCFullYear() === Number(year)
    && date.getUTCMonth() + 1 === Number(month)
    && date.getUTCDate() === Number(day);
}

async function listFiles(request, env, url) {
  const device = url.searchParams.get("device");
  if (!READ_DEVICES.has(device)) return withReadCors(request, error("device must be CS01, CS02, CS03, or CS04", 400));
  if (!env.UPLOADS) return withReadCors(request, error("Upload storage is not configured", 503));

  const files = [];
  let cursor;
  do {
    const page = await env.UPLOADS.list({ prefix: `${device}/`, cursor, limit: 1000 });
    for (const object of page.objects) {
      if (!object.key.toLowerCase().endsWith(".bin") || !validR2Key(object.key)) continue;
      const [, , year, month, day, filename] = object.key.split("/");
      files.push({ key: object.key, device_id: device, date: `${year}-${month}-${day}`, filename, size_bytes: object.size, uploaded: object.uploaded?.toISOString?.() ?? null });
    }
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);

  files.sort((a, b) => b.date.localeCompare(a.date) || a.filename.localeCompare(b.filename));
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

    if (!(file instanceof File) || typeof deviceId !== "string" || typeof timestamp !== "string"
      || typeof samplingFrequency !== "string" || typeof measurementType !== "string"
      || typeof fileFormat !== "string") {
      return error("Missing or invalid upload fields", 422);
    }
    if (!SAFE_ID.test(deviceId)) return error("Invalid device_id", 422);
    if (samplingFrequency !== "50" || measurementType !== "acceleration" || fileFormat !== "binary") {
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
    const key = `${deviceId}/${datePath}/${filename}`;
    const bytes = await file.arrayBuffer();
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    const sha256 = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");

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
