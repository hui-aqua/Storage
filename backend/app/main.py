from __future__ import annotations

import hashlib
import json
import os
import re
import struct
import zlib
from datetime import datetime, timezone
from pathlib import Path

from fastapi import FastAPI, File, Form, Header, HTTPException, UploadFile

MAX_FILE_BYTES = 10 * 1024 * 1024
DATA_DIR = Path(os.getenv("DATA_DIR", "data/uploads"))
DEVICE_API_KEY = os.getenv("DEVICE_API_KEY", "dev-test-key")
SAFE_ID = re.compile(r"^[A-Za-z0-9_-]{1,64}$")
app = FastAPI(title="Marine Data Logger Upload API", version="0.1.0")

@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}

@app.post("/api/v1/upload")
async def upload(file: UploadFile = File(...), device_id: str = Form(...), timestamp: str = Form(...), sampling_frequency: int | None = Form(None), measurement_type: str = Form(...), file_format: str = Form(...), summary_hz: int | None = Form(None), date: str | None = Form(None), crc32: str | None = Form(None), size_bytes: str | None = Form(None), authorization: str | None = Header(default=None)) -> dict[str, object]:
    if authorization != f"Bearer {DEVICE_API_KEY}":
        raise HTTPException(status_code=401, detail="Invalid device API key")
    if not SAFE_ID.fullmatch(device_id):
        raise HTTPException(status_code=422, detail="Invalid device_id")
    is_summary = measurement_type == "motion_summary"
    if not is_summary and (sampling_frequency != 50 or measurement_type != "acceleration" or file_format != "binary"):
        raise HTTPException(status_code=422, detail="Unexpected measurement metadata")
    try:
        captured = datetime.fromisoformat(timestamp.replace("Z", "+00:00"))
        if captured.tzinfo is None:
            raise ValueError("timezone required")
    except ValueError as exc:
        raise HTTPException(status_code=422, detail="timestamp must be ISO-8601 with timezone") from exc
    if Path(file.filename or "").suffix.lower() != ".bin":
        raise HTTPException(status_code=422, detail="Only .bin files are accepted")
    content = await file.read(MAX_FILE_BYTES + 1)
    if len(content) > MAX_FILE_BYTES:
        raise HTTPException(status_code=413, detail="File exceeds 10 MiB limit")
    if not content:
        raise HTTPException(status_code=422, detail="Empty file")
    if content.startswith(b"CS3RAW01"):
        raise HTTPException(status_code=422, detail="RAW uploads are not supported")
    digest = hashlib.sha256(content).hexdigest()
    filename = Path(file.filename or "measurement.bin").name
    if is_summary:
        hz = summary_hz if summary_hz is not None else sampling_frequency
        actual_crc = f"{zlib.crc32(content):08x}"
        if hz not in (1, 10) or (sampling_frequency is not None and sampling_frequency != hz):
            raise HTTPException(status_code=422, detail="Invalid or conflicting SUMMARY frequency")
        if not re.fullmatch(r"(?:CS0[1-4]|CS3_0[1-4])", device_id):
            raise HTTPException(status_code=422, detail="Unsupported SUMMARY device")
        if date != captured.astimezone(timezone.utc).strftime("%Y-%m-%d"):
            raise HTTPException(status_code=422, detail="date must match timestamp UTC date")
        if crc32 is None or not re.fullmatch(r"[a-fA-F0-9]{8}", crc32) or crc32.lower() != actual_crc:
            raise HTTPException(status_code=422, detail="CRC32 mismatch or invalid CRC32")
        if size_bytes is None or not re.fullmatch(r"[0-9]+", size_bytes) or int(size_bytes) != len(content):
            raise HTTPException(status_code=422, detail="size_bytes mismatch")
        if len(content) < 32:
            raise HTTPException(status_code=422, detail="Truncated SUMMARY header")
        version, header_bytes, record_bytes = struct.unpack_from("<HHH", content, 8)
        expected = {1: 32, 2: 75, 3: 75}.get(version)
        header_device = content[16:32].split(b"\0", 1)[0].decode("utf-8", errors="replace").strip()
        if (content[:8] != b"CS3SUM01" or expected is None or header_bytes != expected
                or len(content) < header_bytes or record_bytes != 90 or (len(content) - header_bytes) % 90
                or header_device != device_id or file_format != f"cs3_summary_v{version}"):
            raise HTTPException(status_code=422, detail="Invalid SUMMARY header, device, format or record alignment")
        if version == 3 and (hz != 1 or struct.unpack_from("<H", content, 14)[0] != 1 or content[70] != 1):
            raise HTTPException(status_code=422, detail="Invalid SUMMARY v3 rate/time basis or metadata conflict")
        if version == 3 and len(content) == header_bytes:
            raise HTTPException(status_code=422, detail="SUMMARY v3 upload requires at least one complete window")
        destination = DATA_DIR / device_id / date.replace("-", "/") / f"{actual_crc}.bin"
        destination.parent.mkdir(parents=True, exist_ok=True)
        exists = destination.exists()
        if exists and hashlib.sha256(destination.read_bytes()).hexdigest() != digest:
            raise HTTPException(status_code=409, detail="CRC32 identity collision")
        metadata = {"device_id": device_id, "date": date, "timestamp": timestamp, "summary_hz": hz,
                    "sampling_frequency": hz, "measurement_type": measurement_type, "file_format": file_format,
                    "crc32": actual_crc, "sha256": digest, "size_bytes": len(content), "original_filename": filename,
                    "firmware": content[32:48].split(b"\0", 1)[0].decode("utf-8", errors="replace").strip() if version >= 2 else "",
                    "created_utc": content[48:69].split(b"\0", 1)[0].decode("utf-8", errors="replace").strip() if version >= 2 else "",
                    "format_version": version, "time_basis": 1 if version == 3 else None,
                    "timestamp_semantics": "exclusive completed-window end" if version == 3 else "legacy emission time",
                    "record_count": (len(content) - header_bytes) // 90,
                    "represented_duration_seconds": ((len(content) - header_bytes) // 90) / hz}
        if not exists:
            destination.write_bytes(content)
            destination.with_suffix(".metadata.json").write_text(json.dumps(metadata, indent=2), encoding="utf-8")
        elif destination.with_suffix(".metadata.json").exists():
            metadata = json.loads(destination.with_suffix(".metadata.json").read_text(encoding="utf-8"))
        result = "ALREADY_EXISTS" if exists else "STORED"
        return {**metadata, "status": result, "result": result, "filename": filename, "storage": "local-test", "path": destination.as_posix()}
    destination = DATA_DIR / device_id / captured.astimezone(timezone.utc).strftime("%Y/%m/%d") / filename
    destination.parent.mkdir(parents=True, exist_ok=True)
    if destination.exists() and hashlib.sha256(destination.read_bytes()).hexdigest() != digest:
        raise HTTPException(status_code=409, detail="Filename already exists with different content")
    if not destination.exists():
        destination.write_bytes(content)
    return {"status": "success", "device_id": device_id, "filename": filename, "size_bytes": len(content), "sha256": digest, "storage": "local-test", "path": destination.as_posix()}
