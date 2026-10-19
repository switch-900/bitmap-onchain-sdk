/*
  Bitmap 840000 Mondrian performance profiler for Ordinals HTML viewer.
  Paste directly into the DevTools Console of an Ord /content/<html-id> frame.
  No wallet, signatures, transactions or external network providers.
  The canonical sat currently serves v1.0.2; onTiming profiling needs v1.0.3.
  To test v1.0.3 after a separate staging inscription exists, put that ID here.
*/
(async () => {
  "use strict";
  const BITMAP = 840000;
  const STAGING_INSCRIPTION_ID = "";
  const CANONICAL_SDK = "/r/sat/25483050779204/at/-1/content";
  if (STAGING_INSCRIPTION_ID &&
      !/^[0-9a-f]{64}i[0-9]+$/i.test(STAGING_INSCRIPTION_ID))
    throw Error("STAGING_INSCRIPTION_ID must be a real Bitcoin inscription ID");
  const sdkPath = STAGING_INSCRIPTION_ID
    ? "/content/" + STAGING_INSCRIPTION_ID : CANONICAL_SDK;
  const nativeFetch = globalThis.fetch;
  const observations = [];
  const timings = [];
  const totals = { fetchCalls:0, rawBlockFetches:0, rawBlockHTTPMs:0,
    rawBlockJSONMs:0, blockInfoFetches:0, blockInfoHTTPMs:0 };
  const report = {
    testedAt:new Date().toISOString(),
    viewerPath:location.pathname,
    bitmapNumber:BITMAP, sdkPath, sdkVersion:null,
    source:null, slots:null, emptySpaces:null,
    cases:[], timingEvents:timings, requests:observations, totals,
    limitations:[
      "Warm-network caches can affect wall time.",
      "fetch() instrumentation excludes ESM imports and browser traffic not initiated by fetch().",
      "Timing stages require the updated SDK; v1.0.2 ignores onTiming.",
      "HTTP fetch latency includes the browser cache and asynchronous scheduling.",
      "IndexedDB updates are local browser data only. No wallets or blockchain writes."
    ]
  };
  function now(){return performance.now();}
  function rounded(ms){return Math.round(ms*10)/10;}
  function pathFor(input) {
    return new URL(typeof input==="string" ? input:input.url,location.href).pathname;
  }
  globalThis.fetch = async function(input,init) {
    const path = pathFor(input);
    const raw = path==="/r/block/"+BITMAP;
    const blockInfo = path==="/r/blockinfo/"+BITMAP;
    totals.fetchCalls++;
    if(raw) totals.rawBlockFetches++;
    if(blockInfo) totals.blockInfoFetches++;
    const record = {path,status:null,ok:null,httpMs:null,jsonMs:null};
    observations.push(record);
    const started = now();
    const response = await nativeFetch.call(globalThis,input,init);
    record.httpMs = rounded(now()-started);
    record.ok = response.ok;
    record.status = response.status;
    if(raw)totals.rawBlockHTTPMs+=record.httpMs;
    if(blockInfo)totals.blockInfoHTTPMs+=record.httpMs;
    if(raw || blockInfo) {
      // Timing the response.json method does not change decoded values.
      // Failure to attach a property (some browsers) will be reported.
      const nativeJSON = response.json.bind(response);
      try {
        response.json = async (...args)=>{
          const t=now();
          try {return await nativeJSON(...args);}
          finally {
            record.jsonMs=rounded(now()-t);
            if(raw) totals.rawBlockJSONMs+=record.jsonMs;
          }
        };
        record.jsonInstrumented = response.json!==undefined;
      } catch(err) {
        record.jsonInstrumented = false;
        record.note = "Response.json method could not be wrapped";
      }
    }
    return response;
  };
  async function measure(label,fn) {
    const started=now();
    const beforeFetch=totals.fetchCalls,beforeRaw=totals.rawBlockFetches;
    try {
      const value=await fn();
      const entry={
        label,status:"PASS",elapsedMs:rounded(now()-started),
        fetchCalls:totals.fetchCalls-beforeFetch,rawBlockFetches:totals.rawBlockFetches-beforeRaw,
        slots:value.slots?.length??null,
        emptySpaces:Array.isArray(value.emptySpaces)?value.emptySpaces.length:null,
        source:value.source??null
      };
      report.cases.push(entry);
      console.log("[Bitmap Mondrian]",label,entry);
      return value;
    } catch(err) {
      const entry={label,status:"ERROR",elapsedMs:rounded(now()-started),
        message:String(err?.message||err)};
      report.cases.push(entry);
      console.error("[Bitmap Mondrian]",entry);
      return null;
    }
  }
  try {
    const loadedAt=now();
    const module = await import(sdkPath);
    const sdk = module.default || module.BitmapSDK;
    if (!sdk || typeof sdk.getBitmapMondrian!=="function")
      throw Error("The on-chain module does not export getBitmapMondrian()");
    report.sdkVersion = sdk.VERSION;
    report.importMs = rounded(now()-loadedAt);
    // Forced live path (even with an existing saved geometry). This is not
    // necessarily a cold browser HTTP cache, but always executes the raw parser.
    const live = await measure("Force-live full geometry, incl. gaps",()=>
      sdk.getBitmapMondrian(BITMAP,{
        forceLive:true,includeEmptySpaces:true,persist:true,
        onTiming:event=>timings.push(event)
      })
    );
    if (live) {
      report.slots=live.slots?.length??null;
      report.emptySpaces=live.emptySpaces?.length??null;
      report.source=live.source??null;
    }
    await measure("Cached full geometry, incl. gaps",()=>
      sdk.getBitmapMondrian(BITMAP,{
        includeEmptySpaces:true,
        onTiming:event=>timings.push({...event,run:"cached"})
      })
    );
    console.table(report.cases);
    if (timings.length) {
      console.log("Measured SDK stage timings:");
      console.table(timings);
    } else {
      console.log("No SDK stage telemetry. This is expected when the canonical sat still serves v1.0.2.");
    }
    console.log("Bitmap profiler JSON:",JSON.stringify(report,null,2));
    return report;
  } finally {
    globalThis.fetch=nativeFetch;
    globalThis.__bitmapMondrian840000Report=report;
    console.log("Fetch instrumentation restored. JSON saved to window.__bitmapMondrian840000Report.");
  }
})();
