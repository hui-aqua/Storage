from __future__ import annotations

import hashlib
import os
import re
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
async def upload(file: UploadFile = File(...), device_id: str = Form(...), timestamp: str = Form(...), sampling_frequency: int = Form(...), measurement_type: str = Form(...), file_format: str = Form(...), authorization: str | None = Header(default=None)) -> dict[str, object]:
    if authorization != f"Bearer {DEVICE_API_KEY}":
        raise HTTPException(status_code=401, detail="Invalid device API key")
    if not SAFE_ID.fullmatch(device_id):
        raise HTTPException(status_code=422, detail="Invalid device_id")
    if sampling_frequency != 50 or measurement_type != "acceleration" or file_format != "binary":
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
    digest = hashlib.sha256(content).hexdigest()
    filename = Path(file.filename or "measurement.bin").name
    destination = DATA_DIR / device_id / captured.astimezone(timezone.utc).strftime("%Y/%m/%d") / filename
    destination.parent.mkdir(parents=True, exist_ok=True)
    if destination.exists() and hashlib.sha256(destination.read_bytes()).hexdigest() != digest:
        raise HTTPException(status_code=409, detail="Filename already exists with different content")
    if not destination.exists():
        destination.write_bytes(content)
    return {"status": "success", "device_id": device_id, "filename": filename, "size_bytes": len(content), "sha256": digest, "storage": "local-test", "path": destination.as_posix()}
