# M5Stack Marine Motion Logger

CoreS3 logs motion from a BMI270 IMU to the SD card and presents published daily measurements in a static GitHub Pages dashboard. The data contract is designed for 100 Hz acquisition: permanent 22-byte raw records plus a 10 Hz daily summary CSV. Each device writes under `/motion/` using its configured device ID.

## On-device daily files

- `CS3_01_RAW_YYYYMMDD.bin`: metadata followed by packed little-endian records containing extended BMI270 sensor time, signed accelerometer and gyroscope counts, and validity/saturation/overflow/time flags. The existing CoreS3 HTTPS upload API stores measurement `.bin` files in private R2; they are not stored in GitHub.
- `CS3_01_SUMMARY_YYYYMMDD.csv`: one row per ten decoded raw samples, with UTC and sensor time, signed axis means converted to g and °/s, absolute axis and magnitude peaks, temperature, battery voltage, saturation flags, and missed sample count.
- Before UTC is synchronized, both files use `_unsynced` names. On synchronization, logging transitions to the UTC-day files.
- The existing CoreS3 upload request remains `POST /api/v1/upload`; the Worker retains its current authentication and metadata contract. Wi-Fi is turned off after the attempt; a successful 2xx response is persisted to prevent re-upload.

The RAW record layout and decoding rules are specified in [the data format guide](docs/dashboard-data-format.md). Firmware should retain raw integer counts without averaging or scaling; conversion belongs in SUMMARY generation and the dashboard display.

## Dashboard and publication

The dashboard in `dashboard/` is a read-only GitHub Pages viewer for indexed summary CSV files. RAW `.bin` files stay in the private Cloudflare R2 bucket and are listed/downloaded only through the Cloudflare Worker. GitHub Pages deploys on pushes to `main`; do not add measurement `.bin` files to the repository.

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

## Cloudflare Worker upload API

The deployable API entry point is `backend/worker/index.js`. It preserves the CoreS3 `POST /api/v1/upload` contract, stores `.bin` uploads in the private `UPLOADS` R2 bucket, and serves the viewer through `GET /api/v1/files?device=CS01` and `GET /api/v1/files/content?key=...`. Configure the `marine-motion-uploads` bucket in `wrangler.jsonc`, then set the upload API key with `npx wrangler secret put DEVICE_API_KEY`. Run locally with `npx wrangler dev` or deploy with `npx wrangler deploy`.

The dashboard's Local File mode reads selected files with `File.arrayBuffer()` and does not send them to the Worker. Cloud and local files share `dashboard/decoder.js`; it currently verifies only the `ArrayBuffer` because the exact CoreS3 binary header specification is not documented yet.
