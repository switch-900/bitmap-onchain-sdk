/*
 * Bitmap 840000: raw hexadecimal conversion benchmark inside Ord viewer.
 * Paste into an HTML inscription /content/... DevTools Console.
 * Fetches the same-origin raw Bitcoin block ONCE, performs read-only
 * conversions and compares exact decoded bytes. No wallet or writes.
 */
(async () => {
  "use strict";
  const height = 840000, path = "/r/block/" + height;
  const report = {
    height, ranAt:new Date().toISOString(),viewerPath:location.pathname,
    nativeSupported:typeof Uint8Array.fromHex === "function",
    httpMs:null, jsonMs:null, hexChars:null, bytes:null, timings:{},
    equalBytes:null, errors:[],
    note:"JSON timing includes body transfer and JSON decoding; timings vary with browser caching."
  };
  function ms(start) { return +(performance.now()-start).toFixed(1); }
  function oldDecode(hex) {
    if(typeof hex!=="string"||hex.length<162||hex.length%2!==0||
      !/^[0-9a-f]+$/i.test(hex))throw Error("bad block hex");
    const out=new Uint8Array(hex.length/2);
    for(let i=0;i<out.length;i++)
      out[i]=Number.parseInt(hex.slice(i*2,i*2+2),16);
    return out;
  }
  function nib(c) {
    if(c>=48&&c<=57)return c-48;
    if(c>=65&&c<=70)return c-55;
    if(c>=97&&c<=102)return c-87;
    return -1;
  }
  function fallbackDecode(hex) {
    if(typeof hex!=="string"||hex.length<162||hex.length%2!==0)
      throw Error("bad block hex");
    const out=new Uint8Array(hex.length/2);
    for(let i=0,j=0;i<out.length;i++,j+=2){
      const hi=nib(hex.charCodeAt(j)),lo=nib(hex.charCodeAt(j+1));
      if(hi<0||lo<0)throw Error("bad block hex");
      out[i]=hi*16+lo;
    }
    return out;
  }
  try {
    let started=performance.now();
    const response=await fetch(path);
    report.httpMs=ms(started);
    if(!response.ok)throw Error(path+" HTTP "+response.status);
    started=performance.now();
    const hex=await response.json();
    report.jsonMs=ms(started);
    report.hexChars=typeof hex==="string"?hex.length:null;
    if(typeof hex!=="string")throw Error("Ord recursive block must be JSON hexadecimal");
    let old, native, fallback;
    started=performance.now();
    old=oldDecode(hex);
    report.timings.legacyParseIntMs=ms(started);
    started=performance.now();
    fallback=fallbackDecode(hex);
    report.timings.validatedFallbackMs=ms(started);
    if(report.nativeSupported){
      started=performance.now();
      native=Uint8Array.fromHex(hex);
      report.timings.nativeFromHexMs=ms(started);
    }
    report.bytes=old.length;
    started=performance.now();
    function identical(a,b){
      if(a.length!==b.length)return false;
      for(let i=0;i<a.length;i++)if(a[i]!==b[i])return false;
      return true;
    }
    report.equalBytes=identical(old,fallback) && (!native||identical(old,native));
    report.compareMs=ms(started);
    if(!report.equalBytes)throw Error("Mismatch between native/fallback/legacy decoders");
    console.table(report.timings);
    console.log("Actual Bitmap 840000 raw-block decoder report:",JSON.stringify(report,null,2));
    return report;
  } catch(err) {
    report.errors.push(String(err?.message||err));
    console.error("[Bitmap 840000 hex benchmark]",err);
    return report;
  } finally {
    globalThis.__bitmapHex840000Report=report;
  }
})();
