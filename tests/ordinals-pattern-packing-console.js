/*
 * Bitmap 840000 - exact Mondrian pattern packing feasibility probe.
 * Paste into the DevTools Console within any existing Ord HTML inscription.
 * Read-only, same-origin recursive SDK. No inscription or wallet activity.
 */
(async () => {
  "use strict";
  const HEIGHT = 840000;
  const sdkPath = "/r/sat/25483050779204/at/-1/content";
  const report = {
    bitmap: HEIGHT,
    at: new Date().toISOString(),
    sdkPath,
    versions: {},
    patternSource: "live raw Bitcoin block",
    transactionCount: null,
    packedBytes: null,
    packedHexChars: null,
    gzipBytes: null,
    checksum: null,
    roundtripEqual: false,
    cachedPatternEqual: null,
    elapsedMs: null
  };
  const start = performance.now();
  function sizeToNibble(value) {
    if (!Number.isInteger(value) || value < 1 || value > 9)
      throw new Error("Invalid Mondrian square size: " + value);
    return value;
  }
  function encode(sizes) {
    const bytes = new Uint8Array(Math.ceil(sizes.length / 2));
    for(let i=0;i<sizes.length;i++)
      bytes[i>>1] |= sizeToNibble(sizes[i]) << (i%2===0 ? 4 : 0);
    return bytes;
  }
  function decode(bytes,length) {
    const out=new Array(length);
    for(let i=0;i<length;i++) {
      const v=(bytes[i>>1] >> (i%2===0 ? 4 : 0)) & 15;
      out[i]=sizeToNibble(v);
    }
    return out;
  }
  const sdk = (await import(sdkPath)).default;
  report.versions.sdk=sdk.VERSION;
  // forceLive bypasses the pattern index and local geometry cache.
  const pattern=await sdk.getBitmapPattern(HEIGHT,{forceLive:true});
  const packed=encode(pattern);
  const unpacked=decode(packed,pattern.length);
  report.transactionCount=pattern.length;
  report.packedBytes=packed.length;
  report.packedHexChars=packed.length*2;
  report.roundtripEqual=pattern.every((value,index)=>value===unpacked[index]);
  if (!report.roundtripEqual) throw Error("Pattern packing roundtrip mismatch");
  // Browser compression for rough storage sizing, NOT Brotli or a fee quote.
  if (typeof CompressionStream === "function") {
    const stream = new Blob([packed]).stream().pipeThrough(new CompressionStream("gzip"));
    report.gzipBytes=(await new Response(stream).arrayBuffer()).byteLength;
  }
  // This comparison is optional: geometry may not have been cached in this origin.
  const stored=await sdk.storage.getMondrian(HEIGHT);
  if(Array.isArray(stored?.pattern)){
    report.cachedPatternEqual=stored.pattern.length===pattern.length &&
      pattern.every((value,index)=>value===stored.pattern[index]);
  }
  // FNV-1a is a *noncryptographic* debugging checksum, not provenance proof.
  let checksum=2166136261;
  for(const v of packed){checksum=Math.imul(checksum^v,16777619)>>>0;}
  report.checksum=checksum.toString(16).padStart(8,"0");
  report.elapsedMs=+(performance.now()-start).toFixed(1);
  globalThis.__bitmapPattern840000Report=report;
  console.table(report);
  console.log("Exact pattern size report:",JSON.stringify(report,null,2));
})();
