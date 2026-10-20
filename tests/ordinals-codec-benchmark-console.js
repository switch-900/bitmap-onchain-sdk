/*
 * READ-ONLY: live Ordinals Mondrian 840000 warm Brotli vs gzip benchmark.
 * Run in an inscribed HTML viewer's DevTools Console.
 * Uses existing same-origin /content BrotliOC inscription and embedded,
 * previously-verified compressed bytes. No wallet, raw block or writes.
 */
(async () => {
  "use strict";
  const BROTLI_OC_ID = "fb483c53bc6938c1df1e25e03e99f726d08a1c0d2db4e0e644c0baf3526a1d60i0";
  const BR_B64 = "G/QFgIzDOBb8clOELZ7eJinAb9Ypn++L+NqquHMHSEABaVZJRay7eRA/wbaLR62FXEHoEZwhT/RpQn0nCUQDN9l40RkiwlX/gPiZpzr1+uB23DdFZmbO+96zuSylM7UgBaLKRGciTUu0xSJYpUJEB9TGniIk0NZEUwp+kCLFQGaAEmAti4ICSABPoRBUvYhADNWQZtFhpJVS2qg9CEPyyjPQolucQ1hHcyp2geWBsQUupCBHFQGgChxqavMgLsGNJRWtvo4loJIYICrQZGMpDIFugAUgwIF1gKPCAHsz6ROgRQBCyXQJmZmZsuSrZkauehngIAUh01zJAFaz0r3PzhQAVNkUIAAQOfD0G3/b5AEcLleQZOpPAEAHYOy1/UdR9Q6AZAAA8GRWPQoAax+/53EESMqANLD2EnvIr7Ytrn3eY2NmlZuZJmE8FcgCEABSSMHoi5/7b51j5uznnAL4mTqcA6VMOjPXDNJwrhO+dElnrTSkibLuca3Puj+vj1a/b01XA6PweXunWClsBAjVxJOhPvsA";
  const GZIP_B64 = "H4sIAAAAAAAACr1U243cMAysYUhd/ofaK0AWUoB33cAd4AbSfxEBKcmWzwvkL8QCK0vkkBw+doQInraCyOCyAahItQL0JzOzXGuxWUTxQ9h+cS8csPRLE9BM0NEA0hXUFQANS/EP1+tg5Sf+7Ci0ZVyc3jCgm9YkMvSG8qFgdoXuOLNDRqy4PB7uVx6WcsK+cT9Onj/oGdBZ9IwNQp6hTa4vsbDjyD3GN0Jgbbm5l4PP9G/LCWFKIcd36Zf6TsfiuXHRuUwcBTtR73mmuLvSf9f6PyKDZPUkBLwGoj1AQiSKid7orf1ESiiFkY2mLKf14ab9eTm01SQFRkcsxeeG61DnhUUJesQY0cSIWnSpfBA+YrIQj4GVznKEkSwio+uVosJSMgNhkqhTmepw6TmBpOj+z33fvz/3b5iMYBMWLDFxIkb8ujYrj4EzFC3402vt/l7ToIjhLquYEuu1ObSkr5ySDEMOFqXNjxanqXg1vnxBBJdLydVizZhDovqBXlOYD3VbV7d64ejtTqmBD+BZfxPZYJa55YnJpxHJX44VaUIzW2LvRIBZs79++PIUmqr07eBdBa2GRTet22NzeVVQqC0za0RsL7wiHG1BlTNeadtGnLk4quEvd/KASfUFAAA=";
  const EXPECTED_SHA = "3469c9067eade08b6a0213345d3d22f0751790e425d67eb304c72faf5c29e858";
  const COUNT = 10;
  const WARMUPS = 2;
  const report = {
    viewerPath: location.pathname,
    bitmapNumber: 840000,
    counts: { measuredPerCodec: COUNT, warmupsPerCodec: WARMUPS },
    compressedBytes: { brotli: null, gzip: null },
    packedBytes: 1525,
    moduleWasAlreadyLoaded: typeof globalThis.BrotliOC?.decompress === "function",
    loaderPath: "/content/" + BROTLI_OC_ID,
    moduleImportMs: null,
    nativeBrotliStream: false,
    integrityMatch: false,
    initialDecodeMs: {},
    firstDecodeMs: {},
    warmupsMs: {},
    warm: {},
    samplesMs: { brotli: [], gzip: [] },
    errors: []
  };
  const now = () => performance.now();
  const rounded = n => Math.round(n * 1000) / 1000;
  const bytes = b64 => Uint8Array.from(atob(b64), c => c.charCodeAt(0));
  const inputBr = bytes(BR_B64), inputGz = bytes(GZIP_B64);
  report.compressedBytes = { brotli: inputBr.length, gzip: inputGz.length };
  function asBytes(result) {
    if (result instanceof Uint8Array) return result;
    if (result instanceof ArrayBuffer) return new Uint8Array(result);
    if (result && result.buffer instanceof ArrayBuffer &&
        Number.isInteger(result.byteLength))
      return new Uint8Array(result.buffer, result.byteOffset || 0, result.byteLength);
    throw new TypeError("Decompressor did not return binary bytes");
  }
  async function gzipDecode() {
    const stream = new Blob([inputGz]).stream().pipeThrough(new DecompressionStream("gzip"));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }
  function compare(a,b) {
    if (a.length !== b.length) return false;
    for(let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
  }
  async function sha256(data) {
    const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", data));
    return Array.from(bytes, value => value.toString(16).padStart(2, "0")).join("");
  }
  async function measure(fn, verify, label) {
    const start = now();
    const data = asBytes(await fn());
    const ms = rounded(now() - start);
    if (data.length !== 1525 || !compare(data, verify))
      throw new Error(label + " output did not match canonical packed bytes");
    return ms;
  }
  function stats(times) {
    const sorted = times.slice().sort((a,b)=>a-b);
    const n = sorted.length;
    const median = n%2 ? sorted[(n-1)/2] : (sorted[n/2-1]+sorted[n/2])/2;
    return {
      medianMs: rounded(median),
      meanMs: rounded(times.reduce((sum,t)=>sum+t,0)/n),
      p90Ms: sorted[Math.ceil(n*.9)-1],
      minMs: sorted[0],
      maxMs: sorted[n-1]
    };
  }
  try {
    if (typeof DecompressionStream !== "function") throw Error("Native gzip DecompressionStream is unavailable");
    new DecompressionStream("gzip");
    try { new DecompressionStream("brotli"); report.nativeBrotliStream = true; } catch {}
    const moduleStart = now();
    await import("/content/" + BROTLI_OC_ID);
    report.moduleImportMs = rounded(now() - moduleStart);
    const oc = globalThis.BrotliOC;
    if (typeof oc?.decompress !== "function") throw Error("On-chain BrotliOC.decompress missing");
    const brotliDecode = async () => asBytes(await oc.decompress(inputBr));

    // Validate both formats against one another and the previously reported SHA.
    let initialStart=now();
    const gzReference = await gzipDecode();
    report.initialDecodeMs = {gzip:rounded(now()-initialStart)};
    if (gzReference.length !== 1525 || await sha256(gzReference) !== EXPECTED_SHA)
      throw Error("Native gzip result failed the recorded 840000 SHA-256");
    initialStart=now();
    const brReference = await brotliDecode();
    report.initialDecodeMs.brotli = rounded(now()-initialStart);
    if (!compare(brReference,gzReference)) throw Error("Brotli and gzip bytes differ");
    report.integrityMatch = true;
    // The first reference decode measures one-time setup. All subsequent
    // measurements separately measure warmed-up invocation costs.
    report.firstDecodeMs.brotli = await measure(brotliDecode, gzReference, "Brotli first");
    report.firstDecodeMs.gzip = await measure(gzipDecode, gzReference, "Gzip first");

    for(let i=0;i<WARMUPS;i++) {
      report.warmupsMs.brotli = [...(report.warmupsMs.brotli||[]),
        await measure(brotliDecode,gzReference,"Brotli warmup")];
      report.warmupsMs.gzip = [...(report.warmupsMs.gzip||[]),
        await measure(gzipDecode,gzReference,"Gzip warmup")];
    }

    // Alternate order to reduce bias from JIT, GC and background scheduling.
    for(let i=0;i<COUNT;i++) {
      if (i%2===0) {
        report.samplesMs.brotli.push(await measure(brotliDecode,gzReference,"Brotli"));
        report.samplesMs.gzip.push(await measure(gzipDecode,gzReference,"Gzip"));
      } else {
        report.samplesMs.gzip.push(await measure(gzipDecode,gzReference,"Gzip"));
        report.samplesMs.brotli.push(await measure(brotliDecode,gzReference,"Brotli"));
      }
    }
    report.warm.brotli = stats(report.samplesMs.brotli);
    report.warm.gzip = stats(report.samplesMs.gzip);
    report.brotliMedianOverGzip = rounded(report.warm.brotli.medianMs / report.warm.gzip.medianMs);
    console.table([
      { codec:"Brotli (on-chain)", compressedBytes:inputBr.length, ...report.warm.brotli },
      { codec:"Gzip (native)", compressedBytes:inputGz.length, ...report.warm.gzip }
    ]);
    console.log("Exact integrity match:",report.integrityMatch);
    console.log("Initial decodes (includes lazy setup):",report.initialDecodeMs);
    console.log("First subsequent decodes:",report.firstDecodeMs);
    console.log("Full report: window.__bitmapCodecBenchmark840000");
    return report;
  } catch (err) {
    report.errors.push(String(err?.message || err));
    console.error("840000 codec benchmark failed",err);
    return report;
  } finally {
    globalThis.__bitmapCodecBenchmark840000 = report;
  }
})();
