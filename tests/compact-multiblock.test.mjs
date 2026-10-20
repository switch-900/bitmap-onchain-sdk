import assert from "node:assert/strict";
import {test} from "node:test";
import {readFile} from "node:fs/promises";
import {createHash} from "node:crypto";
import {brotliCompressSync,brotliDecompressSync,gunzipSync,constants} from "node:zlib";
import {
  BITMAP_BUNDLE_MAX_RECORDS, packBundlePattern, unpackBundlePattern,
  encodeBitmapBundle, decodeBitmapBundle, lookupBitmapBundle
} from "../experimental/compact-multiblock-v1.mjs";

const H = 840000;
const HASH = "0000000000000000000320283a032748cef8227873ff4872689bf23f1cda83a5";
const DIGEST = "3469c9067eade08b6a0213345d3d22f0751790e425d67eb304c72faf5c29e858";

const source=await readFile(new URL("./compact-pattern.test.mjs",import.meta.url),"utf8");
const b64=source.match(/const REAL_GZIP = "([^"]+)"/)?.[1];
assert.ok(b64,"Captured real gzip fixture must remain available");
const packed=gunzipSync(Buffer.from(b64,"base64"));
assert.equal(packed.length,1525);
assert.equal(createHash("sha256").update(packed).digest("hex"),DIGEST);
const REAL_PATTERN=unpackBundlePattern(new Uint8Array(packed),3050);

function fakeHash(height) {
  return createHash("sha256").update("synthetic-not-real-bitcoin-block:"+height).digest("hex");
}
function syntheticRecords(n) {
  return Array.from({length:n},(_,i)=>{
    const h=839900+i;
    const count=185+(i*53)%2866;
    const pattern=Array.from({length:count},(_,j)=>REAL_PATTERN[(j+19*i)%REAL_PATTERN.length]);
    return {height:h,blockHash:fakeHash(h),pattern};
  });
}

test("real 840000 captured pattern survives deterministic binary multi-block encoding",async()=>{
  const three=[
    {height:839999,blockHash:fakeHash(839999),pattern:[1,2,9]},
    {height:H,blockHash:HASH,pattern:REAL_PATTERN},
    {height:840001,blockHash:fakeHash(840001),pattern:[9,1,2,3]}
  ];
  const first=await encodeBitmapBundle(three);
  const second=await encodeBitmapBundle(three);
  assert.deepEqual(first.bytes,second.bytes,"encoding must be deterministic");
  assert.equal(first.rawBytes,8+3*76+2+1525+2);
  const decoded=await decodeBitmapBundle(first.bytes);
  assert.equal(decoded.integrityVerified,true);
  assert.equal(decoded.verifiedAgainstRawBlock,false);
  const item=lookupBitmapBundle(decoded,H,HASH);
  assert.deepEqual(item.pattern,REAL_PATTERN);
  assert.equal(item.blockHash,HASH);
  assert.equal(item.packedSha256,DIGEST);
  assert.equal(item.blockHashMatches,true);
  assert.equal(item.verifiedAgainstRawBlock,false);
  assert.equal(lookupBitmapBundle(decoded,900000),null);
  assert.throws(()=>lookupBitmapBundle(decoded,H,"f".repeat(64)),
    /block hash does not match/);
  const copy=lookupBitmapBundle(decoded,H,HASH);
  copy.pattern[0]=8;
  assert.equal(lookupBitmapBundle(decoded,H).pattern[0],5,
    "caller changes cannot poison decoded index");
  assert.deepEqual(unpackBundlePattern(packBundlePattern([1,2,9]),3),[1,2,9]);
});

test("invalid and malformed bundles fail closed before exposing a verified lookup",async()=>{
  assert.throws(()=>packBundlePattern([0]),/Invalid Mondrian size/);
  assert.throws(()=>packBundlePattern([1.5]),/Invalid Mondrian size/);
  assert.throws(()=>unpackBundlePattern(Uint8Array.of(0x12,0x91),3),/trailing nibble/);
  assert.throws(()=>unpackBundlePattern(Uint8Array.of(0x10),2),/size class/);
  assert.throws(()=>lookupBitmapBundle({records:[]},H),/Decode and verify/);
  await assert.rejects(encodeBitmapBundle([]),/record count/);
  await assert.rejects(encodeBitmapBundle([{height:H,blockHash:"abc",pattern:[1]}]),/Block hash/);
  await assert.rejects(encodeBitmapBundle([
    {height:H,blockHash:HASH,pattern:[1]},
    {height:H,blockHash:HASH,pattern:[2]}
  ]),/ascending/);
  await assert.rejects(encodeBitmapBundle([
    {height:H,blockHash:HASH,pattern:[1]},
    {height:H-1,blockHash:HASH,pattern:[2]}
  ]),/ascending/);
  await assert.rejects(encodeBitmapBundle(
    Array.from({length:BITMAP_BUNDLE_MAX_RECORDS+1},(_,i)=>({
      height:i,blockHash:HASH,pattern:[1]
    }))
  ),/record count/);
  const original=(await encodeBitmapBundle([{height:H,blockHash:HASH,pattern:REAL_PATTERN}])).bytes;
  const altered=Uint8Array.from(original);
  altered[8+76+3]^=1;
  await assert.rejects(decodeBitmapBundle(altered),/checksum mismatch/);
  const padded=Uint8Array.from([...original,0]);
  await assert.rejects(decodeBitmapBundle(padded),/trailing bundle bytes/);
  await assert.rejects(decodeBitmapBundle(original.slice(0,-1)),/truncated bundle packed/);
  const wrongMagic=Uint8Array.from(original);
  wrongMagic[0]=0;
  await assert.rejects(decodeBitmapBundle(wrongMagic),/magic/);
  const badCount=Uint8Array.from(original);
  badCount[6]=0xff;badCount[7]=0xff;
  await assert.rejects(decodeBitmapBundle(badCount),/record count/);
  const odd=(await encodeBitmapBundle([
    {height:H-1,blockHash:fakeHash(H-1),pattern:[1,2,9]}
  ])).bytes;
  odd[8+76+1]|=1;
  await assert.rejects(decodeBitmapBundle(odd),/checksum mismatch/);
});

test("32, 64 and 128 block bundles round-trip; compression results are SYNTHETIC estimates",async(t)=>{
  for(const count of [32,64,128]){
    const entries=syntheticRecords(count);
    const encoded=await encodeBitmapBundle(entries);
    const decoded=await decodeBitmapBundle(encoded.bytes);
    assert.equal(decoded.records.length,count);
    const last=entries.at(-1);
    assert.deepEqual(lookupBitmapBundle(decoded,last.height).pattern,last.pattern);
    const brotli=brotliCompressSync(encoded.bytes,{
      params:{[constants.BROTLI_PARAM_QUALITY]:6}
    });
    assert.deepEqual(brotliDecompressSync(brotli),Buffer.from(encoded.bytes));
    const metadataBytes=8+count*76;
    assert.ok(encoded.rawBytes>metadataBytes);
    t.diagnostic(JSON.stringify({
      scenario:"SYNTHETIC heights; NOT real block measurements",
      count,rawBytes:encoded.rawBytes,metadataBytes,
      brotliQuality:6,brotliBytes:brotli.length
    }));
  }
});
