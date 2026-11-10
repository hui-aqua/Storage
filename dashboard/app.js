const INDEX_URL = new URL("data/index.json", document.baseURI);
const REPO_RAW = "https://raw.githubusercontent.com/hui-aqua/Storage/main/";
const COLORS = { x: "#54d4c1", y: "#6eb6ff", z: "#f2b968" };
const state = { records: [], selected: null, points: null };
const $ = (selector) => document.querySelector(selector);

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** exponent).toFixed(exponent > 0 ? 1 : 0)} ${units[exponent]}`;
}

function formatDate(value, options = {}) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value || "Unknown time";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short", timeZone: "UTC", ...options }).format(date);
}

function fileUrl(record) {
  if (record.url) return record.url;
  if (record.path) return new URL(record.path.split("/").map(encodeURIComponent).join("/"), REPO_RAW).href;
  return "#";
}

function renderList(query = "") {
  const list = $("#record-list");
  const filtered = state.records.filter((record) => `${record.device_id} ${record.filename} ${record.timestamp}`.toLowerCase().includes(query.toLowerCase()));
  $("#list-count").textContent = String(filtered.length).padStart(2, "0");
  if (!filtered.length) {
    list.innerHTML = `<div class="empty-state">${state.records.length ? "No measurements match this filter." : "No measurements are indexed yet. Once upload records are published to <code>data/index.json</code>, they will appear here."}</div>`;
    return;
  }
  list.replaceChildren(...filtered.map((record) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `record-item${state.selected === record ? " selected" : ""}`;
    button.innerHTML = `<span class="record-name"></span><span class="record-size"></span><span class="record-meta"></span><span class="record-badge">50 HZ</span>`;
    button.querySelector(".record-name").textContent = record.filename || "measurement.bin";
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
    const values = ["PUBLISHED", record.device_id || "device", formatDate(record.timestamp), record.filename || "measurement.bin", formatBytes(Number(record.size_bytes)), record.sha256 ? `${record.sha256.slice(0, 12)}…` : "—"];
    values.forEach((value, index) => {
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
    link.setAttribute("aria-label", `Download ${record.filename || "measurement"}`);
    link.setAttribute("download", record.filename || "measurement.bin");
    action.append(link); row.append(action);
    return row;
  }));
}

function renderOverview() {
  const total = state.records.reduce((sum, record) => sum + (Number(record.size_bytes) || 0), 0);
  const latest = state.records[0];
  $("#metric-count").textContent = state.records.length.toLocaleString();
  $("#metric-volume").textContent = formatBytes(total);
  $("#metric-latest").textContent = latest ? formatDate(latest.timestamp, { dateStyle: "short", timeStyle: "short" }) : "No uploads";
  $("#device-label").textContent = latest ? `Latest device · ${latest.device_id || "unknown"}` : "Waiting for first indexed record";
  $("#updated-at").textContent = `INDEX · ${state.records.length} RECORD${state.records.length === 1 ? "" : "S"}`;
  $("#index-status").textContent = "PUBLIC INDEX · CONNECTED";
}

function decodeCsv(text) {
  return text.trim().split(/\r?\n/).map((line) => line.split(/[;,\s]+/).map(Number)).filter((row) => row.length >= 3 && row.slice(0, 3).every(Number.isFinite)).map((row) => row.slice(0, 3));
}

async function loadSamples(record) {
  const response = await fetch(fileUrl(record));
  if (!response.ok) throw new Error(`Unable to download sample file (${response.status})`);
  if (record.format === "csv") return decodeCsv(await response.text());
  if (record.format === "json") {
    const payload = await response.json();
    return Array.isArray(payload) ? payload : payload.samples;
  }
  const buffer = await response.arrayBuffer();
  const view = new DataView(buffer);
  const triplets = Math.floor(buffer.byteLength / 12);
  const stride = Math.max(1, Math.ceil(triplets / 2000));
  const rows = [];
  for (let i = 0; i < triplets; i += stride) {
    const offset = i * 12;
    rows.push([view.getFloat32(offset, true), view.getFloat32(offset + 4, true), view.getFloat32(offset + 8, true)]);
  }
  return rows;
}

async function selectRecord(record) {
  state.selected = record;
  state.points = null;
  renderList($("#search").value);
  $("#chart-title").textContent = record.filename || "Measurement";
  $("#chart-subtitle").textContent = `${record.device_id || "device"} · ${formatDate(record.timestamp)} · ${record.sampling_frequency || 50} Hz`;
  $("#chart-unit").textContent = `Acceleration (${record.unit || "m/s²"})`;
  $("#chart-range").textContent = `${formatBytes(Number(record.size_bytes))} · ${record.format || "float32le_xyz"}`;
  const download = $("#download-link");
  download.href = fileUrl(record); download.download = record.filename || "measurement.bin";
  download.classList.remove("disabled"); download.removeAttribute("aria-disabled");
  $("#plot-empty").style.display = "flex";
  $("#plot-empty").querySelector("strong").textContent = "Loading waveform…";
  $("#plot-empty").querySelector("span:last-child").textContent = "Reading the public measurement file.";
  try {
    const points = await loadSamples(record);
    if (state.selected !== record) return;
    if (!Array.isArray(points) || !points.length || points.some((row) => !Array.isArray(row) || row.length < 3 || row.slice(0, 3).some((v) => !Number.isFinite(Number(v))))) throw new Error("File does not match its declared XYZ sample format");
    state.points = points;
    $("#plot-empty").style.display = "none";
    $("#sample-info").textContent = `${points.length.toLocaleString()} displayed samples · ${record.sampling_frequency || 50} Hz`;
    drawChart();
  } catch (error) {
    $("#plot-empty").style.display = "flex";
    $("#plot-empty").querySelector("strong").textContent = "Waveform unavailable";
    $("#plot-empty").querySelector("span:last-child").textContent = error.message;
    $("#sample-info").textContent = "File remains available for download";
  }
}

function drawChart() {
  const canvas = $("#chart"), rect = canvas.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.floor(rect.width * dpr); canvas.height = Math.floor(rect.height * dpr);
  const ctx = canvas.getContext("2d"); ctx.scale(dpr, dpr);
  const width = rect.width, height = rect.height, pad = { left: 48, right: 13, top: 16, bottom: 25 };
  ctx.clearRect(0, 0, width, height);
  if (!state.points?.length) return;
  const points = state.points;
  const vals = points.flatMap((row) => row.slice(0, 3).map(Number)).filter(Number.isFinite);
  let min = Math.min(...vals), max = Math.max(...vals);
  if (min === max) { min -= 1; max += 1; }
  const margin = (max - min) * .08; min -= margin; max += margin;
  const plotW = width - pad.left - pad.right, plotH = height - pad.top - pad.bottom;
  ctx.font = '9px "DM Mono", monospace'; ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const y = pad.top + plotH * i / 4, value = max - (max - min) * i / 4;
    ctx.strokeStyle = "rgba(81,111,125,.22)"; ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(width - pad.right, y); ctx.stroke();
    ctx.fillStyle = "#718995"; ctx.textAlign = "right"; ctx.fillText(value.toFixed(2), pad.left - 8, y + 3);
  }
  for (let axis = 0; axis < 3; axis++) {
    ctx.strokeStyle = [COLORS.x, COLORS.y, COLORS.z][axis]; ctx.lineWidth = 1.5; ctx.beginPath();
    let started = false;
    points.forEach((row, index) => {
      const value = Number(row[axis]); if (!Number.isFinite(value)) return;
      const x = pad.left + (points.length === 1 ? 0 : plotW * index / (points.length - 1));
      const y = pad.top + (max - value) * plotH / (max - min);
      if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
    });
    ctx.stroke();
  }
  ctx.fillStyle = "#718995"; ctx.textAlign = "left"; ctx.fillText("0 s", pad.left, height - 7); ctx.textAlign = "right";
  const seconds = Math.max(0, points.length - 1) / Number(state.selected.sampling_frequency || 50);
  ctx.fillText(`${seconds.toFixed(1)} s`, width - pad.right, height - 7);
}

async function init() {
  try {
    const response = await fetch(INDEX_URL, { cache: "no-store" });
    if (!response.ok) throw new Error(`Index request failed (${response.status})`);
    const index = await response.json();
    if (!Array.isArray(index.records)) throw new Error("Index is missing its records array");
    state.records = index.records.slice().sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    renderOverview(); renderList(); renderHistory();
  } catch (error) {
    $("#index-status").textContent = "INDEX UNAVAILABLE";
    $("#record-list").innerHTML = `<div class="empty-state">Could not load the data index: ${error.message}. The dashboard shell is online; check the published <code>data/index.json</code> file.</div>`;
    $("#updated-at").textContent = "INDEX · OFFLINE";
  }
}

$("#search").addEventListener("input", (event) => renderList(event.target.value));
window.addEventListener("resize", drawChart);
init();
