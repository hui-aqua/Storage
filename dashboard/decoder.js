/* Strict reader for the versioned CoreS3 binary formats in docs/dashboard-data-format.md. */
(() => {
  const RAW_MAGIC = "CS3RAW01";
  const SUMMARY_MAGIC = "CS3SUM01";
  const MAX_PLOT_POINTS = 12000;

  function fixedText(bytes, offset, length) {
    const field = bytes.subarray(offset, offset + length);
    const end = field.indexOf(0);
    return new TextDecoder().decode(end < 0 ? field : field.subarray(0, end)).trim();
  }

  function headerError(message) { throw new Error(`Invalid CoreS3 binary: ${message}`); }

  function parseHeader(buffer) {
    if (!(buffer instanceof ArrayBuffer)) throw new TypeError("Expected an ArrayBuffer");
    if (buffer.byteLength < 12) headerError("file is shorter than the common header");
    const bytes = new Uint8Array(buffer);
    const magic = fixedText(bytes, 0, 8);
    const view = new DataView(buffer);
    const version = view.getUint16(8, true);
    const headerBytes = view.getUint16(10, true);
    const raw = magic === RAW_MAGIC;
    const summary = magic === SUMMARY_MAGIC;
    if (!raw && !summary) headerError(`unknown magic '${magic || "empty"}'`);
    if (!(raw ? [1, 2] : [1, 2, 3]).includes(version)) headerError(`unsupported ${raw ? "RAW" : "SUMMARY"} version ${version}`);
    const expectedHeader = raw ? (version === 1 ? 73 : 81) : (version === 1 ? 32 : 75);
    const expectedRecord = raw ? 22 : 90;
    if (headerBytes !== expectedHeader) headerError(`version ${version} declares ${headerBytes}-byte header; expected ${expectedHeader}`);
    if (buffer.byteLength < headerBytes) headerError("file ends inside header");

    let header;
    if (raw) {
      const accRange = view.getInt16(65, true);
      const gyroRange = view.getInt16(67, true);
      const sampleRate = view.getUint16(69, true);
      const recordBytes = view.getUint16(71, true);
      if (accRange <= 0 || gyroRange <= 0 || sampleRate <= 0 || recordBytes !== expectedRecord) headerError("invalid RAW range, rate, or record size");
      header = { kind: "raw", magic, version, headerBytes, recordBytes, device: fixedText(bytes, 12, 16), firmware: fixedText(bytes, 28, 16), createdUtc: fixedText(bytes, 44, 21), timeValid: version === 2 ? view.getUint8(73) !== 0 : null, droppedSamples: version === 2 ? view.getUint32(77, true) : null, accRangeG: accRange, gyroRangeDps: gyroRange, sampleRate };
    } else {
      const recordBytes = view.getUint16(12, true);
      if (recordBytes !== expectedRecord) headerError(`invalid SUMMARY record size ${recordBytes}`);
      header = { kind: "summary", magic, version, headerBytes, recordBytes, device: fixedText(bytes, 16, 16), firmware: version >= 2 ? fixedText(bytes, 32, 16) : "", createdUtc: version >= 2 ? fixedText(bytes, 48, 21) : "", timeValid: version >= 2 ? view.getUint8(69) !== 0 : null, droppedSamples: version >= 2 ? view.getUint32(71, true) : null, sampleRate: null };
      if (version === 3) {
        header.summaryHz = view.getUint16(14, true);
        header.timeBasis = view.getUint8(70);
        if (header.summaryHz !== 1 || header.timeBasis !== 1) headerError("unsupported SUMMARY v3 rate/time basis (expected 1/1)");
      }
      header.timestampSemantics = version === 3 ? "exclusive completed-window end" : "legacy emission time";
    }
    if (buffer.byteLength - headerBytes < 0) headerError("missing records");
    return { header, bytes: buffer.byteLength - headerBytes, view };
  }

  function decodeBinary(buffer, options = {}) {
    const parsed = parseHeader(buffer);
    const { header, view } = parsed;
    const fullRecords = Math.floor(parsed.bytes / header.recordBytes);
    const tailBytes = parsed.bytes % header.recordBytes;
    const v3 = header.kind === "summary" && header.version === 3;
    let summaryHz = v3 ? header.summaryHz : null, rateSource = v3 ? "v3 header" : null;
    if (header.kind === "summary") {
      if (options.summaryHz != null) {
        const metadataHz = Number(options.summaryHz);
        if (![1, 10].includes(metadataHz)) headerError("summary_hz must be 1 or 10");
        if (v3 && metadataHz !== summaryHz) headerError("SUMMARY metadata frequency conflicts with v3 header");
        summaryHz = metadataHz;
        if (!v3) rateSource = "metadata";
      }
      header.summaryHz = summaryHz;
      header.rateSource = rateSource;
    }
    const representedDurationSeconds = summaryHz ? fullRecords / summaryHz : null;
    let timestampsValid = true, firstTime = null, lastTime = null;
    let monotonicValid = v3, firstMonotonic = null, lastMonotonic = null;
    const gapPrefix = v3 ? new Uint32Array(fullRecords + 1) : null;
    for (let i = 0; i < fullRecords; i++) {
      const offset = header.headerBytes + i * header.recordBytes;
      const time = Number(view.getBigUint64(offset, true));
      if (!Number.isSafeInteger(time) || (lastTime !== null && time < lastTime)
          || (header.kind === "summary" && (time < (v3 ? 1000 : 1) || time > 8640000000000000 || !(view.getUint16(offset + 88, true) & 32)))) timestampsValid = false;
      if (v3) {
        const end = Number(view.getBigUint64(offset + 8, true));
        if (!Number.isSafeInteger(end) || end < 1000000 || (lastMonotonic !== null && end <= lastMonotonic)) monotonicValid = false;
        const status = view.getUint16(offset + 88, true);
        const discontinuity = i > 0 && ((status & 128) || end - lastMonotonic !== 1000000);
        gapPrefix[i + 1] = gapPrefix[i] + Number(Boolean(discontinuity));
        if (firstMonotonic === null) firstMonotonic = end;
        lastMonotonic = end;
      }
      if (firstTime === null) firstTime = time;
      lastTime = time;
    }
    const timestampSpanSeconds = timestampsValid && fullRecords ? (lastTime - firstTime) / (header.kind === "raw" ? 1e6 : 1000) : null;
    const monotonicSpanSeconds = monotonicValid && fullRecords ? (lastMonotonic - firstMonotonic) / 1e6 : null;
    // Coverage includes the first one-second window. Empty intervals remain gaps.
    const endSpan = monotonicSpanSeconds ?? timestampSpanSeconds;
    const windowCoverageSeconds = v3 && fullRecords && endSpan != null ? endSpan + 1 : null;
    const stride = options.allRecords ? 1 : Math.max(1, Math.ceil(fullRecords / MAX_PLOT_POINTS));
    const points = [];
    for (let index = 0; index < fullRecords; index += stride) {
      const offset = header.headerBytes + index * header.recordBytes;
      if (header.kind === "raw") {
        const status = view.getUint16(offset + 20, true);
        const ax = view.getInt16(offset + 8, true);
        const ay = view.getInt16(offset + 10, true);
        const az = view.getInt16(offset + 12, true);
        const gx = view.getInt16(offset + 14, true);
        const gy = view.getInt16(offset + 16, true);
        const gz = view.getInt16(offset + 18, true);
        const accValid = Boolean(status & 1);
        const gyroValid = Boolean(status & 2);
        points.push({ t: view.getBigUint64(offset, true).toString(), ax: accValid ? ax * header.accRangeG / 32768 : null, ay: accValid ? ay * header.accRangeG / 32768 : null, az: accValid ? az * header.accRangeG / 32768 : null, gx: gyroValid ? gx * header.gyroRangeDps / 32768 : null, gy: gyroValid ? gy * header.gyroRangeDps / 32768 : null, gz: gyroValid ? gz * header.gyroRangeDps / 32768 : null, axCounts: ax, ayCounts: ay, azCounts: az, gxCounts: gx, gyCounts: gy, gzCounts: gz, status, accValid, gyroValid, accSaturated: Boolean(status & 4), gyroSaturated: Boolean(status & 8), loss: Boolean(status & 16), timeValid: Boolean(status & 32) });
      } else {
        const timeMs = view.getBigUint64(offset, true);
        const temperature = view.getInt16(offset + 78, true);
        const batteryMv = view.getUint16(offset + 80, true);
        points.push({ t: timeMs.toString(), sensorTimeUs: view.getBigUint64(offset + 8, true).toString(), recordId: view.getUint32(offset + 16, true), sampleCount: view.getUint16(offset + 20, true), ax: view.getInt32(offset + 22, true) / 1000, ay: view.getInt32(offset + 26, true) / 1000, az: view.getInt32(offset + 30, true) / 1000, accXPeak: view.getUint32(offset + 34, true) / 1e6, accYPeak: view.getUint32(offset + 38, true) / 1e6, accZPeak: view.getUint32(offset + 42, true) / 1e6, accMagPeak: view.getUint32(offset + 46, true) / 1e6, gx: view.getInt32(offset + 50, true) / 1000, gy: view.getInt32(offset + 54, true) / 1000, gz: view.getInt32(offset + 58, true) / 1000, gyroXPeak: view.getUint32(offset + 62, true) / 1000, gyroYPeak: view.getUint32(offset + 66, true) / 1000, gyroZPeak: view.getUint32(offset + 70, true) / 1000, gyroMagPeak: view.getUint32(offset + 74, true) / 1000, temperature: temperature === -32768 ? null : temperature / 100, batteryVoltage: batteryMv === 0 ? null : batteryMv / 1000, accSaturated: Boolean(view.getUint8(offset + 82)), gyroSaturated: Boolean(view.getUint8(offset + 83)), missedSamples: view.getUint32(offset + 84, true), status: view.getUint16(offset + 88, true), timeValid: Boolean(view.getUint16(offset + 88, true) & 0x20) });
      }
      if (v3) {
        const point = points[points.length - 1];
        const status = point.status;
        point.accValid = Boolean(status & 1);
        point.gyroValid = Boolean(status & 2);
        point.loss = Boolean(status & 16);
        point.timingWarning = Boolean(status & 64);
        point.emptyIntervalGap = Boolean(status & 128);
        point.gapBefore = index > 0 && gapPrefix[index + 1] > gapPrefix[Math.max(0, index - stride) + 1];
        point.windowStartUtcMs = point.timeValid && Number(point.t) >= 1000 ? (BigInt(point.t) - 1000n).toString() : null;
        point.windowEndUtcMs = point.timeValid ? point.t : null;
        const end = BigInt(point.sensorTimeUs);
        point.windowStartMonotonicUs = end >= 1000000n ? (end - 1000000n).toString() : null;
        point.windowEndMonotonicUs = point.sensorTimeUs;
      }
    }
    const damaged = tailBytes > 0;
    return { status: "decoded", decoded: true, kind: header.kind, header, recordCount: fullRecords, plottedCount: points.length, stride, tailBytes, damaged, points, representedDurationSeconds, timestampSpanSeconds, timestampsValid, monotonicValid, monotonicSpanSeconds, windowCoverageSeconds, message: `${header.kind.toUpperCase()} v${header.version}: ${fullRecords.toLocaleString()} complete records${damaged ? `, ${tailBytes} trailing byte(s)` : ""}${stride > 1 ? `; plotting every ${stride}th record` : ""}.` };
  }

  function binaryCsv(buffer, options = {}) {
    const d=decodeBinary(buffer,{...options,allRecords:true});
    const metadata={...d.header,completeRecords:d.recordCount,trailingBytes:d.tailBytes};
    const fields=d.points.length?Object.keys(d.points[0]):[];
    const escape=v=>'"'+String(v??'').replace(/"/g,'""')+'"';
    const lines=[[...Object.keys(metadata).map(k=>'header_'+k),'record_index',...fields].map(escape).join(',')];
    d.points.forEach((p,i)=>lines.push([...Object.values(metadata),i,...fields.map(k=>p[k])].map(escape).join(',')));
    return lines.join('\r\n')+'\r\n';
  }
  const crcTable = Uint32Array.from({ length: 256 }, (_, value) => {
    let crc = value;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
    return crc >>> 0;
  });
  function crc32(buffer) {
    let crc = 0xffffffff;
    for (const byte of new Uint8Array(buffer)) {
      crc = (crc >>> 8) ^ crcTable[(crc ^ byte) & 0xff];
    }
    return ((crc ^ 0xffffffff) >>> 0).toString(16).padStart(8, "0");
  }
  globalThis.motionCrc32 = crc32;
  globalThis.binaryCsv=binaryCsv;
  globalThis.decodeBinary = decodeBinary;
})();
