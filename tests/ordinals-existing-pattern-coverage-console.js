/*
 * Bitmap SDK on-chain pattern coverage probe — READ-ONLY.
 * Paste into an existing Ord HTML inscription DevTools Console.
 * Imports the existing canonical Bitmon/Mondrian inscription and checks
 * selected heights without calling /r/block/ or modifying caches.
 */
(async () => {
  "use strict";
  const MONDRIAN_ID = "55551557695dd82a2bda5ec3497684ec7cbb2cc1752ff5101accff1648666c3ai0";
  const SAMPLE_HEIGHTS = [177700, 500000, 700000, 767430, 800000, 840000, 900000, 960000];
  const results = [];
  const moduleStart = performance.now();
  const module = await import("/content/" + MONDRIAN_ID);
  const moduleLoadMs = Math.round((performance.now()-moduleStart)*10)/10;
  if (typeof module.getPatternArray !== "function") {
    throw new Error("Canonical on-chain Mondrian module lacks getPatternArray()");
  }
  for (const height of SAMPLE_HEIGHTS) {
    const started=performance.now();
    try {
      const pattern=module.getPatternArray(height);
      if (pattern == null || (Array.isArray(pattern) && pattern.length===0)) {
        results.push({height,indexed:false,txCount:null,patternLength:null,validSizes:null,
          indexLookupMs:Math.round((performance.now()-started)*1000)/1000});
        continue;
      }
      if (!Array.isArray(pattern)) throw Error("Pattern is not an array");
      const validSizes=pattern.every(n=>Number.isInteger(Number(n)) && n>=1 && n<=9);
      results.push({height,indexed:true,txCount:pattern.length,patternLength:pattern.length,
        validSizes,indexLookupMs:Math.round((performance.now()-started)*1000)/1000});
    } catch (error) {
      results.push({height,indexed:false,error:String(error?.message||error),
        indexLookupMs:Math.round((performance.now()-started)*1000)/1000});
    }
  }
  const out = {
    moduleId: MONDRIAN_ID,
    moduleLoadMs, heights: SAMPLE_HEIGHTS,
    confirmedIndexHits:results.filter(row=>row.indexed).length,
    note:"This probes existing module coverage only. It does not authenticate any pattern against raw Bitcoin output amounts.",
    rows:results
  };
  globalThis.__bitmapExistingIndexCoverage=out;
  console.table(results);
  console.log("Existing on-chain pattern index coverage:",out.confirmedIndexHits,"/",results.length);
  console.log("Full report at window.__bitmapExistingIndexCoverage");
  return out;
})();