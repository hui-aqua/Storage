# SUMMARY upload verification

See [development setup and API contracts](../DEVELOPER_MANUAL.md) for backend configuration, upload fields and CRC conventions.

## Automated checks

From the repository root, run the Worker handler checks with generated SUMMARY fixtures and in-memory R2 storage.

```powershell
node scripts/test_summary_workflow.cjs
```

After installing backend/requirements.txt in the virtual environment described in the Developer Manual, run the local FastAPI handler checks with temporary disk storage.

```powershell
.\.venv\Scripts\python.exe scripts/test_local_summary.py
```

These checks exercise versioned SUMMARY uploads, CRC validation, duplicate detection, growing same-day snapshots and rejection cases. The Worker checks also exercise paginated listing, snapshot selection and downloads.

## Live upload verification

Start FastAPI or Wrangler on port 8787 using the Developer Manual. Configure DEVICE_API_KEY for the selected backend. Use a real SUMMARY binary and submit the documented multipart fields with the matching header device, UTC date, CRC32 and byte count.

Current firmware sends file_format=cs3_summary_v3, summary_hz=1 and sampling_frequency=1. V3 uploads require header summary_hz=1, time_basis=1 and at least one aligned record. Legacy v1/v2 uploads remain supported.

1. Upload the recording and verify STORED, size, CRC32 and record count.
2. Repeat identical content and verify ALREADY_EXISTS with the same storage path.
3. Upload a larger valid same-day snapshot and verify STORED under a separate CRC32 key.
4. With the Worker, list the device recordings and download both snapshots. Compare downloaded bytes with each original.
5. Check missing/wrong credentials, metadata mismatches, invalid CRC and empty/oversized payloads against the documented error responses.

FastAPI writes to local disk. Wrangler development uses local R2 emulation by default. Production verification requires the deployed Worker, its configured secret and a read-compatible device/key. Neither backend publishes measurements or updates data/index.json.
