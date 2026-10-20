import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { webcrypto } from "node:crypto";
import { brotliDecompressSync, brotliCompressSync } from "node:zlib";
import { test } from "node:test";

const source = (await readFile(new URL(
  "../1858bb7e91d48226586cf4ae78a739a54adbfa047f8a2040ef25c6b31feeca74i0.js",
  import.meta.url
), "utf8"))
  .replace(/^import .*$/gm, "")
  .replace(/\bexport\s+default\s+BitmapSDK;/g, "")
  .replace(/\bexport\s+(?=(?:const|async|function|class|let)\b)/g, "")
  .replace('import("/content/" + MONDRIAN_MODULE_ID)', 'Promise.resolve(mockMondrianModule)')
  .replace('import("/content/" + BROTLI_OC_INSCRIPTION_ID)', 'mockImportBrotliOC()');

const GZIP = "H4sIAAAAAAAACr1U243cMAysYUhd/ofaK0AWUoB33cAd4AbSfxEBKcmWzwvkL8QCK0vkkBw+doQInraCyOCyAahItQL0JzOzXGuxWUTxQ9h+cS8csPRLE9BM0NEA0hXUFQANS/EP1+tg5Sf+7Ci0ZVyc3jCgm9YkMvSG8qFgdoXuOLNDRqy4PB7uVx6WcsK+cT9Onj/oGdBZ9IwNQp6hTa4vsbDjyD3GN0Jgbbm5l4PP9G/LCWFKIcd36Zf6TsfiuXHRuUwcBTtR73mmuLvSf9f6PyKDZPUkBLwGoj1AQiSKid7orf1ESiiFkY2mLKf14ab9eTm01SQFRkcsxeeG61DnhUUJesQY0cSIWnSpfBA+YrIQj4GVznKEkSwio+uVosJSMgNhkqhTmepw6TmBpOj+z33fvz/3b5iMYBMWLDFxIkb8ujYrj4EzFC3402vt/l7ToIjhLquYEuu1ObSkr5ySDEMOFqXNjxanqXg1vnxBBJdLydVizZhDovqBXlOYD3VbV7d64ejtTqmBD+BZfxPZYJa55YnJpxHJX44VaUIzW2LvRIBZs79++PIUmqr07eBdBa2GRTet22NzeVVQqC0za0RsL7wiHG1BlTNeadtGnLk4quEvd/KASfUFAAA=";
const REAL_SHA = "3469c9067eade08b6a0213345d3d22f0751790e425d67eb304c72faf5c29e858";
const REAL_HASH = "0000000000000000000320283a032748cef8227873ff4872689bf23f1cda83a5";
function manifest(br) {
  return {
    format:"bitmap-mondrian-compact-pattern-v1",height:840000,blockHash:REAL_HASH,
    transactionCount:3050,nibbleOrder:"high-first",padding:"zero-low-nibble-if-odd",
    packedByteLength:1525,packedSha256:REAL_SHA,
    compression:"brotli",encodedBytes:br.length,payloadBase64:br.toString("base64")
  };
}

function makeNativeStream(compress) {
  const chunks=[];
  return new TransformStream({
    transform(chunk){chunks.push(Buffer.from(chunk));},
    flush(controller) {
      const src=Buffer.concat(chunks);
      controller.enqueue(new Uint8Array(compress ?
        brotliCompressSync(src) : brotliDecompressSync(src)));
    }
  });
}
function harness({ preloaded=false, classic=false, failingImport=false, nativeBrotli=false }={}) {
  const gzipPacked = brotliDecompressSync(brotliCompressSync(Buffer.alloc(10)));
  void gzipPacked;
  let loaded=0, compressed=0, decompressed=0;
  const OC = {
    async compress(bytes,options){
      compressed++;
      assert.equal(options.quality,11);
      return new Uint8Array(brotliCompressSync(bytes));
    },
    async decompress(bytes){
      decompressed++;
      return new Uint8Array(brotliDecompressSync(bytes));
    }
  };
  const browser = {
    crypto:webcrypto,
    DecompressionStream:class {
      constructor(format){
        if(format==="brotli") {
          if (!nativeBrotli) throw Error("Browser without native Brotli stream");
          return makeNativeStream(false);
        }
        return new DecompressionStream(format);
      }
    },
    CompressionStream:class {
      constructor(format){
        if(format==="brotli") {
          if (!nativeBrotli) throw Error("Browser without native Brotli stream");
          return makeNativeStream(true);
        }
        return new CompressionStream(format);
      }
    },
    ...(preloaded?{BrotliOC:OC}:{}),
    ...(classic?{BrotliDecode:bytes=>new Uint8Array(brotliDecompressSync(bytes))}:{})
  };
  const importOnChain=async()=>{
    loaded++;
    if (failingImport) throw Error("On-chain module unavailable");
    browser.BrotliOC=OC;
  };
  const api = new Function("globalThis","mockImportBrotliOC","mockMondrianModule",
    source+"\nreturn {decodeBitmapPatternManifest,compactCodec,packBitmapPattern,BROTLI_OC_INSCRIPTION_ID,BROTLI_DECODE_INSCRIPTION_ID};"
  )(browser, importOnChain, {getSquareSize:()=>1});
  return {api,browser,calls:()=>({loaded,compressed,decompressed})};
}

test("existing 840000 on-chain Brotli manifest loads the inscribed BrotliOC only when native unsupported",async()=>{
  const packed = Buffer.from(GZIP,"base64");
  const gzip = (await import("node:zlib")).gunzipSync(packed);
  assert.equal(gzip.length,1525);
  const br=brotliCompressSync(gzip);
  const {api,calls}=harness();
  assert.equal(api.BROTLI_OC_INSCRIPTION_ID,
    "fb483c53bc6938c1df1e25e03e99f726d08a1c0d2db4e0e644c0baf3526a1d60i0");
  assert.equal(api.BROTLI_DECODE_INSCRIPTION_ID,
    "b1d16a7a1ada08b5c7f51837478f578c0abd0973809c439228f28ccd5c38e44ai0");
  const decoded=await api.decodeBitmapPatternManifest(manifest(br));
  assert.equal(decoded.pattern.length,3050);
  assert.equal(decoded.packedSha256,REAL_SHA);
  assert.deepEqual(calls(),{loaded:1,compressed:0,decompressed:1});
  await api.decodeBitmapPatternManifest(manifest(br));
  assert.deepEqual(calls(),{loaded:1,compressed:0,decompressed:2});
  const roundtrip=await api.compactCodec(gzip,"brotli",true);
  assert.ok(roundtrip.length>0);
  assert.deepEqual(calls(),{loaded:1,compressed:1,decompressed:2});
  assert.deepEqual(Buffer.from(await api.compactCodec(roundtrip,"brotli",false)),gzip);
});

test("already-loaded global BrotliDecode classic script bypasses module loading",async()=>{
  const gz=(await import("node:zlib")).gunzipSync(Buffer.from(GZIP,"base64"));
  const {api,calls}=harness({classic:true});
  const decoded=await api.decodeBitmapPatternManifest(manifest(brotliCompressSync(gz)));
  assert.equal(decoded.pattern.length,3050);
  assert.deepEqual(calls(),{loaded:0,compressed:0,decompressed:0});
});

test("already-loaded global BrotliOC bypasses module loading",async()=>{
  const gz=(await import("node:zlib")).gunzipSync(Buffer.from(GZIP,"base64"));
  const {api,calls}=harness({preloaded:true});
  const decoded=await api.decodeBitmapPatternManifest(manifest(brotliCompressSync(gz)));
  assert.equal(decoded.pattern.length,3050);
  assert.deepEqual(calls(),{loaded:0,compressed:0,decompressed:1});
});

test("missing native/on-chain decoder fails without silently changing compression format",async()=>{
  const gz=(await import("node:zlib")).gunzipSync(Buffer.from(GZIP,"base64"));
  const {api,calls}=harness({failingImport:true});
  await assert.rejects(api.decodeBitmapPatternManifest(manifest(brotliCompressSync(gz))),
    /On-chain module unavailable/);
  assert.equal(calls().loaded,1);
});

test("explicit decoder remains supported and takes precedence",async()=>{
  const gz=(await import("node:zlib")).gunzipSync(Buffer.from(GZIP,"base64"));
  const {api,calls}=harness({failingImport:true});
  const decoded=await api.decodeBitmapPatternManifest(manifest(brotliCompressSync(gz)),{
    brotliDecoder:async bytes=>new Uint8Array(brotliDecompressSync(bytes))
  });
  assert.equal(decoded.pattern.length,3050);
  assert.equal(calls().loaded,0);
});


test("native Brotli streams are preferred when available, with no on-chain module import", async()=>{
  const gz=(await import("node:zlib")).gunzipSync(Buffer.from(GZIP,"base64"));
  const {api,calls}=harness({nativeBrotli:true,failingImport:true});
  const encoded=await api.compactCodec(gz,"brotli",true);
  const manifestData=manifest(Buffer.from(encoded));
  const decoded=await api.decodeBitmapPatternManifest(manifestData);
  assert.equal(decoded.pattern.length,3050);
  assert.equal(decoded.packedSha256,REAL_SHA);
  assert.equal(calls().loaded,0);
  assert.equal(calls().compressed,0);
  assert.equal(calls().decompressed,0);
});
