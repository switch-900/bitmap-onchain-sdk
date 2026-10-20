/*
 * Experimental compact multi-block Mondrian bundle codec.
 * Pure portable JS: no network, wallet, Bitcoin RPC, or filesystem access.
 * Derived patterns are untrusted until independently checked against raw
 * Bitcoin blocks. SHA-256 / block hashes are integrity/provenance anchors,
 * never evidence that size classes reflect the Bitcoin output amounts.
 *
 * Binary format v1 (big-endian):
 *   [0..3] ASCII "BMPB"; [4] version=1; [5] flags=0;
 *   [6..7] number of records (uint16, <=128).
 *   For each strictly ascending height:
 *     height:u32, transactionCount:u32, blockHash:32 bytes,
 *     packedSHA256:32 bytes, packedLength:u32, packed:nibbles high-first.
 * The entire binary bundle can be Brotli-compressed externally. Do not use
 * Content-Encoding:br AND internally Brotli-compressed bytes together unless
 * deliberate double compression is explicitly handled.
 */
export const BITMAP_BUNDLE_MAGIC = "BMPB";
export const BITMAP_BUNDLE_VERSION = 1;
export const BITMAP_BUNDLE_MAX_RECORDS = 128;
export const BITMAP_BUNDLE_MAX_TRANSACTIONS = 100000;
export const BITMAP_BUNDLE_MAX_BYTES = 8 * 1024 * 1024;
const HEADER_BYTES = 8, RECORD_HEADER_BYTES = 76;

function bytesFor(input) {
  if (!(input instanceof Uint8Array)) throw new TypeError("Bundle requires Uint8Array");
  return input;
}
function hexToBytes(hex) {
  if (typeof hex !== "string" || !/^[a-f0-9]{64}$/i.test(hex))
    throw new TypeError("Block hash must be 64 hexadecimal digits");
  const result = new Uint8Array(32);
  for (let i = 0; i < 32; i++) result[i] = parseInt(hex.slice(2*i,2*i+2),16);
  return result;
}
function bytesToHex(bytes) {
  return Array.from(bytes,n=>n.toString(16).padStart(2,"0")).join("");
}
async function hashBytes(bytes) {
  if (!globalThis.crypto?.subtle?.digest)
    throw new Error("WebCrypto SHA-256 is required to verify pattern bundles");
  return new Uint8Array(await globalThis.crypto.subtle.digest("SHA-256",bytes));
}
function checkedCount(count) {
  if (!Number.isSafeInteger(count) || count < 1 || count > BITMAP_BUNDLE_MAX_TRANSACTIONS)
    throw new TypeError("Invalid bundle transaction count");
}
export function packBundlePattern(pattern) {
  if (!Array.isArray(pattern)) throw new TypeError("Expected pattern array");
  checkedCount(pattern.length);
  const out=new Uint8Array(Math.ceil(pattern.length/2));
  for(let i=0;i<pattern.length;i++){
    const size=pattern[i];
    if(!Number.isInteger(size)||size<1||size>9)
      throw new TypeError("Invalid Mondrian size at transaction "+i);
    out[i>>1]|=size<<(i%2 ? 0 : 4);
  }
  return out;
}
export function unpackBundlePattern(bytes,count) {
  bytesFor(bytes);checkedCount(count);
  if(bytes.length!==Math.ceil(count/2)) throw new Error("Bundle packed-pattern length mismatch");
  if(count%2 && (bytes[bytes.length-1]&15)!==0)
    throw new Error("Invalid bundle trailing nibble");
  const out=new Array(count);
  for(let i=0;i<count;i++){
    const size=(bytes[i>>1]>>(i%2?0:4))&15;
    if(size<1||size>9)throw new Error("Invalid bundle size class at "+i);
    out[i]=size;
  }
  return out;
}
function checkedHeight(height){
  if(!Number.isSafeInteger(height)||height<0||height>0xffffffff)
    throw new TypeError("Invalid bundle Bitcoin block height");
}
export async function encodeBitmapBundle(records) {
  if(!Array.isArray(records)||records.length<1||
    records.length>BITMAP_BUNDLE_MAX_RECORDS)
    throw new TypeError("Invalid bundle record count");
  const parts=[],meta=[];
  let previous=-1,total=HEADER_BYTES;
  for(const record of records){
    checkedHeight(record?.height);
    if(record.height<=previous)throw new Error("Bundle heights must be strictly ascending");
    previous=record.height;
    const hash=hexToBytes(record.blockHash);
    const packed=packBundlePattern(record.pattern);
    const digest=await hashBytes(packed);
    total+=RECORD_HEADER_BYTES+packed.length;
    if(total>BITMAP_BUNDLE_MAX_BYTES)throw new Error("Bundle exceeds maximum bytes");
    parts.push({height:record.height,hash,digest,packed,count:record.pattern.length});
    meta.push({height:record.height,transactionCount:record.pattern.length,
      blockHash:record.blockHash.toLowerCase(),packedSha256:bytesToHex(digest),
      packedBytes:packed.length});
  }
  const bytes=new Uint8Array(total),view=new DataView(bytes.buffer);
  bytes.set([66,77,80,66,1,0],0);
  view.setUint16(6,parts.length,false);
  let offset=HEADER_BYTES;
  for(const part of parts){
    view.setUint32(offset,part.height,false);offset+=4;
    view.setUint32(offset,part.count,false);offset+=4;
    bytes.set(part.hash,offset);offset+=32;
    bytes.set(part.digest,offset);offset+=32;
    view.setUint32(offset,part.packed.length,false);offset+=4;
    bytes.set(part.packed,offset);offset+=part.packed.length;
  }
  return {bytes,meta,format:"bitmap-mondrian-multiblock-v1",
    recordCount:records.length,rawBytes:bytes.length};
}
export async function decodeBitmapBundle(input) {
  const bytes=bytesFor(input);
  if(bytes.length<HEADER_BYTES||bytes.length>BITMAP_BUNDLE_MAX_BYTES)
    throw new Error("Invalid bundle length");
  if(bytes[0]!==66||bytes[1]!==77||bytes[2]!==80||bytes[3]!==66 ||
     bytes[4]!==1||bytes[5]!==0)throw new Error("Unknown bundle magic/version/flags");
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  const count=view.getUint16(6,false);
  if(count<1||count>BITMAP_BUNDLE_MAX_RECORDS)
    throw new Error("Invalid bundle record count");
  const records=[];
  let offset=HEADER_BYTES,previous=-1;
  for(let i=0;i<count;i++){
    if(bytes.length-offset<RECORD_HEADER_BYTES)
      throw new Error("Truncated bundle record header");
    const height=view.getUint32(offset,false);offset+=4;
    const transactionCount=view.getUint32(offset,false);offset+=4;
    if(height<=previous)throw new Error("Bundle records out of order");
    previous=height;checkedCount(transactionCount);
    const blockHash=bytesToHex(bytes.subarray(offset,offset+32));offset+=32;
    const digest=bytes.subarray(offset,offset+32);offset+=32;
    const size=view.getUint32(offset,false);offset+=4;
    if(size!==Math.ceil(transactionCount/2)||size>bytes.length-offset)
      throw new Error("Invalid or truncated bundle packed data");
    const packed=bytes.subarray(offset,offset+size);offset+=size;
    const actual=await hashBytes(packed);
    if(!actual.every((v,j)=>v===digest[j]))
      throw new Error("Bundle checksum mismatch for height "+height);
    records.push({
      height,blockHash,transactionCount,packedSha256:bytesToHex(digest),
      pattern:unpackBundlePattern(packed,transactionCount),
      integrityVerified:true,verifiedAgainstRawBlock:false
    });
  }
  if(offset!==bytes.length)throw new Error("Unexpected trailing bundle bytes");
  return {format:"bitmap-mondrian-multiblock-v1",version:1,
    integrityVerified:true,verifiedAgainstRawBlock:false,records};
}
export function lookupBitmapBundle(bundle,height,expectedBlockHash=null) {
  checkedHeight(height);
  if(!bundle||bundle.format!=="bitmap-mondrian-multiblock-v1"||
     bundle.integrityVerified!==true||!Array.isArray(bundle.records))
    throw new Error("Decode and verify bundle before lookup");
  const record=bundle.records.find(r=>r.height===height);
  if(!record)return null;
  if(expectedBlockHash!==null){
    hexToBytes(expectedBlockHash);
    if(record.blockHash!==expectedBlockHash.toLowerCase())
      throw new Error("Bundle block hash does not match current Bitcoin chain");
  }
  return {
    ...record,pattern:record.pattern.slice(),
    blockHashMatches:expectedBlockHash!==null,
    verifiedAgainstRawBlock:false
  };
}
