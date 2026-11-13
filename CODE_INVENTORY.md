# Current source inventory

Inventory date: 2026-11-13. Source was read before the manuals. Scope is this checkout, not sibling firmware or deployed infrastructure. No application source was changed. Line references refer to the source at audit time.

## Files and interaction

| Files | Current role and evidence |
|---|---|
| `dashboard/index.html`, `dashboard/style.css` | Single static viewer page, deferred decoder then app scripts; responsive canvas, themes, local/cloud controls, statistics, metadata and diagnostics (`index.html:2-16`, `style.css:1-8`). |
| `dashboard/decoder.js` | DOM-free IIFE exposing three globals shared by browser and Worker (`decoder.js:174-176`). |
| `dashboard/app.js` | Classic browser script; state, async loading, formatting, chart, statistics and events. Starts `init()`, theme/layout handling and `initDevices()` at script evaluation (`app.js:284-300`). |
| `dashboard/devices.json` | Nine IDs: CS01–CS04 and CS3_00–CS3_04. Worker imports at bundle time, FastAPI reads at import time, browser fetches at startup. |
| `backend/worker/index.js` | ES module default object with async `fetch(request, env)`; imports decoder and registry (`index.js:1-2,98-220`). Uploads to R2, public reads from R2. |
| `backend/app/main.py` | FastAPI app, local upload and health handlers; independent Python header checks and disk persistence (`main.py:14-104`). |
| `backend/app/__init__.py` | Empty package marker, no API. |
| `backend/.env.example` | Example key and DATA_DIR; application does not load this file automatically. |
| `data/index.json` | Separate published-CSV index: schema_version=1, records=[]; no producer in this checkout. |
| `scripts/test_viewer.cjs` | Generated binary fixtures and VM DOM/canvas/network doubles; optional real SUMMARY file (`:1-224`). |
| `scripts/test_summary_workflow.cjs` | Exported fixture builder and Worker/R2-double regression harness (`:5-24,25-114`). |
| `scripts/test_local_summary.py` | Direct FastAPI-handler tests with temporary storage (`:15-87`). |
| `package.json`, `package-lock.json` | Four npm scripts, Wrangler dev dependency and complete transitive lock. |
| `wrangler.jsonc` | Worker name, entry, compatibility date and R2 binding. |
| `.github/workflows/pages.yml` | Stages five viewer files plus index; deploys Pages on selected main pushes or manually. Does not run tests or deploy Worker. |
| `.gitignore` | Excludes dependencies, local environments, uploads, samples, credentials and Wrangler artifacts (`:1-11`). |
| Manuals and `docs/*.md` | Documentation only; audited after inventory. No other tracked runtime modules, service entry points, project CLI, firmware, migration, container, or test framework configuration. |

Data flow: local File → ArrayBuffer → decodeBinary → normalize/adopt → retained points/times → canvas/statistics. Cloud registry → GET list → GET content → decodeBinary with listing summary_hz → CRC check → same adoption path. Authenticated multipart upload → backend validation → CRC identity/SHA collision checks → R2 or local disk. Published index → URL/path → CSV reader (currently broken). Uploads do not publish to GitHub or update the index.

## Public callable interfaces

No application classes exist. Browser helper functions are globals of a classic script but form an internal UI implementation, not a separately packaged API.

| Interface | Parameters/defaults | Return and errors |
|---|---|---|
| `globalThis.decodeBinary(buffer, options = {})` (`decoder.js:55`) | ArrayBuffer required; options.summaryHz optional, numeric-coerced 1 or 10 for SUMMARY, v3 must agree with embedded 1; options.allRecords truthy bypasses sampling. Other option keys ignored. | Object: status='decoded', decoded=true, kind, header, recordCount, plottedCount, stride, tailBytes, damaged, points, representedDurationSeconds, timestampSpanSeconds, timestampsValid, monotonicValid, monotonicSpanSeconds, windowCoverageSeconds, message (`:137`). TypeError for non-ArrayBuffer; Error prefixed 'Invalid CoreS3 binary:' for invalid/truncated magic/version/header/range/rate/record size or SUMMARY metadata conflict (`:13-47,63-66`). Tails and invalid timestamps are reported, not thrown. Empty valid headers decode. |
| `globalThis.binaryCsv(buffer, options = {})` (`decoder.js:140`) | Same decode options; forces allRecords=true. Optional timeZone used for SUMMARY through Intl.DateTimeFormat; ignored for RAW. | CRLF CSV string; all values quoted, nullish empty, header_ metadata, record_index, point fields, optional record_time_local. Includes completeRecords/trailingBytes in metadata. Decoder errors propagate; invalid timezone can raise RangeError. Empty files export a metadata/index header without point columns. |
| `globalThis.motionCrc32(buffer)` (`decoder.js:167,174`) | Bytes read via new Uint8Array(buffer); normal caller supplies ArrayBuffer. | Eight lowercase hex digits, CRC-32/IEEE reflected polynomial 0xedb88320, initial/final XOR 0xffffffff. Typed-array constructor errors propagate; no explicit input validation. |
| Worker default `async fetch(request, env)` (`index.js:99`) | Web Request; env.DEVICE_API_KEY and env.UPLOADS. No defaults. | Promise<Response>; JSON or streamed binary. Routes/errors below; storage/runtime failures are not caught globally. |
| `health() -> dict[str, str]` (`main.py:22`) | None. | {'status':'ok'}; no storage or credential probe. |
| `async upload(...) -> dict[str, object]` (`main.py:26`) | Exact signature below. | JSON-compatible dict; raises HTTPException for deliberate 401/409/413/422 branches. Filesystem, sidecar JSON and other unexpected errors propagate. Framework validation may reject requests before handler execution. |
| `summaryFixture({version=2, hz=1, count=5, device='CS3_03', invalidUtc=false, windows=null}={})` (`test_summary_workflow.cjs:5,24`) | Test-only export; generated fixtures, no production API. | ArrayBuffer; allocation/DataView errors possible for invalid fixture arguments. |

Exact Python signature (FastAPI declarations are request dependencies, not ordinary None defaults):

```python
async def upload(file: UploadFile = File(...), device_id: str = Form(...), timestamp: str = Form(...), sampling_frequency: int | None = Form(None), measurement_type: str = Form(...), file_format: str = Form(...), summary_hz: int | None = Form(None), date: str | None = Form(None), crc32: str | None = Form(None), size_bytes: str | None = Form(None), authorization: str | None = Header(default=None)) -> dict[str, object]
```

## Internal function coverage

All production functions were read. Internal helpers have no independent supported caller contract; their relevant returns and side effects are recorded here to cover extension points.

| Module | Functions and behavior |
|---|---|
| Decoder | `fixedText(bytes, offset, length)` → trimmed NUL-terminated UTF-8; `headerError(message)` throws; `parseHeader(buffer)` → {header,bytes,view}; nested `recordTime(point)` formats SUMMARY export time; `crc32(buffer)` exposed under motionCrc32. |
| Worker | `json(body,status=200)` → JSON Response; `error(detail,status)` → {detail} Response; `validTimestamp(value)` and `validR2Key(key)` → booleans; `withReadCors(request,response)` → response with read CORS headers; async `listFiles(request,env,url)` and `getFileContent(request,env,url)` → Response. |
| Browser URLs/input (`app.js:5-79`) | `$ = s => document.querySelector(s)`; `formatBytes(bytes)` → binary-unit label or '0 B'; `formatDate(value,options={})` → formatted date/default UTC or fallback; `workerContentUrl(key)`, `fileUrl(record)`, `fileUrlForRaw(record)` → URLs/#; `parseCsv(text)` → points or [] for fewer than two lines, otherwise currently ReferenceError; `renderHistory()` mutates DOM; async `loadSummary(record)` fetches text and parses, throws on non-OK; `selectedCloudFile()` → file/null; `setDownloadEnabled(enabled)` mutates link. |
| Browser values/formatting (`:88-143`) | `diagnostic(error)`, `notice(text)`, `fail(message,error)`, `link(id,url,name='')`, `setOriginal(url,name)` mutate DOM/URLs; `entries()` → enabled signal descriptors; `value(p,key)` → scalar, derived magnitude, boolean 0/1 or null; `displayParts(t,zone=displayTimeZone)` → Intl parts; `displayTimestamp(t,zone=displayTimeZone)` and `zoneDescription(t)` → strings; `updateTimeZoneLabel()` mutates DOM; `timeLabel(index,exact=false)` → timestamp/fallback label; `pointDetails(index)` → v3 explanatory string array; `normalize(points)` → UI points. Intl errors are not normalized by helpers. |
| Browser loading (`:144-188`) | `adopt(points,meta)` resets viewport/selection/export, sets normalized state and fallback clock, updates UI; async `openLocal(file)`, `selectRecord(record)`, `fetchCloudFiles()`, `loadCloudFile()` catch load errors into notices/diagnostics; `renderList(query='')` mutates DOM; `sortSnapshots(files)` → sorted copies with preferred flag; `updateCloudDownload()` mutates link. loadToken prevents stale adoption for recording opens; device equality guards cloud list results. |
| Browser analysis/rendering (`:189-228`) | `axisLabel(t,step)` → label; `timeTicks(start,end,width)` → {time,label}[]; `visibleSpan(a,b)` → label; `bounds()` and `analysisBounds()` → retained index pair; `selectionTimes(d)` → time endpoints; `clearSelection()`, `setRange(a,b)`, `update()`, `statistics()`, `drawChart()` mutate state/DOM/canvas; `xFraction(event)` → clamped fraction. |
| Browser gestures/startup (`:231-300`) | `inspectPoint(f)` selects nearest retained timestamp; `startGesture()` captures one/two-pointer state; `endDrag(e,cancelled=false)` finishes/cancels selection/pan/inspection; `applyTheme()` sets CSS theme/draws; async `init()` and `initDevices()` catch index/registry errors into diagnostics. Event callbacks bind wheel, pointer, keyboard, range, file/drop, cloud, export, theme and resize behavior. |

## Routes, configuration and validation

Worker routes (`backend/worker/index.js:98-220`):

| Method/path | Contract |
|---|---|
| GET /health | 200 {'status':'ok'}. |
| POST /api/v1/upload | Exact Bearer key; multipart fields below; 200 on storage and duplicate. 401 key missing/wrong; 400 unparsable multipart; 422 invalid fields/metadata/binary; 413 announced total >10 MiB+64 KiB or actual file >10 MiB; 503 absent UPLOADS; 409 differing existing identity. |
| GET /api/v1/files?device=ID | Public, registry-restricted. 400 unsupported device, 503 missing binding, otherwise {device,files}. Requests paginated R2 customMetadata (limit 1000), filters valid keys, merges metadata and normalizes selected fields. |
| GET /api/v1/files/content?key=KEY | Public strict key. 400 invalid, 503 missing binding, 404 absent; otherwise octet-stream attachment with content-length, private/no-store and nosniff. |
| OPTIONS /api/v1/files and /api/v1/files/content | 204, read CORS only. No equivalent upload preflight handler. |
| Other method/path | 404 {detail:'Not found'}, including unsupported methods on known routes. |

FastAPI explicitly registers only GET /health and POST /api/v1/upload (`main.py:21-26`). FastAPI(app title='Marine Data Logger Upload API', version='0.1.0') also supplies its framework-default OpenAPI/docs routes; these are not cloud read APIs. No CORS middleware, list or content route. Route/method/body errors also follow framework behavior.

| Setting | Value/default and source |
|---|---|
| DATA_DIR | Environment, 'data/uploads', resolved relative to process cwd (`main.py:15`). |
| DEVICE_API_KEY | Environment 'dev-test-key' for FastAPI (`main.py:16`); required Worker env secret with no fallback (`index.js:122`). |
| MAX_FILE_BYTES | 10*1024*1024 both backends (`main.py:14`, `index.js:4`). No viewer file-size limit in app code. |
| SAFE_ID | ASCII A-Z/a-z/0-9/_/- length 1–64; SUMMARY additionally in registry (`main.py:17,56`, `index.js:5,178`). |
| ALLOWED_ORIGINS | https://hui-aqua.github.io, http://localhost:8000, http://127.0.0.1:8000; read routes only. GET/OPTIONS, Content-Type, max age 86400; matching Origin echoed with Vary (`index.js:7-39`). This does not authenticate clients. |
| Worker config | name marine-motion-storage-api, main backend/worker/index.js, compatibility_date 2026-11-10, R2 binding UPLOADS to marine-motion-uploads (`wrangler.jsonc:3-10`). No vars, routes or assets block. |
| Browser constants | INDEX_URL=data/index.json relative to document.baseURI; REPO_RAW=https://raw.githubusercontent.com/hui-aqua/Storage/main/; WORKER_URL=https://marine-motion-storage-api.stavanger.workers.dev (`app.js:1-3`). |
| Viewer defaults | Acceleration, XYZ enabled, magnitude off, full range, no selection; Browser Local timezone; Pan gesture; light theme, persisted under localStorage motion-theme (`app.js:4,96-98,287`, `index.html:4,8,12`). Timezone/gesture are not persisted. |
| Plot cap | MAX_PLOT_POINTS=12000; stride=max(1,ceil(recordCount/12000)); allRecords export overrides (`decoder.js:5,99,141`). |

There is no project CLI parser. The viewer test alone accepts an optional positional process.argv[2] SUMMARY path, default data/samples/CS3_01_SUMMARY_20261111.bin (`test_viewer.cjs:193`); missing paths skip that check. Runtime tools (Python http.server, uvicorn, Wrangler) supply their own CLI flags.

Upload fields: required file/device_id/timestamp/measurement_type/file_format; SUMMARY needs date/crc32/size_bytes and either summary_hz or sampling_frequency, agreeing if both present. Legacy non-SUMMARY requires sampling_frequency=50, measurement_type=acceleration, file_format=binary. No validation of arbitrary legacy bytes except nonempty, <=10 MiB, .bin filename and rejection of CS3RAW01 magic. SUMMARY uses registry/header device match, explicit cs3_summary_v1/v2/v3, aligned 90-byte records, matching UTC date/whole-file CRC/size. V3 requires embedded rate=1/time_basis=1 and at least one record; legacy header-only upload allowed. Filename extension check ignores case, but Worker reads require lowercase .bin and a safe filename starting alphanumeric (`index.js:43`).

Worker timestamp validation is a T-separated ISO-shaped regex with seconds, optional fraction and Z/offset plus Date.parse (`index.js:24-26`); Python uses datetime.fromisoformat after replacing Z with +00:00 and requires tzinfo (`main.py:34-39`). They are not identical parsers. Neither compares upload date/timestamp to record UTC values. Decoder timestamp invalidity is reported in result rather than rejecting uploads. Python does not run JS record-clock checks.

## Storage and response schemas

SUMMARY identity is device/YYYY/MM/DD/crc32.bin. Worker stores string-valued customMetadata: sha256,crc32,device_id,date,timestamp,summary_hz,sampling_frequency,measurement_type,file_format,original_filename,size_bytes,record_count,represented_duration_seconds,firmware,created_utc,format_version,timestamp_semantics and v3 time_basis (`index.js:191-195`). Existing size/SHA mismatch returns 409. Python compares actual existing SHA, writes .metadata.json on first store, reuses a sidecar when present; sidecars use natural JSON numbers and null time_basis for legacy (`main.py:77-97`). Missing sidecars on duplicates are not recreated.

Worker SUMMARY response (`index.js:196`): status/result STORED or ALREADY_EXISTS; device_id,date,filename,size_bytes,crc32,sha256,summary_hz,sampling_frequency,file_format,format_version,time_basis,record_count,storage='r2',path. It omits much of customMetadata. On duplicates summary_hz comes from stored metadata but sampling_frequency and filename come from the new request: identical legacy bytes re-uploaded with a different valid rate can produce contradictory rate fields. Python returns metadata plus status/result/filename/storage='local-test'/path and generally reuses the sidecar. Neither backend has atomic get-then-put deduplication.

Legacy identity is device/YYYY/MM/DD/original-basename; SHA conflicts 409. Worker customMetadata contains only sha256,device_id,timestamp; response status='success',device_id,filename,size_bytes,sha256,storage,path (`index.js:199-218`). Python writes no legacy sidecar (`main.py:98-104`). Legacy uploads can use IDs/filenames not accepted by public reads.

Listing fields (`index.js:66`): all customMetadata, key, device_id, date, filename, size_bytes numeric, summary_hz numeric 1/10 or null, record_count converted with Number when present or null, uploaded ISO/null. Malformed nonnumeric stored record_count becomes NaN then JSON null; arbitrary numeric values are not semantically validated. Summary rate falls back to sampling_frequency only for motion_summary. Descending date, descending size, descending upload time, ascending key; one preferred entry per date. Preference is a heuristic, not measured completeness.

Index input (`app.js:22-39,288`): {schema_version:1,records:[]}. App validates records array only. Entries consume device_id,timestamp,filename,size_bytes,sha256,url/path,raw_key/raw_filename. URL wins over path; paths resolve against REPO_RAW. Raw associations are optional read links, not an upload feature. CSV loader is an incomplete active path: strips BOM, splits lines/commas, requires undeclared SUMMARY_COLUMNS for >=2 lines, maps UTC_time and six mean axes, filters finite axes. Ancillary normalization uses temperature,battery_voltage, peak fields,sample_count,missed_samples,saturation,sensor_time_us. No working canonical daily CSV schema exists in this code.

## Binary schema and time behavior

All numeric fields little endian; fixed text decoded/trimmed through first NUL (`decoder.js:7-52`).

| Kind/version | Magic | Header/record bytes | Header fields |
|---|---|---|---|
| RAW 1/2 | CS3RAW01 | 73/22, 81/22 | version u16@8, headerBytes u16@10, device text16@12, firmware text16@28, createdUtc text21@44, accRange i16@65, gyroRange i16@67, sampleRate u16@69, recordBytes u16@71; v2 timeValid u8@73 and droppedSamples u32@77. Positive ranges/rate required, no enforced 100 Hz. |
| SUMMARY 1/2/3 | CS3SUM01 | 32/90, 75/90, 75/90 | version u16@8, headerBytes u16@10, recordBytes u16@12, device text16@16; v2+ firmware text16@32, createdUtc text21@48, timeValid u8@69, droppedSamples u32@71; v3 summaryHz u16@14=1, timeBasis u8@70=1. Legacy reserved bytes ignored and header rate unknown unless option supplied. |

RAW record: t u64@0 decimal string; ax/ay/az i16@8/10/12 and gx/gy/gz i16@14/16/18, with counts retained and engineering values counts*range/32768; status u16@20. Bits 0/1 validate acceleration/gyro (invalid axes null); 2/3 saturation; 4 loss; 5 timeValid (`decoder.js:103-113`).

SUMMARY record (`decoder.js:115-133`): t u64@0 and sensorTimeUs u64@8 as strings; recordId u32@16; sampleCount u16@20; ax/ay/az i32@22/26/30 divided by 1000; accX/Y/Z/MagPeak u32@34/38/42/46 divided by 1e6; gx/gy/gz i32@50/54/58 divided by 1000; gyroX/Y/Z/MagPeak u32@62/66/70/74 divided by 1000; temperature i16@78 /100, -32768 null; batteryVoltage u16@80 /1000, 0 null; acc/gyroSaturated u8@82/83 nonzero boolean; missedSamples u32@84; status u16@88, bit5 timeValid. V3 adds bits0/1 accValid/gyroValid, bit4 loss, bit6 timingWarning, bit7 emptyIntervalGap, gapBefore and paired UTC/monotonic window start/end string fields. SUMMARY numeric axes are NOT masked by validity bits; saturation is decoded from bytes82/83, not status2/3.

All complete records are scanned for timestamp safety/nondecrease; SUMMARY requires per-record bit5 and UTC within range (v3 >=1000 ms; legacy >=1). V3 monotonic end must be safe, >=1000000 and strictly increasing. Gaps are bit7 or a monotonic delta unequal to 1000000; a prefix array propagates omitted gaps through sampling. Decoder reports rather than rejects bad clocks. UTC endpoint span uses all complete records when valid; v3 monotonic span likewise. representedDurationSeconds=count/rate or null; v3 windowCoverageSeconds=preferred valid endpoint span+1 for nonempty records (`decoder.js:73-99`).

App clocks (`app.js:144-175`): RAW sensor, valid SUMMARY UTC, otherwise v3 valid monotonic, otherwise legacy metadata-derived nominal relative time, otherwise index. V3 never infers elapsed time from count/rate. UTC timezone formatting is display-only, but SUMMARY CSV export adds a formatted record_time_local column when timeZone supplied. Header timeValid does not override record flags. UI metadata overwrites timeBasis with selected chart clock and keeps binary field under headerTimeBasis.

Statistics use selected time interval if one exists, otherwise visible retained indices; finite values only, unweighted mean/RMS/min/max/absolute peak (`app.js:216-227`). Selection persists through viewport changes and is cleared on adoption/clear/Escape. Reset zoom does not clear it. Decimation can omit peaks/final record and does not refine on zoom. Original buffers are retained for complete-record export.

## Dependencies, commands and validation

| Area | Declared/pinned versions and commands |
|---|---|
| Node | package.json devDependency wrangler ^4.160.0; lock pins 4.160.0 with Node engine >=22.12.0 (`package-lock.json:1514-1537`). Transitive versions are locked in package-lock.json, including workerd 1.20261110.1. No frontend runtime dependency or top-level engines declaration. |
| Python | fastapi>=0.115,<1; uvicorn[standard]>=0.30,<1; python-multipart>=0.0.9,<1 (`backend/requirements.txt:1-3`). No Python lock or formal requires-python; union annotations require Python 3.10+. |
| npm scripts | npm test → node scripts/test_viewer.cjs && node scripts/test_summary_workflow.cjs; worker:build → wrangler deploy --dry-run --outdir .wrangler/build; worker:dev → wrangler dev; worker:deploy → wrangler deploy (`package.json:4-8`). |
| Local viewer | python -m http.server 8000 --directory dashboard; serves binary viewer and registry, but not repository data/index.json at requested /data/index.json. Pages-equivalent staging must copy index.html,app.js,decoder.js,devices.json,style.css plus data/index.json. |
| Python service | Install requirements; set environment before import; uvicorn app.main:app --app-dir backend --host 127.0.0.1 --port 8787. .env.example is illustrative, not autoloaded. |
| Python checks | .\.venv\Scripts\python.exe scripts/test_local_summary.py; not included in npm test or Pages workflow. |
| Syntax | node --check dashboard/app.js; node --check dashboard/decoder.js. |
| Deployment | npm run worker:deploy explicitly publishes Worker; Pages workflow separate. Workflow uses checkout@v4, configure-pages@v5, upload-pages-artifact@v3, deploy-pages@v4. Needs external account/bucket/Pages settings; source cannot establish these. |

Verification on this checkout: Node v24.16.0, Python 3.12.12. npm.cmd test PASS, including available ignored field file (12,244 original records/6,122 retained); Python handler script PASS; both JS syntax checks PASS; npm.cmd run worker:build PASS after running the local dry-run outside the filesystem sandbox (initial sandbox denied log/parent-directory access). No deployment or live API calls. npm.ps1 was blocked by PowerShell execution policy; npm.cmd worked.

Read-only targeted probes confirmed undefined SUMMARY_COLUMNS, unmasked invalid v3 axes and duplicate legacy rate inconsistency (stored summary_hz=1 while response sampling_frequency=10). Existing tests do not cover these semantics as regression assertions. No new tests or source fixes were added.

## Legacy, dead and unverifiable behavior

Legacy acceleration/binary upload and RAW/SUMMARY v1/v2 decoding are active compatibility paths, not dead code and not explicitly deprecated. CSV loading is active but broken, not removed. No explicit deprecated classes/functions were found. Header helper's negative-byte guard is redundant after header-length validation (`decoder.js:30,51`); this is not a user feature.

[TODO: verify] External firmware acquisition rate, SD policy, aggregation membership, Stop behavior, naming conventions, clock provenance and current upload selection. Code here decodes fields but neither acquires samples nor implements the device workflow. [TODO: verify] Deployed endpoint availability, R2 privacy/account configuration and Pages settings. [TODO: verify] Native browser/device layout, file dialogs and completed downloads. These checks were intentionally not inferred from documentation or test doubles.
