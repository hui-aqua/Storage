# CoreS3 binary format reference

This reference describes what [dashboard/decoder.js](../dashboard/decoder.js) currently reads. Offsets and semantics were verified against the authoritative Motion Logger DATA_FORMAT.md sections 6.4-6.8 and src/storage/RecordFormats.h in the sibling CoreS3_MotionLogger project. Firmware source is outside this checkout. Filenames do not determine version. Fields are packed little-endian; text fields are NUL-terminated/padded and trimmed by the decoder. Records follow the declared header.

See the [Developer Manual](../DEVELOPER_MANUAL.md) for decoding APIs and the [User Manual](../README.md) for viewing.

## Layouts and validation

| Magic | Version | Header bytes | Record bytes |
|---|---:|---:|---:|
| CS3RAW01 | 1 | 73 | 22 |
| CS3RAW01 | 2 | 81 | 22 |
| CS3SUM01 | 1 | 32 | 90 |
| CS3SUM01 | 2 | 75 | 90 |
| CS3SUM01 | 3 | 75 | 90 |

Common fields: magic at offset 0 (8 bytes), uint16 version at 8 and uint16 header size at 10. Unknown magic/version, wrong header/record sizes and truncated headers throw. RAW ranges and rate must be positive. Complete records are read; incomplete tail bytes are reported, not repaired. A header-only recording is accepted.

## RAW header offsets

| Offset | Type | Meaning |
|---:|---|---|
| 12 | text[16] | Device |
| 28 | text[16] | Firmware |
| 44 | text[21] | Creation UTC |
| 65 | int16 | Acceleration full-scale range in g |
| 67 | int16 | Gyroscope full-scale range in degrees/s |
| 69 | uint16 | Configured sample rate |
| 71 | uint16 | Record size, must be 22 |
| 73 | uint8, v2 only | Header time-valid |
| 77 | uint32, v2 only | Dropped samples |

Bytes 74–76 are not interpreted. For v1, time-valid and dropped-sample header metadata are null.

## RAW record offsets

| Offset | Type | Meaning |
|---:|---|---|
| 0 | uint64 | Sensor time in microseconds |
| 8, 10, 12 | int16 each | Acceleration X/Y/Z counts |
| 14, 16, 18 | int16 each | Gyroscope X/Y/Z counts |
| 20 | uint16 | Status |

Acceleration = counts × header range / 32768 g. Gyroscope = counts × header range / 32768 degrees/s. Counts are retained even if invalid; engineering axes become null when their validity bit is clear.

| Status bit | Meaning |
|---:|---|
| 0 | Acceleration valid |
| 1 | Gyroscope valid |
| 2 | Acceleration saturated |
| 3 | Gyroscope saturated |
| 4 | Loss detected |
| 5 | Calendar time valid |

## SUMMARY header offsets

Version is uint16 at offset 8, not inferred from byte sizes. V2 and v3 share sizes but have different field and time semantics. `_v3.bin` is a writer naming convention, not parser authority.

| Offset | Type | Meaning |
|---:|---|---|
| 12 | uint16 | Record size, must be 90 |
| 14 | uint16 | v1/v2 reserved; v3 summary_hz, must be 1 |
| 16 | text[16] | Device |
| 32 | text[16], v2/v3 | Firmware |
| 48 | text[21], v2/v3 | Creation UTC |
| 69 | uint8, v2/v3 | Header time-valid |
| 70 | uint8, v2/v3 | v2 reserved; v3 time_basis, must be 1 |
| 71 | uint32, v2/v3 | Dropped samples |

V1 ends at byte 31; firmware/creation UTC are empty and header time-valid/dropped samples are null. V1/v2 reserved fields are not interpreted as frequency or time basis, even if their bytes happen to be 1. Their SUMMARY sampleRate remains null; explicit summaryHz metadata is optional. V3 reads summary_hz=1 at offset 14 and time_basis=1 at offset 70; other values are rejected. V3 header.summaryHz=1 and rateSource="v3 header" are available locally. External rate metadata must agree. No SUMMARY header stores RAW acquisition rate or sensor ranges.

## SUMMARY record offsets

| Offset | Type | Meaning and decoded scaling |
|---:|---|---|
| 0 | uint64 | v1/v2 emission UTC; v3 exclusive window-end UTC (ms), zero if invalid |
| 8 | uint64 | v1/v2 mixed sensor/poll emission clock; v3 host monotonic exclusive window end (microseconds since boot) |
| 16 | uint32 | Record ID |
| 20 | uint16 | Actual aggregated sample count; v3 uses all samples collected in the window, not a fixed 100 |
| 22, 26, 30 | int32 each | Acceleration X/Y/Z mean; divide by 1000 to g |
| 34, 38, 42, 46 | uint32 each | Acceleration X/Y/Z/magnitude peak; divide by 1,000,000 to g |
| 50, 54, 58 | int32 each | Gyroscope X/Y/Z mean; divide by 1000 to degrees/s |
| 62, 66, 70, 74 | uint32 each | Gyroscope X/Y/Z/magnitude peak; divide by 1000 to degrees/s |
| 78 | int16 | Temperature /100 to degrees C; -32768 means unavailable |
| 80 | uint16 | Battery mV; zero means unavailable; decoder outputs volts, UI converts to mV |
| 82, 83 | uint8 each | Acceleration/gyroscope saturation, nonzero means true |
| 84 | uint32 | Missed samples |
| 88 | uint16 | Status; decoder uses bit 5 for time validity |

SUMMARY axis values are decoded without applying RAW validity-bit masking. V3 exposes status bits 0/1 paired acceleration/gyro validity, 2/3 saturation, 4 FIFO loss, 5 projected UTC valid, 6 timing/membership warning, and 7 gap spanning empty intervals. Bits 8-15 are reserved. V1/v2 only define bit 5 in SUMMARY. V3 window membership is approximate when bit 6 is set; sample-count variation alone is not proof of loss. Temperature and battery are emission-time readings, not window means. Magnitude of mean axes is derived in the UI; it is not the recorded peak magnitude.

## Time, sampling and export

RAW sensor time is relative and does not establish sample UTC. Legacy SUMMARY uses emission UTC and retains metadata-based nominal relative-time or record-order fallback. V3 records label completed half-open windows [utc_ms - 1000, utc_ms), or [sensor_time_us - 1000000, sensor_time_us) on the boot monotonic clock. Windows begin with each recording session, not necessarily on UTC integer seconds. UTC is back-projected at emission and can step/drift; monotonic bounds carry acquisition interval spacing. The viewer uses valid nondecreasing UTC, otherwise valid strictly increasing v3 monotonic ends, otherwise record order. It never compresses v3 gaps into index/Hz time. Record IDs are not global identities or time coordinates.

The default binary plot retains every ceil(recordCount/12000)-th record, with a minimum stride of one. Statistics and hover use these retained points. The complete-record count remains exact; extrema and the last original record may be omitted from the plot. Full CSV export decodes all complete records and includes metadata, record index and point fields. It has a different schema from daily SUMMARY CSV input and is not a viewer round-trip format.

## Sources and CSV limitation

Local selection never uploads files. Cloud binaries are fetched through Worker read routes from private R2; the routes themselves are unauthenticated. The published index is separate metadata for CSV history. Its records array is currently empty. CSV loading currently fails due to undefined SUMMARY_COLUMNS in app.js; no working daily CSV contract is defined by this repository. See the Developer Manual before modifying this path.

## SUMMARY rate metadata and durations

RAW acquisition remains 100 Hz and SD-only. SUMMARY v3 emits each nonempty completed approximately one-second interval once, using every collected sample. Empty intervals are omitted; the unfinished final interval is discarded on Stop, while its RAW samples remain. The viewer does not generate missing intervals or upsample. Gap flags and monotonic discontinuities break plot lines even across subsampling. V1/v2 have no reliable local rate discriminator and retain their historical interpretation.

Timestamp span is last minus first endpoint across all complete original records. V3 representedDurationSeconds = recordCount / header.summaryHz counts completed recorded windows; it excludes omitted intervals. windowCoverageSeconds = endpoint span + one second measures first-window-start to last-end coverage, including gaps (preferring valid monotonic time). For ends at 1, 2 and 5 seconds: 3 recorded seconds, 4-second endpoint span, 5-second coverage. Header-only local v3 files decode with zero records; v3 upload requires at least one complete record and aligned tail. Legacy header-only behavior remains unchanged. Neither sum is a claim of exact hardware sample UTC. CRC covers original bytes including the version/rate fields.
