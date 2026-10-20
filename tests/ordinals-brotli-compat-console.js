/*
 * Read-only Ordinals Brotli compatibility probe.
 * DevTools Console inside a same-origin Ord HTML inscription document.
 * Loads the existing on-chain BrotliOC IIFE once; never signs or inscribes.
 */
(async () => {
  "use strict";
  const BROTLI_OC = "fb483c53bc6938c1df1e25e03e99f726d08a1c0d2db4e0e644c0baf3526a1d60i0";
  const BR_840000 = "G/QFgIzDOBb8clOELZ7eJinAb9Ypn++L+NqquHMHSEABaVZJRay7eRA/wbaLR62FXEHoEZwhT/RpQn0nCUQDN9l40RkiwlX/gPiZpzr1+uB23DdFZmbO+96zuSylM7UgBaLKRGciTUu0xSJYpUJEB9TGniIk0NZEUwp+kCLFQGaAEmAti4ICSABPoRBUvYhADNWQZtFhpJVS2qg9CEPyyjPQolucQ1hHcyp2geWBsQUupCBHFQGgChxqavMgLsGNJRWtvo4loJIYICrQZGMpDIFugAUgwIF1gKPCAHsz6ROgRQBCyXQJmZmZsuSrZkauehngIAUh01zJAFaz0r3PzhQAVNkUIAAQOfD0G3/b5AEcLleQZOpPAEAHYOy1/UdR9Q6AZAAA8GRWPQoAax+/53EESMqANLD2EnvIr7Ytrn3eY2NmlZuZJmE8FcgCEABSSMHoi5/7b51j5uznnAL4mTqcA6VMOjPXDNJwrhO+dElnrTSkibLuca3Puj+vj1a/b01XA6PweXunWClsBAjVxJOhPvsA";
  const EXPECTED = "3469c9067eade08b6a0213345d3d22f0751790e425d67eb304c72faf5c29e858";
  const report = {
    sdkTest:"840000 Mondrian Brotli",
    viewerPath:location.pathname,
    onchainLoader:"/content/" + BROTLI_OC,
    nativeBrotliDecompression:false,
    nativeBrotliCompression:false,
    BrotliDecodeAlreadyLoaded:typeof globalThis.BrotliDecode === "function",
    onChainImportOK:false,
    onChainDecompressOK:false,
    packedBytes:null,
    compressedBytes:null,
    digestMatches:false,
    moduleLoadMs:null,
    decompressionMs:null,
    compressionMs:null,
    nativeDecompressionMatches:null,
    errors:[]
  };
  const bytes=Uint8Array.from(atob(BR_840000),c=>c.charCodeAt(0));
  report.compressedBytes=bytes.length;
  const h=buffer=>Array.from(new Uint8Array(buffer),x=>x.toString(16).padStart(2,"0")).join("");
  const sha=async data=>h(await crypto.subtle.digest("SHA-256",data));
  try { new DecompressionStream("brotli"); report.nativeBrotliDecompression=true; } catch {}
  try { new CompressionStream("brotli"); report.nativeBrotliCompression=true; } catch {}
  try {
    let t=performance.now();
    const url="/content/"+BROTLI_OC;
    await import(url);
    report.moduleLoadMs=+(performance.now()-t).toFixed(1);
    const oc=globalThis.BrotliOC;
    report.onChainImportOK=typeof oc?.decompress==="function" && typeof oc?.compress==="function";
    if (!report.onChainImportOK) throw Error("The inscription did not expose BrotliOC.compress/decompress");
    t=performance.now();
    const result=await oc.decompress(bytes);
    const decoded=result instanceof Uint8Array ? result : new Uint8Array(result);
    report.decompressionMs=+(performance.now()-t).toFixed(1);
    report.packedBytes=decoded.length;
    report.digestMatches=(await sha(decoded))===EXPECTED;
    report.onChainDecompressOK=decoded.length===1525 && report.digestMatches;
    if (!report.onChainDecompressOK) throw Error("The 840000 pattern failed SHA-256 or length verification");
    t=performance.now();
    const recoded=await oc.compress(decoded,{quality:11});
    report.compressionMs=+(performance.now()-t).toFixed(1);
    report.recompressedBytes=recoded.length;
    if (report.nativeBrotliDecompression) {
      const stream=new Blob([bytes]).stream().pipeThrough(new DecompressionStream("brotli"));
      const native=new Uint8Array(await new Response(stream).arrayBuffer());
      report.nativeDecompressionMatches=native.length===decoded.length &&
        native.every((x,i)=>x===decoded[i]);
    }
    console.table(report);
    return report;
  } catch(error) {
    report.errors.push(String(error?.message || error));
    console.error("Ordinals Brotli probe failed",error);
    return report;
  } finally {
    globalThis.__bitmapBrotliOnchainProbe=report;
    console.log("Saved to window.__bitmapBrotliOnchainProbe");
  }
})();
