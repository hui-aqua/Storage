const INDEX_URL = new URL("data/index.json", document.baseURI);
const REPO_RAW = "https://raw.githubusercontent.com/hui-aqua/Storage/main/";
const WORKER_URL = "https://marine-motion-storage-api.stavanger.workers.dev";
const COLORS = { x: "#54d4c1", y: "#6eb6ff", z: "#f2b968" };
const SUMMARY_COLUMNS = ["UTC_time", "sensor_time_us", "record_id", "sample_count", "acc_x_mean", "acc_y_mean", "acc_z_mean", "acc_x_peak", "acc_y_peak", "acc_z_peak", "acc_mag_peak", "gyro_x_mean", "gyro_y_mean", "gyro_z_mean", "gyro_x_peak", "gyro_y_peak", "gyro_z_peak", "gyro_mag_peak", "temperature", "battery_voltage", "acc_saturation", "gyro_saturation", "missed_samples"];
const state = { records: [], selected: null, points: null, series: "acc", cloudFiles: [], localFile: null, binary: null };
const $ = (selector) => document.querySelector(selector);

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), 3);
  return `${(bytes / 1024 ** exponent).toFixed(exponent ? 1 : 0)} ${units[exponent]}`;
}

function formatDate(value, options = {}) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value || "Unknown time";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short", timeZone: "UTC", ...options }).format(date);
}

function workerContentUrl(key) {
  const url = new URL("/api/v1/files/content", WORKER_URL);
  url.searchParams.set("key", key);
  return url.href;
}

function fileUrl(record) {
  if (record.url) return record.url;
  if (record.path) return new URL(record.path.split("/").map(encodeURIComponent).join("/"), REPO_RAW).href;
  return "#";
}

function fileUrlForRaw(record) {
  return record.raw_key ? workerContentUrl(record.raw_key) : "#";
}

function parseCsv(text) {
  const lines = text.replace(/^\uFEFF/, "").trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const header = lines.shift().split(",").map((value) => value.trim());
  if (!SUMMARY_COLUMNS.every((name, index) => header[index] === name)) throw new Error("CSV columns do not match the daily SUMMARY format");
  return lines.map((line) => {
    const columns = line.split(",");
    const row = Object.fromEntries(header.map((key, index) => [key, columns[index]]));
    return { t: row.UTC_time, ax: Number(row.acc_x_mean), ay: Number(row.acc_y_mean), az: Number(row.acc_z_mean), gx: Number(row.gyro_x_mean), gy: Number(row.gyro_y_mean), gz: Number(row.gyro_z_mean), row };
  }).filter((point) => [point.ax, point.ay, point.az, point.gx, point.gy, point.gz].every(Number.isFinite));
}

function renderList(query = "") {
  const list = $("#record-list");
  const filtered = state.records.filter((record) => `${record.device_id} ${record.filename} ${record.timestamp}`.toLowerCase().includes(query.toLowerCase()));
  $("#list-count").textContent = String(filtered.length).padStart(2, "0");
  if (!filtered.length) {
    list.innerHTML = `<div class="empty-state">${state.records.length ? "No daily summaries match this filter." : "No daily summaries are indexed yet. Add records to <code>data/index.json</code>."}</div>`;
    return;
  }
  list.replaceChildren(...filtered.map((record) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `record-item${state.selected === record ? " selected" : ""}`;
    button.innerHTML = '<span class="record-name"></span><span class="record-size"></span><span class="record-meta"></span><span class="record-badge">10 HZ SUMMARY</span>';
    button.querySelector(".record-name").textContent = record.filename || "Daily summary";
    button.querySelector(".record-size").textContent = formatBytes(Number(record.size_bytes));
    button.querySelector(".record-meta").textContent = `${record.device_id || "device"} · ${formatDate(record.timestamp)}`;
    button.addEventListener("click", () => selectRecord(record));
    return button;
  }));
}

function renderHistory() {
  const body = $("#history-body");
  if (!state.records.length) return;
  body.replaceChildren(...state.records.map((record) => {
    const row = document.createElement("tr");
    ["PUBLISHED", record.device_id || "device", formatDate(record.timestamp), record.filename || "SUMMARY.csv", formatBytes(Number(record.size_bytes)), record.sha256 ? `${record.sha256.slice(0, 12)}…` : "—"].forEach((value, index) => {
      const cell = document.createElement("td");
      cell.textContent = value;
      if (index === 0) cell.className = "status-cell";
      if (index === 3) cell.className = "file-cell";
      if (index === 5) cell.className = "hash-cell";
      row.append(cell);
    });
    const action = document.createElement("td");
    const link = document.createElement("a");
    link.className = "table-download";
    link.href = fileUrl(record);
    link.textContent = "↓";
    link.setAttribute("aria-label", `Download ${record.filename || "summary"}`);
    link.setAttribute("download", record.filename || "summary.csv");
    action.append(link);
    row.append(action);
    return row;
  }));
}

function renderOverview() {
  const total = state.records.reduce((sum, record) => sum + (Number(record.size_bytes) || 0), 0);
  const latest = state.records[0];
  $("#metric-count").textContent = state.records.length.toLocaleString();
  $("#metric-volume").textContent = formatBytes(total);
  $("#metric-latest").textContent = latest ? formatDate(latest.timestamp, { dateStyle: "short", timeStyle: "short" }) : "No uploads";
  $("#device-label").textContent = latest ? `Latest device · ${latest.device_id || "unknown"}` : "Waiting for first daily summary";
  $("#updated-at").textContent = `INDEX · ${state.records.length} DAY${state.records.length === 1 ? "" : "S"}`;
  $("#index-status").textContent = "PUBLIC INDEX · CONNECTED";
}

async function loadSummary(record) {
  const response = await fetch(fileUrl(record));
  if (!response.ok) throw new Error(`Unable to download SUMMARY CSV (${response.status})`);
  return parseCsv(await response.text());
}

async function selectRecord(record) {
  state.selected = record;
  state.points = null;
  renderList($("#search").value);
  $("#chart-title").textContent = record.filename || "Daily summary";
  $("#chart-section-kicker").textContent = "02 / DAILY SUMMARY";
  $("#chart-subtitle").textContent = `${record.device_id || "device"} · ${formatDate(record.timestamp)} · 10 Hz SUMMARY`;
  const rawLink = $("#raw-download-link");
  const rawUrl = fileUrlForRaw(record);
  rawLink.href = rawUrl;
  rawLink.download = record.raw_filename || "";
  rawLink.classList.toggle("disabled", rawUrl === "#");
  rawLink.setAttribute("aria-disabled", rawUrl === "#" ? "true" : "false");
  const download = $("#download-link");
  download.href = fileUrl(record);
  download.download = record.filename || "summary.csv";
  download.classList.remove("disabled");
  download.removeAttribute("aria-disabled");
  $("#series-controls").hidden = true;
  $("#plot-empty").style.display = "flex";
  $("#plot-empty").querySelector("strong").textContent = "Loading daily summary…";
  $("#plot-empty").querySelector("span:last-child").textContent = "Reading published 10 Hz averages.";
  try {
    state.points = await loadSummary(record);
    if (state.selected !== record) return;
    $("#series-controls").hidden = false;
    $("#plot-empty").style.display = state.points.length ? "none" : "flex";
    $("#sample-info").textContent = `${state.points.length.toLocaleString()} summary rows · 10 Hz`;
    $("#chart-range").textContent = `${formatBytes(Number(record.size_bytes))} · ${record.summary_rows ?? state.points.length} rows`;
    drawChart();
  } catch (error) {
    $("#plot-empty").style.display = "flex";
    $("#plot-empty").querySelector("strong").textContent = "Summary unavailable";
    $("#plot-empty").querySelector("span:last-child").textContent = error.message;
    $("#sample-info").textContent = "Download remains available";
  }
}

function drawChart() {
  const canvas = $("#chart");
  const rect = canvas.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  const ratio = window.devicePixelRatio || 1;
  canvas.width = Math.floor(rect.width * ratio);
  canvas.height = Math.floor(rect.height * ratio);
  const context = canvas.getContext("2d");
  context.scale(ratio, ratio);
  const width = rect.width;
  const height = rect.height;
  const padding = { left: 50, right: 13, top: 16, bottom: 25 };
  context.clearRect(0, 0, width, height);
  if (!state.points?.length) return;
  const prefix = state.series === "acc" ? "a" : "g";
  const values = state.points.flatMap((point) => [point[`${prefix}x`], point[`${prefix}y`], point[`${prefix}z`]]).filter(Number.isFinite);
  let min = Math.min(...values);
  let max = Math.max(...values);
  if (min === max) { min -= 1; max += 1; }
  const margin = (max - min) * 0.08;
  min -= margin;
  max += margin;
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  context.font = '9px "DM Mono",monospace';
  for (let index = 0; index <= 4; index++) {
    const y = padding.top + plotHeight * index / 4;
    const value = max - (max - min) * index / 4;
    context.strokeStyle = "rgba(81,111,125,.22)";
    context.beginPath();
    context.moveTo(padding.left, y);
    context.lineTo(width - padding.right, y);
    context.stroke();
    context.fillStyle = "#718995";
    context.textAlign = "right";
    context.fillText(value.toFixed(2), padding.left - 8, y + 3);
  }
  for (const [axis, key] of ["x", "y", "z"].entries()) {
    context.strokeStyle = [COLORS.x, COLORS.y, COLORS.z][axis];
    context.lineWidth = 1.4;
    context.beginPath();
    state.points.forEach((point, index) => {
      const value = point[`${prefix}${key}`];
      if (!Number.isFinite(value)) return;
      const x = padding.left + plotWidth * (state.points.length === 1 ? 0 : index / (state.points.length - 1));
      const y = padding.top + (max - value) * plotHeight / (max - min);
      index ? context.lineTo(x, y) : context.moveTo(x, y);
    });
    context.stroke();
  }
  context.fillStyle = "#718995";
  context.textAlign = "left";
  context.fillText("00:00 UTC", padding.left, height - 7);
  context.textAlign = "right";
  context.fillText("24:00 UTC", width - padding.right, height - 7);
  $("#chart-unit").textContent = state.series === "acc" ? "Acceleration (g)" : "Angular velocity (°/s)";
  $("#chart-subtitle").textContent = `${state.series === "acc" ? "Acceleration" : "Angular velocity"} means · UTC day · 10 Hz`;
}

function setBinaryDetails({ source, filename, size, device, date, status }) {
  $("#binary-source").textContent = source || "—";
  $("#binary-filename").textContent = filename || "—";
  $("#binary-size").textContent = Number.isFinite(size) ? `${formatBytes(size)} (${size.toLocaleString()} bytes)` : "—";
  $("#binary-context").textContent = [device, date].filter(Boolean).join(" · ") || "Unknown";
  $("#decode-status").textContent = status || "Waiting for a file";
}

function inferLocalContext(filename) {
  const match = /^(CS0[1-4]).*?(\d{4})(\d{2})(\d{2})/i.exec(filename);
  return match ? { device: match[1].toUpperCase(), date: `${match[2]}-${match[3]}-${match[4]}` } : {};
}

async function processBinary(arrayBuffer, metadata) {
  const result = window.decodeBinary(arrayBuffer);
  state.binary = { ...metadata, byteLength: arrayBuffer.byteLength, decode: result };
  setBinaryDetails({ ...metadata, size: arrayBuffer.byteLength, status: `ArrayBuffer verified: ${arrayBuffer.byteLength.toLocaleString()} bytes. ${result.message}` });

  state.points = null;
  $("#series-controls").hidden = true;
  $("#chart-title").textContent = metadata.filename;
  $("#chart-section-kicker").textContent = "02 / SHARED CHART AREA";
  $("#chart-subtitle").textContent = `${metadata.source} · ${metadata.device || "Device unknown"} · ${metadata.date || "Date unknown"}`;
  $("#plot-empty").style.display = "flex";
  $("#plot-empty").querySelector("strong").textContent = "Binary loaded · decoder TODO";
  $("#plot-empty").querySelector("span:last-child").textContent = "The exact CoreS3 binary specification is required before drawing decoded samples.";
  $("#sample-info").textContent = `ArrayBuffer · ${arrayBuffer.byteLength.toLocaleString()} bytes · not decoded`;
  $("#chart-range").textContent = formatBytes(arrayBuffer.byteLength);
  drawChart();
}

async function fetchCloudFiles() {
  const device = $("#cloud-device").value;
  const select = $("#cloud-file");
  const status = $("#cloud-status");
  state.cloudFiles = [];
  select.disabled = true;
  $("#load-cloud").disabled = true;
  setDownloadEnabled(false);
  status.textContent = `Loading ${device} file list…`;
  try {
    const url = new URL("/api/v1/files", WORKER_URL);
    url.searchParams.set("device", device);
    const response = await fetch(url, { mode: "cors", cache: "no-store" });
    if (!response.ok) throw new Error(`Worker file list failed (${response.status})`);
    const body = await response.json();
    state.cloudFiles = Array.isArray(body.files) ? body.files : [];
    select.replaceChildren();
    if (!state.cloudFiles.length) {
      select.add(new Option("No .bin files found", ""));
      status.textContent = `No .bin files found for ${device}.`;
      return;
    }
    for (const file of state.cloudFiles) {
      const label = `${file.date} · ${file.filename} · ${formatBytes(Number(file.size_bytes))}`;
      select.add(new Option(label, file.key));
    }
    select.disabled = false;
    $("#load-cloud").disabled = false;
    status.textContent = `${state.cloudFiles.length} private R2 file${state.cloudFiles.length === 1 ? "" : "s"} available.`;
    updateCloudDownload();
  } catch (error) {
    select.replaceChildren(new Option("Unable to list files", ""));
    status.textContent = `${error.message}. Check Worker CORS and R2 configuration.`;
  }
}

function selectedCloudFile() {
  return state.cloudFiles.find((file) => file.key === $("#cloud-file").value) || null;
}

function setDownloadEnabled(enabled) {
  const link = $("#cloud-download");
  link.classList.toggle("disabled", !enabled);
  link.setAttribute("aria-disabled", enabled ? "false" : "true");
  if (!enabled) link.href = "#";
}

function updateCloudDownload() {
  const file = selectedCloudFile();
  const link = $("#cloud-download");
  if (!file) return setDownloadEnabled(false);
  link.href = workerContentUrl(file.key);
  link.download = file.filename;
  setDownloadEnabled(true);
  setBinaryDetails({ source: "Cloud R2 via Worker", filename: file.filename, size: Number(file.size_bytes), device: file.device_id, date: file.date, status: "Ready to load from private R2." });
}

async function loadCloudFile() {
  const file = selectedCloudFile();
  if (!file) return;
  const status = $("#cloud-status");
  status.textContent = `Streaming ${file.filename} from private R2…`;
  $("#load-cloud").disabled = true;
  try {
    const response = await fetch(workerContentUrl(file.key), { mode: "cors", cache: "no-store" });
    if (!response.ok) throw new Error(`Worker file request failed (${response.status})`);
    const arrayBuffer = await response.arrayBuffer();
    const [device, year, month, day] = file.key.split("/");
    await processBinary(arrayBuffer, { source: "Cloud R2 via Worker", filename: file.filename, device, date: `${year}-${month}-${day}` });
    status.textContent = `Loaded ${arrayBuffer.byteLength.toLocaleString()} bytes from private R2.`;
  } catch (error) {
    status.textContent = error.message;
    setBinaryDetails({ source: "Cloud R2 via Worker", filename: file.filename, size: Number(file.size_bytes), device: file.device_id, date: file.date, status: `Load failed: ${error.message}` });
  } finally {
    $("#load-cloud").disabled = false;
  }
}

function chooseLocalFile(file) {
  if (!file) return;
  if (!file.name.toLowerCase().endsWith(".bin")) {
    state.localFile = null;
    $("#load-local").disabled = true;
    $("#local-status").textContent = "Choose a .bin file.";
    return;
  }
  state.localFile = file;
  $("#load-local").disabled = false;
  const context = inferLocalContext(file.name);
  setBinaryDetails({ source: "Local File", filename: file.name, size: file.size, ...context, status: "Ready to load locally. This file will not be uploaded." });
  $("#local-status").textContent = `${file.name} · ${formatBytes(file.size)} · remains in this browser.`;
}

async function loadLocalFile() {
  const file = state.localFile;
  if (!file) return;
  $("#load-local").disabled = true;
  $("#local-status").textContent = `Reading ${file.name} locally…`;
  try {
    const arrayBuffer = await file.arrayBuffer();
    await processBinary(arrayBuffer, { source: "Local File", filename: file.name, ...inferLocalContext(file.name) });
    $("#local-status").textContent = `Loaded ${arrayBuffer.byteLength.toLocaleString()} bytes locally. No upload was made.`;
  } catch (error) {
    $("#local-status").textContent = error.message;
    setBinaryDetails({ source: "Local File", filename: file.name, size: file.size, status: `Load failed: ${error.message}` });
  } finally {
    $("#load-local").disabled = false;
  }
}

function activateMode(mode) {
  const cloud = mode === "cloud";
  $("#cloud-mode").hidden = !cloud;
  $("#local-mode").hidden = cloud;
  $("#cloud-tab").classList.toggle("active", cloud);
  $("#local-tab").classList.toggle("active", !cloud);
  $("#cloud-tab").setAttribute("aria-selected", cloud ? "true" : "false");
  $("#local-tab").setAttribute("aria-selected", cloud ? "false" : "true");
}

async function init() {
  try {
    const response = await fetch(INDEX_URL, { cache: "no-store" });
    if (!response.ok) throw new Error(`Index request failed (${response.status})`);
    const index = await response.json();
    if (!Array.isArray(index.records)) throw new Error("Index is missing its records array");
    state.records = index.records.slice().sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    renderOverview();
    renderList();
    renderHistory();
  } catch (error) {
    $("#index-status").textContent = "INDEX UNAVAILABLE";
    $("#record-list").innerHTML = `<div class="empty-state">Could not load the data index: ${error.message}. Check <code>data/index.json</code>.</div>`;
    $("#updated-at").textContent = "INDEX · OFFLINE";
  }
  fetchCloudFiles();
}

$("#search").addEventListener("input", (event) => renderList(event.target.value));
$("#series-controls").addEventListener("click", (event) => {
  const button = event.target.closest("[data-series]");
  if (!button) return;
  state.series = button.dataset.series;
  document.querySelectorAll("[data-series]").forEach((element) => element.classList.toggle("active", element === button));
  drawChart();
});
$("#cloud-tab").addEventListener("click", () => activateMode("cloud"));
$("#local-tab").addEventListener("click", () => activateMode("local"));
$("#cloud-device").addEventListener("change", fetchCloudFiles);
$("#cloud-file").addEventListener("change", updateCloudDownload);
$("#load-cloud").addEventListener("click", loadCloudFile);
$("#browse-local").addEventListener("click", () => $("#local-file").click());
$("#drop-zone").addEventListener("click", () => $("#local-file").click());
$("#drop-zone").addEventListener("keydown", (event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); $("#local-file").click(); } });
$("#local-file").addEventListener("change", (event) => chooseLocalFile(event.target.files[0]));
$("#load-local").addEventListener("click", loadLocalFile);
$("#drop-zone").addEventListener("dragover", (event) => { event.preventDefault(); $("#drop-zone").classList.add("dragging"); });
$("#drop-zone").addEventListener("dragleave", () => $("#drop-zone").classList.remove("dragging"));
$("#drop-zone").addEventListener("drop", (event) => {
  event.preventDefault();
  $("#drop-zone").classList.remove("dragging");
  chooseLocalFile(event.dataTransfer.files[0]);
});
$("#raw-download-link").addEventListener("click", (event) => { if (event.currentTarget.getAttribute("aria-disabled") === "true") event.preventDefault(); });
window.addEventListener("resize", drawChart);
init();
