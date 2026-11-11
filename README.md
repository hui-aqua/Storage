# Marine Motion Logger — User Manual

The Motion Data Viewer plots CoreS3 RAW and SUMMARY binary recordings and exports decoded measurements. Local files stay in your browser and are not uploaded.

For implementation, configuration, deployment and extension guidance, see the [Developer Manual](DEVELOPER_MANUAL.md).

## Recording architecture

The Motion Logger records **100 Hz RAW** on its SD card only. Approximately one second of those measurements produces one **1 Hz SUMMARY** record. SUMMARY is stored on SD, uploaded over HTTPS as a snapshot, and displayed here. RAW upload is rejected; local RAW viewing remains available.

SUMMARY v3 explicitly stores 1 Hz and window-end time semantics in its header, so local and cloud v3 files can both identify their rate. Historical v1/v2 binaries remain readable: they have no header rate and use explicit cloud metadata or show frequency unknown locally. No cadence inference or upsampling is performed.

## Open the viewer

Use the deployed GitHub Pages viewer, or run this command from the repository root with Python installed:

```powershell
python -m http.server 8000 --directory dashboard
```

Visit <http://localhost:8000/> in a modern browser with JavaScript enabled. No frontend installation or build is required. This simple server supports local binary viewing; it does not supply the optional published-summary index. Cloud binary recordings are fetched separately over the network.

## Open a recording

1. Select **Open file** and choose a RAW or SUMMARY `.bin`, or drop it onto the page. Only the first dropped file opens.
2. Read the filename, device and record counts above the chart.
3. For remote recordings, expand **Cloud data**, choose device `CS01`–`CS04` and a recording, then select **Open recording**. **Refresh** reloads the list.

The recording selector defaults to the largest snapshot for the newest date, with upload time breaking equal-size ties. Previous same-day snapshots stay in the selector. Re-uploading unchanged contents is a duplicate; changed contents coexist as another CRC32 snapshot.

RAW v1/v2 and SUMMARY v1/v2/v3 are supported. The new firmware writes `_v3.bin`, but the explicit header version, not the suffix or byte size, determines interpretation. The header determines format; an arbitrary file renamed `.bin` is not a recording.

**Current CSV limitation:** the interface includes CSV selection and **Published summaries**, but CSV loading currently fails because its column definition is missing. Use binary recordings for plotting. Binary-to-CSV export works. The published index in this checkout is empty.

## Explore measurements

Choose **Time Zone** above the chart. **Browser Local** is the default and uses the browser's detected IANA timezone. **Europe/Oslo** and **UTC** are also available. Switching updates axis labels, the visible-range label and any open tooltip immediately. The selected timezone appears near the chart, with abbreviations and UTC offsets for the visible endpoints. Oslo automatically uses CET in winter and CEST in summer. A range crossing a daylight-saving transition can show both offsets.

Hover tooltips show the selected local date/time and a separate UTC endpoint for engineering inspection. Repeated local clock times at the autumn DST transition retain their UTC ordering and can be distinguished by tooltip timezone abbreviations and UTC values. Local files and cloud SUMMARY recordings use the same display rules. Source `utc_ms`, measurements, sample count, ordering, downloads and CSV exports retain their original values. Sensor, monotonic, nominal relative and record-order charts retain their existing time basis.

Choose a **Signal**: acceleration (g), gyroscope (degrees/s), recorded peaks, temperature (degrees C), battery (mV), missed samples, samples per summary, or saturation. Unavailable signal types are disabled. RAW has no temperature or battery values.

For vector signals, toggle **X**, **Y**, **Z** and **Magnitude**. Acceleration includes gravity. Magnitude calculated from mean axes differs from recorded peak magnitude.

| Action | Control |
|---|---|
| Zoom around the pointer | Scroll over the plot |
| Pan | Drag with **Pan** selected |
| Zoom to an interval | Shift-drag, or choose **Select range** and drag |
| Navigate a range | Move **Start** and **End** sliders |
| Inspect values | Hover over the chart |
| Restore full recording | **Reset zoom**, double-click, or Home with plot focused |
| Keyboard navigation | Focus plot; left/right pan, +/− zoom |

The range label shows the span between visible record timestamps. RAW uses relative sensor time. Legacy SUMMARY timestamps are emission times. V3 timestamps mark exclusive ends of completed approximately one-second windows: a record at 12:00:01 describes [12:00:00, 12:00:01). Each nonempty completed interval uses all samples actually collected; sample count can vary. Empty intervals are omitted and unfinished final intervals are discarded on Stop. No data is generated to fill those gaps.

V3 uses valid recorded UTC, or recorded host monotonic window ends if UTC is unusable. If both clocks are discontinuous (for example across reboot appends), the chart uses record order. Legacy files retain their previous metadata-based nominal-time or record-order fallback.

## Statistics and large recordings

Expand **Range statistics** for mean, RMS, minimum, maximum and absolute peak of enabled signals in the visible range. Nonfinite values are skipped.

Large binary files retain at most 12,000 regularly sampled records for plotting. Hover and statistics use these points; zooming does not recover extra detail. Short peaks can be missed. RMS of SUMMARY means is not RMS of original RAW samples. Statistics give each displayed record equal weight; they do not weight by sample count or fill empty windows. V3 timing/gap/loss flags are reported in hover details and decoded CSV. Use full-record export for further analysis.

## Save data and change appearance

- **Download original** preserves the opened file. Cloud downloads request it again from the service.
- **Export CSV** exports every complete binary record, including header metadata and RAW integer counts, regardless of zoom or plot sampling. SUMMARY exports append `record_time_local`, formatted using the Time Zone selection at export time, with milliseconds, UTC offset and IANA zone. Invalid UTC produces an empty cell. V3 times label exclusive window ends. The `.decoded.csv` is for analysis and cannot currently be reopened by this viewer's CSV loader.
- **File information** shows device, creation time, size, CRC32, explicit format version, frequency/source, timestamp semantics and durations. For v3, recorded windows total is count / 1 Hz; first-window-start to last-end coverage includes omitted intervals. Endpoint span excludes the first window. For example, three windows ending at 1, 2 and 5 seconds represent 3 seconds of data across 5 seconds of coverage, with a 4-second endpoint span. Local v3 files expose this without cloud metadata; local legacy nominal duration remains unknown. Published links remain available where supplied.
- **Light / Dark / System** changes the viewer and chart. The choice is saved in this browser; the initial mode is Light.

## Troubleshooting

| Symptom | What to check |
|---|---|
| File cannot open | Expand **Advanced & diagnostics**. Check the file has a valid CoreS3 RAW or SUMMARY header. |
| Incomplete final record warning | Complete records remain viewable. Preserve the original; the viewer does not repair it. |
| Cloud unavailable | Check connectivity and **Refresh**. Local loading remains available. |
| No cloud recordings | Confirm the selected device. Local viewing is unaffected. |
| Published summaries unavailable locally | The simple local server serves only the viewer. CSV plotting also has the limitation above. |
| Missing values or unexpected time axis | Check file metadata and diagnostics. Invalid RAW axes are omitted; clock fallback is explained in diagnostics. |

The viewer's cloud requests are read-only and do not need the device upload API key.
