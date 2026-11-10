# Dashboard data index and sample format

GitHub Pages is static. The dashboard reads `data/index.json`, then downloads raw files from the public repository. Every record is public, including its metadata, file contents, and commit history. Do not publish sensitive farm locations or credentials.

## Index shape

```json
{
  "schema_version": 1,
  "records": [
    {
      "device_id": "device_001",
      "timestamp": "2026-11-10T08:00:00Z",
      "sampling_frequency": 50,
      "measurement_type": "acceleration",
      "filename": "acceleration_080000.bin",
      "path": "data/device_001/2026/11/10/acceleration_080000.bin",
      "size_bytes": 5242880,
      "sha256": "...",
      "format": "float32le_xyz",
      "unit": "m/s²"
    }
  ]
}
```

Records are shown newest first. `path` is relative to the repository root and becomes a `raw.githubusercontent.com` download URL. An explicit `url` may be supplied instead.

## Supported waveform formats

- `float32le_xyz` (default): consecutive IEEE-754 32-bit little-endian triples, X then Y then Z, with acceleration values in the declared `unit`.
- `csv`: rows of X,Y,Z values (comma, semicolon, or whitespace separators); an optional non-numeric header row is ignored.
- `json`: either an array of `[x,y,z]` sample rows or an object with a `samples` array.

The current CoreS3 recording format has not yet been defined by the firmware. Match the dashboard decoder to the actual firmware encoding before using this page to interpret real measurements. Download links work for any indexed raw file regardless of waveform compatibility.
