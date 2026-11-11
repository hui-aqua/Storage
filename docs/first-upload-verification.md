# Upload smoke verification

See [development setup and API contracts](../DEVELOPER_MANUAL.md) for starting FastAPI or Wrangler on port 8787. The smoke script targets that port with Bearer key `dev-test-key`; configure the selected backend accordingly.

## Run

From the repository root, with the server running in another terminal:

```powershell
python scripts/make_test_file.py
powershell -ExecutionPolicy Bypass -File scripts/verify_local_upload.ps1
```

The fixture is 5,242,880 bytes with SHA-256 `2e7cab6314e9614b6f2da12630661c3038e5592025f6534ba5823c3b340a1cb6`. Compare these values with the success response. For FastAPI, check the returned filesystem path. For Wrangler, storage is local R2 emulation unless explicitly configured otherwise.

The script submits device `device_001`, timestamp `2026-11-10T08:00:00Z`, frequency `50`, measurement type `acceleration` and format `binary`. This device can upload but is outside the Worker read allowlist (CS01-CS04 and CS3_01-CS3_04). The payload is arbitrary deterministic bytes, not a CoreS3 recording; it must not be used to verify decoding.

## Scope and further checks

The script sends one request, throws on non-success and prints JSON. It does not assert the returned digest, verify a downloaded copy, or exercise rejection cases. To verify the full contract, separately check missing/wrong credentials, invalid metadata, empty/oversized payloads and same-key different-content conflicts. Repeating identical content should succeed.

Production binary storage is private R2 behind the Worker, not GitHub Contents API. A remote round trip requires the deployed Worker, configured secret and a read-compatible device/key. Neither backend publishes measurements or updates data/index.json.

## SUMMARY snapshot verification

The legacy arbitrary-payload smoke script does not exercise SUMMARY upload. Run `node scripts/test_summary_workflow.cjs` for generated legacy v1/v2 and 1 Hz v3 SUMMARY files through the Worker handlers and paginated R2 double, and `.\.venv\Scripts\python.exe scripts/test_local_summary.py` for the local API handler with temporary disk storage. Fields and CRC conventions are documented in the Developer Manual. Live upload verification must use a real SUMMARY binary, matching header device, summary_hz, date, crc32 and size_bytes.

Current firmware sends file_format=cs3_summary_v3, summary_hz=1 and sampling_frequency=1. V3 upload also validates header summary_hz=1, time_basis=1 and at least one aligned record; the 75-byte/90-byte sizes alone do not identify v3. The server retains legacy v1/v2 compatibility, although the current device uploader selects only v3.
