/*
 * Bitmap SDK - Ord viewer console probe
 * Open ordinals.com/content/<an HTML inscription id> or its preview.
 * Select the inscription iframe context in Developer Tools > Console, paste
 * this entire script, and press Enter. No wallet, signing or transactions.
 * Optional local overrides before pasting: edit HISTORICAL / MODERN / BLOCKS.
 */
(async () => {
  "use strict";
  const HISTORICAL = 177700;
  const MODERN = 950000;
  const BLOCKS = 2;
  const SDK = "/r/sat/25483050779204/at/-1/content";
  const started = performance.now();
  const requestCounts = { total:0, rawBlock:0, blockHash:0, inscription:0, other:0 };
  const report = {
    at: new Date().toISOString(), viewerPath: location.pathname,
    sdkPath: SDK, version: null, tip: null,
    cases: [], requestCounts, note:"Browser module imports and HTTP cache are not counted."
  };
  const original = globalThis.fetch;
  const nativeFetch = original.bind(globalThis);
  globalThis.fetch = async function (input, init) {
    const path = new URL(typeof input==="string" ? input : input.url,location.href).pathname;
    requestCounts.total++;
    if (/^\/r\/block\/[0-9a-f]+$/i.test(path)) requestCounts.rawBlock++;
    else if (path.startsWith("/r/blockhash/")) requestCounts.blockHash++;
    else if (path.startsWith("/r/inscription/")) requestCounts.inscription++;
    else requestCounts.other++;
    return nativeFetch(input,init);
  };
  const measured = async (label, run) => {
    const before={...requestCounts}, start=performance.now();
    try {
      const output=await run();
      const counts=Object.fromEntries(Object.keys(before).map(k=>[k,requestCounts[k]-before[k]]));
      report.cases.push({ label, status:"OK", durationMs:+(performance.now()-start).toFixed(1),requests:counts,output });
      console.log("[Bitmap test]",label,output,counts);
      return output;
    } catch(error) {
      report.cases.push({ label, status:"ERROR", durationMs:+(performance.now()-start).toFixed(1),message:String(error?.message||error) });
      console.error("[Bitmap test]",label,error);
      return null;
    }
  };
  try {
    const sdk=await measured("Import actual inscribed SDK",async()=>{
      const m=await import(SDK); const o=m.default || m.BitmapSDK;
      if(typeof o?.scanBitmapClaim!=="function") throw Error("SDK lacks bounded scan");
      report.version=o.VERSION??null;
      return o;
    });
    if (!sdk) return report;
    const height=await measured("Chain height",async()=>{
      const res=await fetch("/r/blockheight");
      if(!res.ok)throw Error("HTTP "+res.status);
      const n=Number(await res.text());
      if(!Number.isSafeInteger(n))throw Error("Not a chain height: "+n);
      report.tip=n;
      return n;
    });
    if (height===null) return report;
    await measured("Current tip hash",async()=>{
      const res=await fetch("/r/blockhash/"+height);
      if(!res.ok)throw Error("HTTP "+res.status);
      const hash=await res.json();
      if(!/^[0-9a-f]{64}$/i.test(hash))throw Error("Invalid block hash");
      return {hash,height};
    });
    await measured("Strict Bitmap parsing",async()=>{
      const good=sdk.parseBitmapName("12.bitmap");
      const bad=sdk.parseBitmapName("012.bitmap");
      if(good?.bitmapNumber!==12||bad!==null)throw Error("Unexpected parse result");
      return {valid:good,invalid:bad};
    });
    for (const bitmapNumber of [HISTORICAL,MODERN]) {
      if (bitmapNumber>height)continue;
      await measured("Bounded scan "+bitmapNumber,async()=>{
        const scan=await sdk.scanBitmapClaim(bitmapNumber,{maxScanBlocks:BLOCKS,persist:true});
        const result={bitmapNumber,state:scan.state,complete:scan.complete,
          scannedThroughHeight:scan.scannedThroughHeight??null,
          nextHeight:scan.nextHeight??null,inscriptionId:scan.inscriptionId??null};
        if(scan.state==="found"){
          const id=scan.inscriptionId,metaRes=await fetch("/r/inscription/"+id);
          if(!metaRes.ok)throw Error("Cannot independently read inscription metadata");
          const meta=await metaRes.json();
          result.inscriptionHeight=meta.height??null;
          result.inscriptionSat=meta.sat??null;
          result.sdkSat=await sdk.getBitmapSat(bitmapNumber);
          result.satAgreement=result.inscriptionSat===null?null:result.sdkSat===result.inscriptionSat;
          if(!/^[0-9a-f]{64}i[0-9]+$/i.test(id)||meta.height<bitmapNumber||result.satAgreement===false)
            throw Error("Inscription ID, height or sat mismatch");
        }
        return result;
      });
    }
    if(typeof sdk.indexBitmapBlocks==="function"&&height>=942010){
      const startHeight=height-8, options={startHeight,endHeight:startHeight+1,
        maxBlocks:2,concurrency:2,confirmations:6,persist:true};
      await measured("v1.0.3 force-refresh two-block index",()=>sdk.indexBitmapBlocks({...options,forceRefresh:true}));
      const warm=await measured("v1.0.3 warm two-block index",()=>sdk.indexBitmapBlocks(options));
      if(warm?.reusedBlocks!==2)console.warn("[Bitmap test] Expected two reusable blocks",warm);
      await measured("IndexedDB index status",()=>sdk.storage.getStatus());
    }else{
      report.cases.push({label:"v1.0.3 index benchmark",status:"SKIPPED",
        reason:"On-chain SDK does not export indexBitmapBlocks() or modern confirmed blocks unavailable"});
    }
    return report;
  } finally {
    globalThis.fetch=original;
    report.elapsedMs=+(performance.now()-started).toFixed(1);
    console.table(report.cases.map(x=>({test:x.label,status:x.status,timeMs:x.durationMs??null,
      rawBlocks:x.requests?.rawBlock??0,hashChecks:x.requests?.blockHash??0,
      inscriptionChecks:x.requests?.inscription??0})));
    console.log("COPY THIS JSON (also available as window.__bitmapOrdProbeReport):\n",JSON.stringify(report,null,2));
    globalThis.__bitmapOrdProbeReport=report;
  }
})();
