# Viewer verification

Implementation and extension guidance lives in the [Developer Manual](../DEVELOPER_MANUAL.md); binary offsets live in the [format reference](dashboard-data-format.md). User controls are described in the [User Manual](../README.md).

## Automated checks

```powershell
node scripts/test_viewer.cjs
node scripts/test_summary_workflow.cjs
.\.venv\Scripts\python.exe scripts/test_local_summary.py
node --check dashboard/app.js
node --check dashboard/decoder.js
```

The dependency-free VM harness uses generated RAW v1/v2 and SUMMARY v1/v2/v3 fixtures and DOM/canvas stubs. It verifies engineering scaling, local opening/drop dispatch, original download link state, battery mV, axes, viewport interactions, hover, themes, statistics, cloud failure isolation, full-record CSV export, ticks and duration. It does not verify painting, native file dialogs, actual downloads, successful CSV loading or backend integration.

Optional field regression runs if data/samples/CS3_01_SUMMARY_20261111.bin exists, or accepts another SUMMARY path:

```powershell
node scripts/test_viewer.cjs path/to/example.bin
```

This check requires SUMMARY with no incomplete tail and compares retained motion, temperature and battery values with original bytes. Measurement data is not required in a checkout. The arbitrary test-5mb.bin upload fixture is not a recording.

## Browser acceptance checklist

For timezone acceptance, open a local SUMMARY and a cloud SUMMARY, then switch Browser Local, Europe/Oslo and UTC while zoomed and hovering. Confirm immediate axis/range/tooltip updates and the active-zone indicator. Check Oslo winter (+1), summer (+2), spring 2026-03-29 at 01:00 UTC and autumn 2026-10-25 at 01:00 UTC. Confirm unchanged UTC timestamps, ordering, measurements, sample count and downloads. The automated VM checks cover these conversions, source invariance and both loading paths. Native browser rendering remains a manual acceptance step.

1. Serve the viewer as described in the manuals. Check layout at 1366×768, 1920×1080 and narrow phone width.
2. Open real RAW v1/v2 and SUMMARY v1/v2/v3 and compare values with the format reference. Check header-only, partial-tail and malformed files.
3. Drop a recording from Explorer. Download the original and compare bytes.
4. Exercise wheel zoom, drag pan, Shift-drag/range selection, sliders, reset, hover and keyboard navigation. Toggle all available signals and axes.
5. Expand statistics; verify visible-range calculations and sampled-point disclosure. Confirm absent binary temperature/battery remain unavailable.
6. Switch Light/Dark/System; reload to verify persistence and change OS theme while System is selected.
7. Fail index and cloud requests; verify useful diagnostics and continued local loading. Restore Worker access; check list, refresh, open and download.
8. Export a binary recording larger than 12,000 records; confirm all complete records are exported despite viewport and stride. Verify metadata and RAW counts.
9. For published index testing, use Pages-equivalent staging from the Developer Manual. CSV plotting currently fails on undefined SUMMARY_COLUMNS; repairing this needs a canonical schema and dedicated tests before acceptance.

These are acceptance procedures, not a claim that native browser checks have passed. The VM harness cannot establish browser rendering or download completion.

## 1 Hz and snapshot acceptance

Generated fixtures retain the v1/v2 byte layouts and vary record timestamps/sample counts for 1 and 10 Hz. Verify cloud rate metadata, original timestamp spacing, count/rate represented duration, unknown local frequency without inference, CRC checks, invalid-clock nominal fallback only with metadata, and full-record export. Verify duplicate CRC returns ALREADY_EXISTS and a larger same-day partial file returns STORED under a separate key. Confirm largest/newest preference and continued access to older snapshots. Worker tests use paginated R2 doubles; Python tests use temporary disk. Live Cloudflare and native browser acceptance remain separate checks.

## V3 acceptance

The fixture writes format_version=3, uint16 summary_hz=1 at header offset 14 and uint8 time_basis=1 at 70, with 75-byte header and 90-byte records. Test exclusive ends, variable sample counts, omitted windows, timing/gap status, UTC-to-monotonic fallback, reboot-clock reset, CRC upload/dedup, header-only local decode versus upload rejection, metadata conflicts, wrong rate/time_basis and local filenames with no version hint. Confirm a v2 header with reserved bytes set to 1 remains v2 and has no inferred rate. Confirm gap flags hidden by subsampling still break plot lines. Native browser acceptance and live R2 remain separate from the VM/in-memory tests.
