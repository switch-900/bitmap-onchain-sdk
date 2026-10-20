/*
 * Read-only real-pattern metadata benchmark.
 * Run in any same-origin Ordinals HTML inscription viewer.
 * First reuses the optional window.__bitmapReal3BlockPackedFixture.
 * If missing (after refresh/tab switch), automatically reconstructs it:
 * 840000 from the recorded on-chain Brotli fixture, two neighbouring
 * blocks from the inscribed SDK's recursive raw-block derivation.
 * Never writes to persistent storage, wallets, or Bitcoin.
 *
 * IMPORTANT: v2 deletes per-record SHA-256. Instead an external directory
 * would need to anchor the WHOLE BUNDLE digest. A checksum is not proof
 * of derivation from Bitcoin. This is a format measurement, not an SDK change.
 */
(async()=>{
  "use strict";
  const heights=[839999,840000,840001];
  let originals=globalThis.__bitmapReal3BlockPackedFixture;
  let reconstructedMissingFixture=false;
  let rawHeightsFetched=[];
  let fixtureRebuildMs=0;
  const hash=async data=>Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",data)),
    x=>x.toString(16).padStart(2,"0")).join("");
  const asBytes=x=>x instanceof Uint8Array?x:new Uint8Array(x);
  const eq=(a,b)=>a.length===b.length&&a.every((x,i)=>x===b[i]);
  const hexBytes=h=>{
    if(typeof h!=="string"||!/^[a-f0-9]{64}$/i.test(h))throw Error("Invalid 32-byte block hash");
    return Uint8Array.from({length:32},(_,i)=>parseInt(h.slice(2*i,2*i+2),16));
  };
  if(!Array.isArray(originals)||originals.length!==3){
    reconstructedMissingFixture=true;
    const start=performance.now();
    const SDK="/r/sat/25483050779204/at/-1/content";
    const BROTLI="/content/fb483c53bc6938c1df1e25e03e99f726d08a1c0d2db4e0e644c0baf3526a1d60i0";
    const BR_840000="G/QFgIzDOBb8clOELZ7eJinAb9Ypn++L+NqquHMHSEABaVZJRay7eRA/wbaLR62FXEHoEZwhT/RpQn0nCUQDN9l40RkiwlX/gPiZpzr1+uB23DdFZmbO+96zuSylM7UgBaLKRGciTUu0xSJYpUJEB9TGniIk0NZEUwp+kCLFQGaAEmAti4ICSABPoRBUvYhADNWQZtFhpJVS2qg9CEPyyjPQolucQ1hHcyp2geWBsQUupCBHFQGgChxqavMgLsGNJRWtvo4loJIYICrQZGMpDIFugAUgwIF1gKPCAHsz6ROgRQBCyXQJmZmZsuSrZkauehngIAUh01zJAFaz0r3PzhQAVNkUIAAQOfD0G3/b5AEcLleQZOpPAEAHYOy1/UdR9Q6AZAAA8GRWPQoAax+/53EESMqANLD2EnvIr7Ytrn3eY2NmlZuZJmE8FcgCEABSSMHoi5/7b51j5uznnAL4mTqcA6VMOjPXDNJwrhO+dElnrTSkibLuca3Puj+vj1a/b01XA6PweXunWClsBAjVxJOhPvsA";
    const HASH_840000="0000000000000000000320283a032748cef8227873ff4872689bf23f1cda83a5";
    const SHA_840000="3469c9067eade08b6a0213345d3d22f0751790e425d67eb304c72faf5c29e858";
    console.info("No prior in-tab fixture. Reconstructing 839999/840001 from two live recursive Bitcoin blocks (read-only).");
    const sdk=(await import(SDK)).default;
    if(typeof sdk?.getBlockHash!=="function"||
       typeof sdk?.getBitmapPattern!=="function")
      throw Error("Inscribed Bitmap SDK lacks required live pattern APIs");
    await import(BROTLI);
    if(typeof globalThis.BrotliOC?.decompress!=="function")
      throw Error("Inscribed BrotliOC.decompress unavailable");
    const compressed=Uint8Array.from(atob(BR_840000),c=>c.charCodeAt(0));
    const packed840000=asBytes(await globalThis.BrotliOC.decompress(compressed));
    if(packed840000.length!==1525 || await hash(packed840000)!==SHA_840000)
      throw Error("Captured 840000 packed fixture integrity check failed");
    const regenerated=[];
    for(const height of heights){
      const before=await sdk.getBlockHash(height);
      let packedBytes,transactionCount;
      if(height===840000){
        if(before!==HASH_840000)throw Error("840000 block hash changed");
        packedBytes=packed840000.slice();
        transactionCount=3050;
      }else{
        const pattern=await sdk.getBitmapPattern(height,{forceLive:true});
        if(!Array.isArray(pattern)||pattern.length<1||pattern.length>100000)
          throw Error("Invalid live pattern length for "+height);
        transactionCount=pattern.length;
        packedBytes=new Uint8Array(Math.ceil(transactionCount/2));
        for(let i=0;i<transactionCount;i++){
          const value=pattern[i];
          if(!Number.isInteger(value)||value<1||value>9)
            throw Error("Invalid live square size at "+height+":"+i);
          packedBytes[i>>1]|=value<<(i%2?0:4);
        }
        rawHeightsFetched.push(height);
      }
      const after=await sdk.getBlockHash(height);
      if(after!==before)throw Error("Bitcoin block hash changed while deriving "+height);
      regenerated.push({
        height,blockHash:after,packedSha256:await hash(packedBytes),
        transactionCount,packedBytes
      });
    }
    originals=regenerated;
    globalThis.__bitmapReal3BlockPackedFixture=regenerated;
    fixtureRebuildMs=Math.round((performance.now()-start)*10)/10;
  }
  const rows=originals.map((r,i)=>{
    const bytes=asBytes(r.packedBytes);
    if(r.height!==heights[i]||!Number.isSafeInteger(r.transactionCount)||
       bytes.length!==Math.ceil(r.transactionCount/2)||
       !/^[a-f0-9]{64}$/i.test(r.packedSha256))
       throw Error("Invalid saved block fixture at index "+i);
    return {...r,packedBytes:bytes.slice()};
  });
  for(const row of rows)
    if(await hash(row.packedBytes)!==row.packedSha256.toLowerCase())
      throw Error("Packed fixture checksum mismatch at height "+row.height);
  function makeBundle(items, mode){
    const per=mode==="v1"?76:mode==="lean"?44:null;
    if(per===null)throw Error("Unknown bundle format");
    const bytes=new Uint8Array(8+items.reduce((sum,r)=>sum+per+r.packedBytes.length,0));
    const view=new DataView(bytes.buffer);
    bytes.set([66,77,80,66,mode==="v1"?1:2,0],0);
    view.setUint16(6,items.length,false);
    let off=8;
    for(const r of items){
      view.setUint32(off,r.height,false);off+=4;
      view.setUint32(off,r.transactionCount,false);off+=4;
      bytes.set(hexBytes(r.blockHash),off);off+=32;
      if(mode==="v1"){bytes.set(hexBytes(r.packedSha256),off);off+=32;}
      view.setUint32(off,r.packedBytes.length,false);off+=4;
      bytes.set(r.packedBytes,off);off+=r.packedBytes.length;
    }
    if(off!==bytes.length)throw Error("Bad bundle offset");
    return bytes;
  }
  function readBundle(bytes,mode){
    const per=mode==="v1"?76:44,ver=mode==="v1"?1:2;
    if(bytes.length<8||!eq(bytes.subarray(0,6),Uint8Array.of(66,77,80,66,ver,0)))
      throw Error("Invalid bundle signature/version");
    const dv=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
    const n=dv.getUint16(6,false);if(!n||n>128)throw Error("Bad record count");
    let at=8,previous=-1;
    const results=[];
    for(let i=0;i<n;i++){
      if(bytes.length-at<per)throw Error("Truncated header");
      const height=dv.getUint32(at,false);at+=4;
      const txCount=dv.getUint32(at,false);at+=4;
      if(height<=previous||txCount<1||txCount>100000)throw Error("Invalid record ordering/count");
      previous=height;
      const blockHash=Array.from(bytes.subarray(at,at+32),b=>b.toString(16).padStart(2,"0")).join("");at+=32;
      let digest=null;
      if(mode==="v1"){
        digest=Array.from(bytes.subarray(at,at+32),b=>b.toString(16).padStart(2,"0")).join("");
        at+=32;
      }
      const len=dv.getUint32(at,false);at+=4;
      if(len!==Math.ceil(txCount/2)||len>bytes.length-at)throw Error("Bad pattern length");
      const payload=bytes.subarray(at,at+len);at+=len;
      if(txCount%2&&(payload.at(-1)&15))throw Error("Bad padding nibble");
      for(let j=0;j<txCount;j++){
        const value=(payload[j>>1]>>(j%2?0:4))&15;
        if(value<1||value>9)throw Error("Invalid size class");
      }
      results.push({height,txCount,blockHash,digest,packedBytes:payload});
    }
    if(at!==bytes.length)throw Error("Unexpected trailing data");
    return results;
  }
  // The inscribed BrotliOC can already be loaded from the earlier benchmark,
  // or it can be loaded independently in this same-origin Ord browser.
  if(typeof globalThis.BrotliOC?.compress!=="function"||
     typeof globalThis.BrotliOC?.decompress!=="function")
    await import("/content/fb483c53bc6938c1df1e25e03e99f726d08a1c0d2db4e0e644c0baf3526a1d60i0");
  const oc=globalThis.BrotliOC;
  if(typeof oc?.compress!=="function"||typeof oc?.decompress!=="function")
    throw Error("On-chain BrotliOC missing compress/decompress functions");
  const compress=async bytes=>asBytes(await oc.compress(bytes,{quality:11}));
  const decompress=async bytes=>asBytes(await oc.decompress(bytes));
  const metrics=[];
  for(const mode of ["v1","lean"]){
    const raw=makeBundle(rows,mode);
    const read=readBundle(raw,mode);
    for(let i=0;i<rows.length;i++){
      const a=rows[i],b=read[i];
      if(a.height!==b.height||a.transactionCount!==b.txCount||
         a.blockHash.toLowerCase()!==b.blockHash||!eq(a.packedBytes,b.packedBytes)||
         (mode==="v1"&&a.packedSha256!==b.digest))
        throw Error(mode+" roundtrip mismatch at height "+a.height);
    }
    const compressed=await compress(raw);
    if(!eq(await decompress(compressed),raw))
      throw Error(mode+" Brotli roundtrip mismatch");
    let sumStandalone=0;
    for(const row of rows){
      const single=makeBundle([row],mode);
      const singleCompressed=await compress(single);
      if(!eq(await decompress(singleCompressed),single))
        throw Error(mode+" separate-record roundtrip mismatch");
      sumStandalone+=singleCompressed.length;
    }
    const sha=await hash(raw);
    metrics.push({format:mode,recordHeaderBytes:mode==="v1"?76:44,
      uncompressedBytes:raw.length,
      combinedBrotliBytes:compressed.length,
      separateSelfDescribingBrotliBytes:sumStandalone,
      bundleSHA256ForExternalDirectory:sha,
      recordRoundtrip:true});
  }
  const v1=metrics[0],lean=metrics[1];
  const report={
    source:reconstructedMissingFixture?
      "840000 verified fixture plus freshly derived 839999/840001 raw blocks":
      "reused previous in-tab 839999,840000,840001 packed fixture",
    fixtureRebuilt:reconstructedMissingFixture,
    rawHeightsFetched,
    fixtureRebuildMs,
    noRawBlockFetch:rawHeightsFetched.length===0,
    note:"A separate index directory would need to authenticate and address the lean whole-bundle SHA-256. Neither an in-bundle nor directory checksum proves that Bitcoin output totals yield these patterns.",
    metrics,
    savedUncompressedBytes:v1.uncompressedBytes-lean.uncompressedBytes,
    savedCompressedBytes:v1.combinedBrotliBytes-lean.combinedBrotliBytes,
    errors:[]
  };
  globalThis.__bitmap3BlockHeaderComparison=report;
  console.table(metrics.map(({bundleSHA256ForExternalDirectory,...m})=>m));
  console.log("Bundle SHA-256 anchors:",metrics.map(r=>({format:r.format,sha256:r.bundleSHA256ForExternalDirectory})));
  console.log("Report: window.__bitmap3BlockHeaderComparison");
  return report;
})();