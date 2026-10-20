/*
 * Ordinals compact Mondrian pattern manifest - Bitmap 840000.
 *
 * Run in an existing same-origin Ord /content/<HTML_ID> DevTools Console.
 * Read-only. Fetches canonical Bitcoin block through the inscribed SDK, then
 * validates exact nibble and gzip roundtrips. Nothing is inscribed or signed.
 * The SHA-256 and block hash are anchors for comparison, NOT independent
 * Bitcoin consensus proofs of the correctness of derived output totals.
 */
(async () => {
  "use strict";
  const HEIGHT = 840000;
  const sdkPath = "/r/sat/25483050779204/at/-1/content";
  const started = performance.now();
  const sdk = (await import(sdkPath)).default;
  if (typeof sdk.getBitmapPattern !== "function" ||
      typeof sdk.getBlockHash !== "function")
    throw Error("Canonical Bitmap SDK does not expose required functions");

  function nibble(value) {
    if (!Number.isInteger(value) || value < 1 || value > 9)
      throw Error("Out-of-range Mondrian size " + value);
    return value;
  }
  function pack(pattern) {
    const bytes = new Uint8Array(Math.ceil(pattern.length / 2));
    for (let i=0; i<pattern.length; i++)
      bytes[i >> 1] |= nibble(pattern[i]) << (i % 2 === 0 ? 4 : 0);
    return bytes;
  }
  function unpack(bytes, count) {
    if (!Number.isSafeInteger(count) || count < 1 ||
        bytes.length !== Math.ceil(count / 2))
      throw Error("Packed pattern length mismatch");
    if (count % 2 === 1 && (bytes[bytes.length - 1] & 15) !== 0)
      throw Error("Invalid nonzero trailing nibble");
    const out = new Array(count);
    for (let i=0; i<count; i++)
      out[i] = nibble((bytes[i >> 1] >> (i % 2 === 0 ? 4 : 0)) & 15);
    return out;
  }
  const hex = bytes => Array.from(bytes, byte =>
    byte.toString(16).padStart(2, "0")).join("");
  async function sha256(bytes) {
    if (!globalThis.crypto?.subtle)
      throw Error("SHA-256 Web Crypto unavailable in this viewer context");
    return hex(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)));
  }
  function base64(bytes) {
    let binary = "";
    for (let i=0; i<bytes.length; i+=8192)
      binary += String.fromCharCode(...bytes.subarray(i,i+8192));
    return btoa(binary);
  }
  async function streamBytes(bytes, type, format) {
    const stream = new Blob([bytes]).stream().pipeThrough(new type(format));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }

  const blockHashBefore = await sdk.getBlockHash(HEIGHT);
  const pattern = await sdk.getBitmapPattern(HEIGHT, {forceLive:true});
  const blockHash = await sdk.getBlockHash(HEIGHT);
  if (blockHashBefore !== blockHash)
    throw Error("Bitcoin block hash changed while building the manifest; retry after chain stabilises");
  if (!Array.isArray(pattern) || !pattern.length)
    throw Error("Empty or invalid live block pattern");
  if (!/^[0-9a-f]{64}$/i.test(blockHash))
    throw Error("Malformed recursive Bitcoin block hash");

  const packed = pack(pattern);
  const unpacked = unpack(packed, pattern.length);
  if (!unpacked.every((value, i) => value === pattern[i]))
    throw Error("Raw four-bit packing does not round-trip");
  const packedSha256 = await sha256(packed);
  const manifest = {
    format: "bitmap-mondrian-compact-pattern-v1",
    height: HEIGHT,
    blockHash,
    transactionCount: pattern.length,
    nibbleOrder: "high-first",
    padding: "zero-low-nibble-if-odd",
    packedByteLength: packed.length,
    packedSha256,
    compression: "none",
    encodedBytes: packed.length,
    payloadBase64: base64(packed),
    roundtripEqual: true,
    sdkVersion: sdk.VERSION,
    generatedAt: new Date().toISOString(),
    caveat: "Derived pattern validated against this browser's raw-block SDK calculation; block hash and SHA-256 alone do not constitute independent Bitcoin-consensus proof."
  };

  if (typeof CompressionStream === "function" &&
      typeof DecompressionStream === "function") {
    const zipped = await streamBytes(packed, CompressionStream, "gzip");
    const unzipped = await streamBytes(zipped, DecompressionStream, "gzip");
    if (unzipped.length !== packed.length ||
        !unzipped.every((value, i) => value === packed[i]))
      throw Error("Compressed compact pattern does not round-trip");
    if (await sha256(unzipped) !== packedSha256)
      throw Error("Compressed pattern checksum mismatch");
    manifest.compression = "gzip";
    manifest.encodedBytes = zipped.length;
    manifest.payloadBase64 = base64(zipped);
  }

  manifest.elapsedMs = +(performance.now() - started).toFixed(1);
  globalThis.__bitmapPatternManifest840000 = manifest;
  console.table({
    height: manifest.height,
    blockHash: manifest.blockHash,
    transactions: manifest.transactionCount,
    packedBytes: manifest.packedByteLength,
    encodedBytes: manifest.encodedBytes,
    compression: manifest.compression,
    packedSha256: manifest.packedSha256,
    roundtripEqual: manifest.roundtripEqual,
    elapsedMs: manifest.elapsedMs
  });
  console.log("Manifest available in window.__bitmapPatternManifest840000");
  console.log("To copy: copy(JSON.stringify(window.__bitmapPatternManifest840000,null,2))");
  return manifest;
})();