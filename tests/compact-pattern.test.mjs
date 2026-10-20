import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { webcrypto } from "node:crypto";
import { brotliDecompressSync } from "node:zlib";
import { indexedDB, IDBKeyRange } from "fake-indexeddb";

const HEIGHT = 840000;
const REAL_HASH = "0000000000000000000320283a032748cef8227873ff4872689bf23f1cda83a5";
const REAL_SHA = "3469c9067eade08b6a0213345d3d22f0751790e425d67eb304c72faf5c29e858";
const REAL_GZIP = "H4sIAAAAAAAACr1U243cMAysYUhd/ofaK0AWUoB33cAd4AbSfxEBKcmWzwvkL8QCK0vkkBw+doQInraCyOCyAahItQL0JzOzXGuxWUTxQ9h+cS8csPRLE9BM0NEA0hXUFQANS/EP1+tg5Sf+7Ci0ZVyc3jCgm9YkMvSG8qFgdoXuOLNDRqy4PB7uVx6WcsK+cT9Onj/oGdBZ9IwNQp6hTa4vsbDjyD3GN0Jgbbm5l4PP9G/LCWFKIcd36Zf6TsfiuXHRuUwcBTtR73mmuLvSf9f6PyKDZPUkBLwGoj1AQiSKid7orf1ESiiFkY2mLKf14ab9eTm01SQFRkcsxeeG61DnhUUJesQY0cSIWnSpfBA+YrIQj4GVznKEkSwio+uVosJSMgNhkqhTmepw6TmBpOj+z33fvz/3b5iMYBMWLDFxIkb8ujYrj4EzFC3402vt/l7ToIjhLquYEuu1ObSkr5ySDEMOFqXNjxanqXg1vnxBBJdLydVizZhDovqBXlOYD3VbV7d64ejtTqmBD+BZfxPZYJa55YnJpxHJX44VaUIzW2LvRIBZs79++PIUmqr07eBdBa2GRTet22NzeVVQqC0za0RsL7wiHG1BlTNeadtGnLk4quEvd/KASfUFAAA=";

const source = (await readFile(new URL(
  "../1858bb7e91d48226586cf4ae78a739a54adbfa047f8a2040ef25c6b31feeca74i0.js",
  import.meta.url
), "utf8"))
  .replace(/^import .*$/gm,"")
  .replace(/\bexport\s+default\s+BitmapSDK;/g,"")
  .replace(/\bexport\s+(?=(?:const|async|function|class|let)\b)/g,"")
  .replace('import("/content/" + MONDRIAN_MODULE_ID)', 'Promise.resolve(mockMondrianModule)');

let invocation = 0;
function makeSDK({ withStorage=false }={}) {
  const fetches=[];
  const datasetName=++invocation;
  const mockMondrianModule={
    getPatternArray:()=>null,
    getSquareSize:()=>1,
    MondrianLayout:class {
      constructor(pattern){
        this.slots=pattern.map((size,i)=>({
          position:{x:i%55,y:Math.floor(i/55)},size
        }));
        this.width=55;this.height=Math.ceil(pattern.length/55);
        this.length=pattern.length;
      }
      getSize(){return {width:this.width,height:this.height};}
      fillEmptySpaces(){return Array.from({length:48},(_,i)=>({
        position:{x:55,y:i},size:1
      }));}
    }
  };
  let blockHash=REAL_HASH, rawHits=0, blockinfoHits=0;
  const bytes=Array(80).fill(0);
  bytes.push(253,3050&255,3050>>>8);
  for(let i=0;i<3050;i++){
    bytes.push(1,0,0,0,1);
    for(let j=0;j<36;j++)bytes.push(0);
    bytes.push(0,0,0,0,0,1);
    bytes.push(232,3,0,0,0,0,0,0,0);
    bytes.push(0,0,0,0);
  }
  const blockHex=bytes.map(x=>x.toString(16).padStart(2,"0")).join("");
  const fetchMock=async path=>{
    fetches.push(path);
    if(path==="/r/blockhash/"+HEIGHT)
      return {ok:true,status:200,json:async()=>blockHash};
    if(path==="/r/blockinfo/"+HEIGHT){
      blockinfoHits++;
      return {ok:true,status:200,json:async()=>({transaction_count:3050})};
    }
    if(path==="/r/block/"+HEIGHT){
      rawHits++;
      return {ok:true,status:200,json:async()=>blockHex};
    }
    throw Error("Unexpected recursive URL "+path);
  };
  const factory = new Function(
    "indexSat","indexInscriptionId","fetchBlock","listInscriptions","toHex",
    "fetch","indexedDB","IDBKeyRange","mockMondrianModule","globalThis",
    source+"\nreturn { BitmapSDK, packBitmapPattern, unpackBitmapPattern, decodeBitmapPatternManifest, getBitmapPatternManifest, getBitmapGeometryFromManifest, getBitmapGeometryFromPattern, cacheBitmapPatternManifest, getBitmapPatternInfo, storage };"
  );
  const sdk = factory(
    async()=>null,async()=>null, async()=>null, ()=>[],()=>"",
    fetchMock, withStorage?indexedDB:undefined, IDBKeyRange,
    mockMondrianModule,
    {
      crypto:webcrypto,
      CompressionStream,
      DecompressionStream
    }
  );
  return {sdk, fetches, get rawHits(){return rawHits;},
    get blockinfoHits(){return blockinfoHits;},
    setBlockHash:hash=>{blockHash=hash;}, datasetName};
}
const makeRealManifest=()=>({
  format:"bitmap-mondrian-compact-pattern-v1",height:HEIGHT,
  blockHash:REAL_HASH,transactionCount:3050,nibbleOrder:"high-first",
  padding:"zero-low-nibble-if-odd",packedByteLength:1525,
  packedSha256:REAL_SHA,compression:"gzip",encodedBytes:479,payloadBase64:REAL_GZIP
});

test("captured 840000 manifest decodes exactly and renders 3050 slots and 48 gaps without raw block requests",async()=>{
  const {sdk,fetches}=makeSDK();
  const decoded=await sdk.decodeBitmapPatternManifest(makeRealManifest());
  assert.equal(decoded.pattern.length,3050);
  assert.equal(decoded.pattern[0],5);
  assert.equal(decoded.pattern[1],5);
  assert.equal(decoded.pattern.at(-1),1);
  assert.equal(decoded.verifiedAgainstRawBlock,false);
  const real=await sdk.getBitmapGeometryFromManifest(makeRealManifest(),{includeEmptySpaces:true});
  const expected=await sdk.getBitmapGeometryFromPattern(HEIGHT,decoded.pattern,{includeEmptySpaces:true});
  assert.deepEqual(real.slots,expected.slots);
  assert.deepEqual(real.emptySpaces,expected.emptySpaces);
  assert.equal(real.slots.length,3050);
  assert.equal(real.emptySpaces.length,48);
  assert.equal(real.source,"unverified-compact-manifest");
  assert.equal(fetches.length,0,"Untrusted preview must never fetch or poison canonical caches");
});

test("integrity rejects corrupt payload, invalid padding, invalid size and SHA",async()=>{
  const {sdk}=makeSDK();
  const invalid=makeRealManifest();
  invalid.packedSha256="0".repeat(64);
  await assert.rejects(sdk.decodeBitmapPatternManifest(invalid),/SHA-256 mismatch/);
  const bad=makeRealManifest();
  bad.transactionCount=3051;
  await assert.rejects(sdk.decodeBitmapPatternManifest(bad),/metadata/);
  const mutated=makeRealManifest();
  mutated.payloadBase64=mutated.payloadBase64.slice(0,-4)+"AAAA";
  await assert.rejects(sdk.decodeBitmapPatternManifest(mutated));
  assert.deepEqual(Array.from(sdk.packBitmapPattern([1,2,9])),[0x12,0x90]);
  assert.deepEqual(sdk.unpackBitmapPattern(Uint8Array.of(0x12,0x90),3),[1,2,9]);
  assert.throws(()=>sdk.unpackBitmapPattern(Uint8Array.of(0x12,0x91),3),/trailing nibble/);
  assert.throws(()=>sdk.packBitmapPattern([10]),/Invalid Mondrian/);
});

test("raw verified manifest can enter isolated pattern store; stale block hash invalidates read",{timeout:20000},async()=>{
  const {sdk,setBlockHash}=makeSDK({withStorage:true});
  try {
  assert.equal((await sdk.storage.ready()).dbVersion,4);
  const manifest=await sdk.getBitmapPatternManifest(HEIGHT,{compression:"gzip"});
  assert.equal(manifest.verifiedAgainstRawBlock,true);
  assert.equal(manifest.transactionCount,3050);
  const result=await sdk.cacheBitmapPatternManifest(manifest);
  assert.equal(result.verifiedAgainstRawBlock,true);
  assert.equal(result.cached,true);
  const stored=await sdk.storage.getCompactPattern(HEIGHT);
  assert.equal(stored.packedBytes.length,1525);
  assert.equal(stored.verifiedAgainstRawBlock,true);
  const reused=await sdk.getBitmapPatternInfo(HEIGHT);
  assert.equal(reused.source,"verified-compact-pattern-cache");
  setBlockHash("f".repeat(64));
  const stale=await sdk.getBitmapPatternInfo(HEIGHT);
  assert.equal(stale.source,"recursive-raw-block");
  assert.equal(stale.pattern.length,3050);
  await assert.rejects(sdk.cacheBitmapPatternManifest(manifest),/does not match chain/);
  } finally {sdk.storage.close();}
});

test("unverified manifests are refused by trusted IndexedDB import",{timeout:20000},async()=>{
  const {sdk,fetches}=makeSDK({withStorage:true});
  try {
  const existing = await sdk.storage.getCompactPattern(HEIGHT);
  await assert.rejects(
    sdk.cacheBitmapPatternManifest(makeRealManifest(),{verifyAgainstRawBlock:false}),
    /Unverified compact Mondrian manifests/
  );
  const after = await sdk.storage.getCompactPattern(HEIGHT);
  assert.deepEqual(after,existing,"Unverified import must not mutate existing trusted pattern cache");
  assert.deepEqual(fetches,[]);
  } finally {sdk.storage.close();}
});

test("Brotli manifests need native support or an explicit decoder, never silently use gzip",async()=>{
  const {sdk}=makeSDK();
  const old=makeRealManifest();
  const decoded=await sdk.decodeBitmapPatternManifest(old);
  const packed=sdk.packBitmapPattern(decoded.pattern);
  const custom={...old,compression:"brotli"};
  const fake=new Uint8Array([1,2,3,4]);
  custom.payloadBase64=btoa(String.fromCharCode(...fake));
  custom.encodedBytes=fake.length;
  const output=await sdk.decodeBitmapPatternManifest(custom,{
    brotliDecoder: async()=>packed
  });
  assert.deepEqual(output.pattern,decoded.pattern);
});


test("real 840000 Brotli quality-11 fixture is 405 bytes and decodes to original SHA-256",async()=>{
  const sdk=makeSDK().sdk;
  // Compressed from the exact 1,525-byte packed pattern reported in the Ord viewer.
  const payloadBase64="G/QFgIzDOBb8clOELZ7eJinAb9Ypn++L+NqquHMHSEABaVZJRay7eRA/wbaLR62FXEHoEZwhT/RpQn0nCUQDN9l40RkiwlX/gPiZpzr1+uB23DdFZmbO+96zuSylM7UgBaLKRGciTUu0xSJYpUJEB9TGniIk0NZEUwp+kCLFQGaAEmAti4ICSABPoRBUvYhADNWQZtFhpJVS2qg9CEPyyjPQolucQ1hHcyp2geWBsQUupCBHFQGgChxqavMgLsGNJRWtvo4loJIYICrQZGMpDIFugAUgwIF1gKPCAHsz6ROgRQBCyXQJmZmZsuSrZkauehngIAUh01zJAFaz0r3PzhQAVNkUIAAQOfD0G3/b5AEcLleQZOpPAEAHYOy1/UdR9Q6AZAAA8GRWPQoAax+/53EESMqANLD2EnvIr7Ytrn3eY2NmlZuZJmE8FcgCEABSSMHoi5/7b51j5uznnAL4mTqcA6VMOjPXDNJwrhO+dElnrTSkibLuca3Puj+vj1a/b01XA6PweXunWClsBAjVxJOhPvsA";
  const manifest={
    ...makeRealManifest(), compression:"brotli",
    encodedBytes:405, payloadBase64
  };
  const unpacked=await sdk.decodeBitmapPatternManifest(manifest,{
    brotliDecoder:async data=>new Uint8Array(brotliDecompressSync(data))
  });
  assert.equal(unpacked.pattern.length,3050);
  assert.equal(unpacked.packedSha256,REAL_SHA);
  assert.equal(unpacked.verifiedAgainstRawBlock,false);
});
