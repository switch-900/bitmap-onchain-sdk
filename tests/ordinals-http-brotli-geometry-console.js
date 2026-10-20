/*
 * Bitmap 840000: read-only Ordinals content-encoding and compact geometry probe.
 * Run in DevTools in an HTML inscription on ordinals.com.
 * No raw-block request, wallet, writes, or new inscription.
 *
 * Two INDEPENDENT measurements:
 * (A) fetch a real existing content-encoding:br inscription and inspect
 *     whether browser/Ord serves its already-decoded HTML body.
 * (B) unpack the captured on-chain-compressible 840000 pattern and
 *     reconstruct occupied slots and gaps via the inscribed Mondrian primitive.
 * The pattern has NOT been inscribed. Part B uses an embedded verified fixture.
 */
(async () => {
  "use strict";
  const HEIGHT=840000;
  const BLOCK_HASH="0000000000000000000320283a032748cef8227873ff4872689bf23f1cda83a5";
  const PACKED_SHA="3469c9067eade08b6a0213345d3d22f0751790e425d67eb304c72faf5c29e858";
  const BR_B64="G/QFgIzDOBb8clOELZ7eJinAb9Ypn++L+NqquHMHSEABaVZJRay7eRA/wbaLR62FXEHoEZwhT/RpQn0nCUQDN9l40RkiwlX/gPiZpzr1+uB23DdFZmbO+96zuSylM7UgBaLKRGciTUu0xSJYpUJEB9TGniIk0NZEUwp+kCLFQGaAEmAti4ICSABPoRBUvYhADNWQZtFhpJVS2qg9CEPyyjPQolucQ1hHcyp2geWBsQUupCBHFQGgChxqavMgLsGNJRWtvo4loJIYICrQZGMpDIFugAUgwIF1gKPCAHsz6ROgRQBCyXQJmZmZsuSrZkauehngIAUh01zJAFaz0r3PzhQAVNkUIAAQOfD0G3/b5AEcLleQZOpPAEAHYOy1/UdR9Q6AZAAA8GRWPQoAax+/53EESMqANLD2EnvIr7Ytrn3eY2NmlZuZJmE8FcgCEABSSMHoi5/7b51j5uznnAL4mTqcA6VMOjPXDNJwrhO+dElnrTSkibLuca3Puj+vj1a/b01XA6PweXunWClsBAjVxJOhPvsA";
  const BR_CODEC="fb483c53bc6938c1df1e25e03e99f726d08a1c0d2db4e0e644c0baf3526a1d60i0";
  const MONDRIAN="55551557695dd82a2bda5ec3497684ec7cbb2cc1752ff5101accff1648666c3ai0";
  // This existing real inscription is indexed as text/html with encoding=br,
  // with 173 *on-chain* bytes; it is NOT the 840000 pattern inscription.
  const KNOWN_BR="6d4ae768dfa5f7c7a275673fc82a323fc0daf4a61f00e4dd538385ed1f62368ci278";
  const report={
    viewerPath:location.pathname,
    bitmap:HEIGHT,
    httpBr:{inscriptionId:KNOWN_BR,metadataEncoding:null,metadataType:null,
      status:null,headersMs:null,bodyMs:null,responseEncoding:null,
      reportedContentLength:null,decodedLength:null,bodyLooksLikeHtml:null,
      prefix:null,error:null},
    compact:{compressedBytes:405,packedBytes:1525,checksumValid:false,
      blockHashMatches:false,slotCount:null,emptySpaces:null,
      dimensions:null,codecImportMs:null,decodeMs:null,layoutImportMs:null,
      layoutMs:null,emptySpacesMs:null,totalMs:null,source:"embedded verified fixture",
      errors:[]}
  };
  const round=n=>Math.round(n*10)/10;
  const bytes=b64=>Uint8Array.from(atob(b64),c=>c.charCodeAt(0));
  const digest=async data=>Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",data)),
    b=>b.toString(16).padStart(2,"0")).join("");
  function unpack(packed,count) {
    if (!(packed instanceof Uint8Array) || packed.length!==Math.ceil(count/2))
      throw Error("Packed geometry bytes do not match transaction count");
    const result=Array(count);
    for(let i=0;i<count;i++){
      const n=(packed[i>>1]>>(i%2?0:4))&15;
      if(n<1 || n>9)throw Error("Unexpected size "+n+" at "+i);
      result[i]=n;
    }
    return result;
  }
  // Real HTTP test. ord may return 200 already decoded, 406 unsupported,
  // or another error, depending on Accept-Encoding and server configuration.
  // Do NOT set Accept-Encoding: it is controlled by the browser.
  try {
    const metadataResponse=await fetch("/r/inscription/"+KNOWN_BR);
    if(metadataResponse.ok) {
      const info=await metadataResponse.json();
      report.httpBr.metadataEncoding=info.content_encoding??null;
      report.httpBr.metadataType=info.content_type??null;
    }
    let t=performance.now();
    const response=await fetch("/content/"+KNOWN_BR);
    report.httpBr.headersMs=round(performance.now()-t);
    report.httpBr.status=response.status;
    report.httpBr.responseEncoding=response.headers.get("content-encoding");
    report.httpBr.reportedContentLength=response.headers.get("content-length");
    if(!response.ok) throw Error("Ord /content response HTTP "+response.status);
    t=performance.now();
    const body=new Uint8Array(await response.arrayBuffer());
    report.httpBr.bodyMs=round(performance.now()-t);
    report.httpBr.decodedLength=body.length;
    // The browser normally automatically decodes *HTTP* Content-Encoding.
    const prefix=new TextDecoder("utf-8",{fatal:false}).decode(body.subarray(0,192));
    report.httpBr.prefix=prefix.replace(/\s+/g," ").slice(0,120);
    report.httpBr.bodyLooksLikeHtml=/<!doctype|<html|<head|<body|<script|<style|<svg/i.test(prefix);
  } catch(error) {
    report.httpBr.error=String(error?.message??error);
  }

  // The remainder uses exact compact bytes from the user-verified manifest.
  // No network raw block lookup is needed to calculate pattern geometry.
  const compactStart=performance.now();
  try {
    let t=performance.now();
    await import("/content/"+BR_CODEC);
    report.compact.codecImportMs=round(performance.now()-t);
    const codec=globalThis.BrotliOC;
    if(typeof codec?.decompress!=="function")throw Error("Existing on-chain BrotliOC not available");
    t=performance.now();
    const data=await codec.decompress(bytes(BR_B64));
    const packed=data instanceof Uint8Array?data:new Uint8Array(data);
    report.compact.decodeMs=round(performance.now()-t);
    if(packed.length!==1525)throw Error("Wrong decompressed payload byte count");
    report.compact.checksumValid=(await digest(packed))===PACKED_SHA;
    if(!report.compact.checksumValid)throw Error("Compact pattern SHA-256 mismatch");
    t=performance.now();
    const hashResp=await fetch("/r/blockhash/"+HEIGHT);
    if(!hashResp.ok)throw Error("/r/blockhash/840000 returned "+hashResp.status);
    const onChainHash=await hashResp.json();
    report.compact.blockHashMatches=onChainHash===BLOCK_HASH;
    if(!report.compact.blockHashMatches)throw Error("Current height hash mismatches captured block");
    report.compact.blockHashFetchMs=round(performance.now()-t);
    const pattern=unpack(packed,3050);
    t=performance.now();
    const layoutModule=await import("/content/"+MONDRIAN);
    report.compact.layoutImportMs=round(performance.now()-t);
    if(typeof layoutModule.MondrianLayout!=="function")
      throw Error("Inscribed MondrianLayout export not found");
    t=performance.now();
    const layout=new layoutModule.MondrianLayout(pattern);
    report.compact.layoutMs=round(performance.now()-t);
    const occupied=layout.slots.map((slot,index)=>({
      parcelNumber:index,
      x:slot.position.x,y:slot.position.y,size:slot.size
    }));
    t=performance.now();
    const gaps=layout.fillEmptySpaces(true).map(s=>({
      x:s.position.x,y:s.position.y,size:s.size
    }));
    report.compact.emptySpacesMs=round(performance.now()-t);
    report.compact.slotCount=occupied.length;
    report.compact.emptySpaces=gaps.length;
    report.compact.dimensions=layout.getSize?.()??{width:layout.width,height:layout.height};
    if(occupied.length!==3050 || gaps.length!==48)
      throw Error("Unexpected geometry count: slots="+occupied.length+", gaps="+gaps.length);
    report.compact.totalMs=round(performance.now()-compactStart);
    console.table({
      compactBytes:report.compact.compressedBytes,
      packedBytes:report.compact.packedBytes,
      slots:report.compact.slotCount,
      gaps:report.compact.emptySpaces,
      decodedShaMatches:report.compact.checksumValid,
      blockHashMatches:report.compact.blockHashMatches,
      nativeHTTPStatus:report.httpBr.status,
      nativeHTTPLooksDecoded:report.httpBr.bodyLooksLikeHtml,
      nativeHTTPErr:report.httpBr.error
    });
  } catch(error) {
    report.compact.errors.push(String(error?.message??error));
    console.error("Compact geometry reconstruction failed:",error);
  } finally {
    globalThis.__bitmap840000TransportReport=report;
    console.log("Saved as window.__bitmap840000TransportReport");
  }
  return report;
})();
