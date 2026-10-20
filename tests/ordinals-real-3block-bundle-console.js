/*
 * Read-only 3-REAL-block compact Mondrian bundle experiment.
 * DevTools Console on ordinals.com/content/<HTML_INSCRIPTION_ID>.
 * Reuses the previously verified 840000 Brotli fixture; only downloads
 * the two NEIGHBOURING raw blocks using the canonical on-chain SDK.
 * Generates no inscription, transaction, PSBT, upload or wallet request.
 *
 * Results are real for heights 839999, 840000 and 840001 only.
 * They cannot be extrapolated to 32/64/128 blocks without more sampling.
 */
(async () => {
  "use strict";
  const HEIGHTS=[839999,840000,840001];
  const MONDRIAN_SDK="/r/sat/25483050779204/at/-1/content";
  const BROTLI_OC="/content/fb483c53bc6938c1df1e25e03e99f726d08a1c0d2db4e0e644c0baf3526a1d60i0";
  const H_840000="0000000000000000000320283a032748cef8227873ff4872689bf23f1cda83a5";
  const SHA_840000="3469c9067eade08b6a0213345d3d22f0751790e425d67eb304c72faf5c29e858";
  const BR_840000="G/QFgIzDOBb8clOELZ7eJinAb9Ypn++L+NqquHMHSEABaVZJRay7eRA/wbaLR62FXEHoEZwhT/RpQn0nCUQDN9l40RkiwlX/gPiZpzr1+uB23DdFZmbO+96zuSylM7UgBaLKRGciTUu0xSJYpUJEB9TGniIk0NZEUwp+kCLFQGaAEmAti4ICSABPoRBUvYhADNWQZtFhpJVS2qg9CEPyyjPQolucQ1hHcyp2geWBsQUupCBHFQGgChxqavMgLsGNJRWtvo4loJIYICrQZGMpDIFugAUgwIF1gKPCAHsz6ROgRQBCyXQJmZmZsuSrZkauehngIAUh01zJAFaz0r3PzhQAVNkUIAAQOfD0G3/b5AEcLleQZOpPAEAHYOy1/UdR9Q6AZAAA8GRWPQoAax+/53EESMqANLD2EnvIr7Ytrn3eY2NmlZuZJmE8FcgCEABSSMHoi5/7b51j5uznnAL4mTqcA6VMOjPXDNJwrhO+dElnrTSkibLuca3Puj+vj1a/b01XA6PweXunWClsBAjVxJOhPvsA";
  const report={schema:"bitmap-mondrian-3block-test-v1",heights:HEIGHTS,
    source:"2 live raw Bitcoin blocks + 1 previously verified raw-derived fixture",
    runtimePath:location.pathname,records:[],
    codecImportMs:null,rawFetchMs:null,packedBytes:null,recordHeaderBytes:76,
    bundleBytes:null,brotliBytes:null,gzipBytes:null,
    brotliCompressMs:null,gzipCompressMs:null,
    brotliRoundtrip:false,gzipRoundtrip:false,recordRoundtrip:false,
    trustedForProduction:false,errors:[]};
  const start=performance.now();
  const round=n=>Math.round(n*10)/10;
  const decodeB64=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
  const hex=bytes=>Array.from(bytes,b=>b.toString(16).padStart(2,"0")).join("");
  async function digest(bytes){return hex(new Uint8Array(await crypto.subtle.digest("SHA-256",bytes)));}
  function pack(pattern){
    if(!Array.isArray(pattern)||pattern.length<1||pattern.length>100000)throw Error("Invalid pattern length");
    const bytes=new Uint8Array(Math.ceil(pattern.length/2));
    pattern.forEach((v,i)=>{
      if(!Number.isInteger(v)||v<1||v>9)throw Error("Bad square at index "+i);
      bytes[i>>1]|=v<<(i%2?0:4);
    });
    return bytes;
  }
  function unpack(data,count){
    if(data.length!==Math.ceil(count/2))throw Error("Invalid packed count");
    if(count%2&&(data.at(-1)&15))throw Error("Invalid low nibble padding");
    const out=new Array(count);
    for(let i=0;i<count;i++){
      const n=(data[i>>1]>>(i%2?0:4))&15;
      if(n<1||n>9)throw Error("Out-of-range pattern value");
      out[i]=n;
    }
    return out;
  }
  function hex32(hash){
    if(typeof hash!=="string"||!/^[a-f0-9]{64}$/i.test(hash))throw Error("Invalid block hash");
    return Uint8Array.from({length:32},(_,i)=>parseInt(hash.slice(i*2,i*2+2),16));
  }
  function equal(a,b){return a.length===b.length&&a.every((value,i)=>value===b[i]);}
  async function gzipCompress(data){
    const response=new Blob([data]).stream().pipeThrough(new CompressionStream("gzip"));
    return new Uint8Array(await new Response(response).arrayBuffer());
  }
  async function gzipDecompress(data){
    const response=new Blob([data]).stream().pipeThrough(new DecompressionStream("gzip"));
    return new Uint8Array(await new Response(response).arrayBuffer());
  }
  function makeBundle(entries){
    // v1 experimental bundle: BMPB, 1, 0, record count u16 BE,
    // records: u32 BE height, u32 BE count, 32-byte block hash,
    // 32-byte SHA-256 of packed, u32 BE packed length, bytes.
    const length=8+entries.reduce((acc,e)=>acc+76+e.packed.length,0);
    if(length>8*1024*1024||entries.length>128)throw Error("Bundle is too large");
    const data=new Uint8Array(length),view=new DataView(data.buffer);
    data.set([66,77,80,66,1,0],0);
    view.setUint16(6,entries.length,false);
    let offset=8;
    for(const e of entries){
      view.setUint32(offset,e.height,false);offset+=4;
      view.setUint32(offset,e.pattern.length,false);offset+=4;
      data.set(hex32(e.blockHash),offset);offset+=32;
      data.set(hex32(e.packedSha),offset);offset+=32;
      view.setUint32(offset,e.packed.length,false);offset+=4;
      data.set(e.packed,offset);offset+=e.packed.length;
    }
    return data;
  }
  function extractBundle(data){
    if(data.length<8||!equal(data.subarray(0,6),Uint8Array.of(66,77,80,66,1,0)))
      throw Error("Malformed bundle magic");
    const view=new DataView(data.buffer,data.byteOffset,data.byteLength);
    const count=view.getUint16(6,false);
    let at=8,last=-1;
    const entries=[];
    for(let i=0;i<count;i++){
      if(data.length-at<76)throw Error("Incomplete record");
      const height=view.getUint32(at,false);at+=4;
      const txCount=view.getUint32(at,false);at+=4;
      if(height<=last||txCount<1||txCount>100000)throw Error("Bad record ordering/count");
      last=height;
      const blockHash=hex(data.subarray(at,at+32));at+=32;
      const sha=hex(data.subarray(at,at+32));at+=32;
      const len=view.getUint32(at,false);at+=4;
      if(len!==Math.ceil(txCount/2)||len>data.length-at)throw Error("Bad record length");
      const packed=data.subarray(at,at+len);at+=len;
      entries.push({height,txCount,blockHash,sha,packed});
    }
    if(at!==data.length)throw Error("Unexpected trailing bytes");
    return entries;
  }
  try{
    const sdk=(await import(MONDRIAN_SDK)).default;
    if(typeof sdk.getBitmapPattern!=="function"||typeof sdk.getBlockHash!=="function")
      throw Error("Required Bitmap SDK methods are missing");
    let t=performance.now();
    await import(BROTLI_OC);
    report.codecImportMs=round(performance.now()-t);
    const OC=globalThis.BrotliOC;
    if(typeof OC?.compress!=="function"||typeof OC?.decompress!=="function")
      throw Error("On-chain BrotliOC module not available");
    const p840000=await OC.decompress(decodeB64(BR_840000));
    const packed840000=p840000 instanceof Uint8Array?p840000:new Uint8Array(p840000);
    if(packed840000.length!==1525||await digest(packed840000)!==SHA_840000)
      throw Error("Recorded 840000 checksum did not match");
    const pattern840000=unpack(packed840000,3050);
    const entries=[];
    t=performance.now();
    for(const height of HEIGHTS){
      const source=height===840000?"previously verified raw-derived fixture":"live raw block";
      const before=await sdk.getBlockHash(height);
      const pattern=height===840000?pattern840000:
        await sdk.getBitmapPattern(height,{forceLive:true});
      const after=await sdk.getBlockHash(height);
      if(after!==before)throw Error("Block hash changed at height "+height);
      if(height===840000&&after!==H_840000)throw Error("840000 block hash mismatch");
      const packed=pack(pattern),packedSha=await digest(packed);
      const info={height,blockHash:after,pattern,packed,packedSha,source};
      entries.push(info);
      report.records.push({height,source,txCount:pattern.length,
        packedBytes:packed.length,packedSHA256:packedSha,blockHash:after});
    }
    report.rawFetchMs=round(performance.now()-t);
    const bundle=makeBundle(entries);
    report.packedBytes=entries.reduce((n,e)=>n+e.packed.length,0);
    report.bundleBytes=bundle.length;
    const extracted=extractBundle(bundle);
    for(let i=0;i<entries.length;i++){
      const a=extracted[i],b=entries[i];
      if(a.height!==b.height||a.blockHash!==b.blockHash||
        a.txCount!==b.pattern.length||a.sha!==b.packedSha||!equal(a.packed,b.packed)||
        !equal(unpack(a.packed,a.txCount),b.pattern)||await digest(a.packed)!==a.sha)
        throw Error("Bundle encode/decode mismatch at height "+b.height);
    }
    report.recordRoundtrip=true;
    t=performance.now();
    const br=await OC.compress(bundle,{quality:11});
    const brBytes=br instanceof Uint8Array?br:new Uint8Array(br);
    report.brotliCompressMs=round(performance.now()-t);
    report.brotliBytes=brBytes.length;
    const brBack=await OC.decompress(brBytes);
    report.brotliRoundtrip=equal(brBack instanceof Uint8Array?brBack:new Uint8Array(brBack),bundle);
    t=performance.now();
    const gz=await gzipCompress(bundle);
    report.gzipCompressMs=round(performance.now()-t);
    report.gzipBytes=gz.length;
    report.gzipRoundtrip=equal(await gzipDecompress(gz),bundle);
    if(!report.brotliRoundtrip||!report.gzipRoundtrip)
      throw Error("Compressed bundle failed roundtrip");
    report.elapsedMs=round(performance.now()-start);
    console.table(report.records.map(r=>({
      height:r.height,source:r.source,transactions:r.txCount,packedBytes:r.packedBytes
    })));
    console.table({
      rawPackedBytes:report.packedBytes,
      bundleBytes:report.bundleBytes,
      brotli11Bytes:report.brotliBytes,
      gzipBytes:report.gzipBytes,
      allPatternsMatch:report.recordRoundtrip,
      brotliRoundtrip:report.brotliRoundtrip,
      gzipRoundtrip:report.gzipRoundtrip,
      elapsedMs:report.elapsedMs
    });
  }catch(error){
    report.errors.push(String(error?.message||error));
    console.error("3-block compact bundle experiment failed",error);
  }finally{
    globalThis.__bitmapReal3BlockBundleProbe=report;
    console.log("Report in window.__bitmapReal3BlockBundleProbe");
  }
  return report;
})();
