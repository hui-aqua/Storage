# M5Stack Marine Motion Logger

CoreS3 logs motion from a BMI270 IMU to the SD card and presents published daily measurements in a static GitHub Pages dashboard. The data contract is designed for 100 Hz acquisition: permanent 22-byte raw records plus a 10 Hz daily summary CSV. Each device writes under `/motion/` using its configured device ID.

## On-device daily files

- `CS3_01_RAW_YYYYMMDD.bin`: metadata followed by packed little-endian records containing extended BMI270 sensor time, signed accelerometer and gyroscope counts, and validity/saturation/overflow/time flags. RAW files stay on the SD card permanently and are never sent by the daily uploader.
- `CS3_01_SUMMARY_YYYYMMDD.csv`: one row per ten decoded raw samples, with UTC and sensor time, signed axis means converted to g and °/s, absolute axis and magnitude peaks, temperature, battery voltage, saturation flags, and missed sample count.
- Before UTC is synchronized, both files use `_unsynced` names. On synchronization, logging transitions to the UTC-day files.
- At each daily upload, the device POSTs only the previous UTC day's summary, once per day. Wi-Fi is turned off after the attempt; a successful 2xx response is persisted to prevent re-upload.

The RAW record layout and decoding rules are specified in [the data format guide](docs/dashboard-data-format.md). Firmware should retain raw integer counts without averaging or scaling; conversion belongs in SUMMARY generation and the dashboard display.

## Dashboard and publication

The dashboard in `dashboard/` reads `data/index.json` and displays indexed daily summaries with downloadable summary files and RAW file metadata/links where present. GitHub Pages deploys on pushes to `main`. Publicly indexed data, file contents, and commit history are accessible to anyone; do not publish sensitive locations or credentials. The upload API currently stores verified uploads locally for development and does not write to GitHub.

## Local upload API development

Requires Python 3.10+. From the repository root:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r backend/requirements.txt
$env:DEVICE_API_KEY = 'dev-test-key'
uvicorn app.main:app --app-dir backend --host 127.0.0.1 --port 8000
```

The API endpoint is `POST /api/v1/upload`; set `DEVICE_API_KEY` to a deployment secret and use HTTPS in production. The dashboard data index schema and sample format are in [docs/dashboard-data-format.md](docs/dashboard-data-format.md).
