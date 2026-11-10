# CoreS3 daily motion data format

Each configured device ID owns `/motion/` on its SD card. Daily names are `{device_id}_RAW_YYYYMMDD.bin` and `{device_id}_SUMMARY_YYYYMMDD.csv`, where the date is UTC. Before the system clock is valid, the names end in `_unsynced`. RAW files are retained on the SD card permanently; the uploader sends only the previous UTC day's SUMMARY once per day and never uploads or deletes RAW. After the upload attempt Wi-Fi is turned off. A successful HTTP 2xx response is recorded so the same day is not uploaded again.

## RAW binary

The file begins with a versioned metadata header containing device ID, firmware version, file start UTC, accelerometer range (±8 g), gyroscope range (±1000 °/s), 100 Hz sample rate, and record format version. Header encoding must be documented by the firmware and indexed metadata; records immediately following it are fixed-length 22-byte little-endian values:

| Offset | Type | Field |
|---:|---|---|
| 0 | uint64 | `sensor_time_us` |
| 8 | int16 | `ax` |
| 10 | int16 | `ay` |
| 12 | int16 | `az` |
| 14 | int16 | `gx` |
| 16 | int16 | `gy` |
| 18 | int16 | `gz` |
| 20 | uint16 | `status` |

`sensor_time_us` extends the BMI270 24-bit SensorTime counter over wraps. For samples in a FIFO burst, earlier timestamps are reconstructed at 10 ms intervals relative to the SensorTime frame at the burst end. Signed counts are stored unchanged; do not average or scale RAW values.

Status bits: bit 0 acceleration valid; bit 1 gyro valid; bit 2 accelerometer saturation; bit 3 gyro saturation; bit 4 FIFO overflow/skip observed; bit 5 system time valid. Higher bits are reserved and zero.

## SUMMARY CSV

UTF-8 CSV columns, in this exact order:

```text
UTC_time,sensor_time_us,record_id,sample_count,acc_x_mean,acc_y_mean,acc_z_mean,acc_x_peak,acc_y_peak,acc_z_peak,acc_mag_peak,gyro_x_mean,gyro_y_mean,gyro_z_mean,gyro_x_peak,gyro_y_peak,gyro_z_peak,gyro_mag_peak,temperature,battery_voltage,acc_saturation,gyro_saturation,missed_samples
```

One row represents each ten decoded RAW samples (nominal 10 Hz). Means are signed per-axis averages in g and °/s. Axis peaks and acceleration/gyro magnitude peaks are absolute maxima across the interval. `sensor_time_us` identifies the last raw sample in the interval. UTC time is ISO 8601 UTC; saturation fields are booleans; `missed_samples` counts skipped/overflowed samples attributed to the interval.

## Public dashboard index

GitHub Pages reads `data/index.json`; paths are repository-root-relative and resolve to public raw GitHub URLs. Example:

```json
{
  "schema_version": 2,
  "records": [{
    "device_id": "CS3_01",
    "timestamp": "2026-11-09T23:59:59Z",
    "filename": "CS3_01_SUMMARY_20261109.csv",
    "path": "data/CS3_01/2026/11/09/CS3_01_SUMMARY_20261109.csv",
    "raw_filename": "CS3_01_RAW_20261109.bin",
    "raw_path": "data/CS3_01/2026/11/09/CS3_01_RAW_20261109.bin",
    "sampling_frequency": 100,
    "summary_frequency": 10,
    "record_size_bytes": 22,
    "record_format_version": 1,
    "summary_rows": 86400
  }]
}
```

Only SUMMARY is eligible for device daily upload. A public RAW path may be added to the index by a separate, explicitly configured publication process; the on-device daily uploader must not send RAW. The dashboard supports CSV SUMMARY files and the `bmi270_raw_v1` record format when an externally published RAW file has a documented header length (`header_bytes`). CSV RAW samples are not supported.
