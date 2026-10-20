import assert from "node:assert/strict";
import {test} from "node:test";
import {readFile} from "node:fs/promises";
import {webcrypto} from "node:crypto";
import {brotliCompressSync,brotliDecompressSync,constants} from "node:zlib";
import {performance} from "node:perf_hooks";

const source=(await readFile(new URL("./ordinals-real-3block-header-compare-console.js",import.meta.url),"utf8"))
  .replaceAll("await import(SDK)","await mockImportSDK()")
  .replaceAll("await import(BROTLI)","await mockImportBrotli()")
  .replaceAll('await import("/content/fb483c53bc6938c1df1e25e03e99f726d08a1c0d2db4e0e644c0baf3526a1d60i0")',
    "await mockImportBrotli()");

const BLOCK_HASH_840000="0000000000000000000320283a032748cef8227873ff4872689bf23f1cda83a5";
test("metadata comparison recovers independently after page reload, then reuses cached pattern",{
  timeout:20000
},async()=>{
  const rawHeights=[];
  let moduleImports=0;
  const browser={};
  const sdk={
    async getBlockHash(height){
      if(height===840000)return BLOCK_HASH_840000;
      if(height===839999)return "1".repeat(64);
      if(height===840001)return "2".repeat(64);
      throw Error("Unexpected block height");
    },
    async getBitmapPattern(height,{forceLive}){
      assert.equal(forceLive,true);
      rawHeights.push(height);
      const n=height===839999?2328:height===840001?2823:0;
      if(!n)throw Error("Unexpected block fetch");
      return Array.from({length:n},(_,i)=>i%11?1:2);
    }
  };
  const BrotliOC={
    async compress(bytes,{quality}={}){
      assert.equal(quality,11);
      return new Uint8Array(brotliCompressSync(bytes,{
        params:{[constants.BROTLI_PARAM_QUALITY]:11}
      }));
    },
    async decompress(bytes){
      return new Uint8Array(brotliDecompressSync(bytes));
    }
  };
  const logs={};
  const noop=()=>{};
  const consoleMock={table:noop,log:noop,info:noop,error:noop};
  const getModule=async()=>({default:sdk});
  const loadBrotli=async()=>{
    moduleImports++;
    browser.BrotliOC=BrotliOC;
  };
  const runner=new Function("mockImportSDK","mockImportBrotli",
    "globalThis","crypto","atob","performance","console","return "+source);

  const first=await runner(getModule,loadBrotli,browser,webcrypto,
    (b64)=>Buffer.from(b64,"base64").toString("binary"),performance,consoleMock);
  assert.equal(first.fixtureRebuilt,true);
  assert.deepEqual(Array.from(first.rawHeightsFetched),[839999,840001]);
  assert.equal(first.noRawBlockFetch,false);
  assert.equal(first.metrics.length,2);
  assert.equal(first.metrics[0].uncompressedBytes,4337);
  assert.equal(first.metrics[1].uncompressedBytes,4241);
  assert.equal(first.savedUncompressedBytes,96);
  assert.equal(first.metrics.every(x=>x.recordRoundtrip),true);
  assert.equal(browser.__bitmapReal3BlockPackedFixture.length,3);
  assert.equal(moduleImports,1);
  assert.deepEqual(rawHeights,[839999,840001]);

  const second=await runner(getModule,loadBrotli,browser,webcrypto,
    (b64)=>Buffer.from(b64,"base64").toString("binary"),performance,consoleMock);
  assert.equal(second.fixtureRebuilt,false);
  assert.equal(second.noRawBlockFetch,true);
  assert.deepEqual(Array.from(second.rawHeightsFetched),[]);
  assert.equal(second.metrics[0].uncompressedBytes,first.metrics[0].uncompressedBytes);
  assert.equal(second.metrics[1].uncompressedBytes,first.metrics[1].uncompressedBytes);
  assert.deepEqual(rawHeights,[839999,840001],"second run must not refetch Bitcoin blocks");
  assert.equal(moduleImports,1);
});
