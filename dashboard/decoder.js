/*
 * The CoreS3 RAW header and record byte layout are not yet specified precisely
 * enough to decode safely. Keep the shared binary entry point here and do not
 * infer fields from file size or undocumented offsets.
 */
window.decodeBinary = function decodeBinary(arrayBuffer) {
  if (!(arrayBuffer instanceof ArrayBuffer)) {
    throw new TypeError("Expected an ArrayBuffer");
  }

  return {
    status: "loaded",
    byteLength: arrayBuffer.byteLength,
    decoded: false,
    message: "ArrayBuffer loaded. Binary decoding is TODO until the exact CoreS3 format specification is available.",
  };
};
