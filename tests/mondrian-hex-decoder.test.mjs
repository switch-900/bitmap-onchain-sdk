import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const source = (await readFile(
  new URL("../1858bb7e91d48226586cf4ae78a739a54adbfa047f8a2040ef25c6b31feeca74i0.js",import.meta.url),
  "utf8"
))
  .replace(/^import .*$/gm,"")
  .replace(/\bexport\s+default\s+BitmapSDK;/g,"")
  .replace(/\bexport\s+(?=(?:const|async|function|class|let)\b)/g,"");

const createDecoder = Bytes =>
  new Function("Uint8Array",source+"\nreturn {rawBlockHexToBytes,parseRawBlockOutputTotals};")(Bytes);

class LegacyUint8Array extends Uint8Array {
  // Node version independent: ensure fallback is actually exercised.
  static get fromHex() { return undefined; }
}

const fallback = createDecoder(LegacyUint8Array);

function hex(bytes) {
  return Array.from(bytes,b=>b.toString(16).padStart(2,"0")).join("");
}
function mockBlock(transactionCount) {
  const bytes=Array(80).fill(0);
  bytes.push(253,transactionCount & 255, transactionCount >>> 8);
  for(let i=0;i<transactionCount;i++) {
    bytes.push(1,0,0,0,1);
    for(let j=0;j<36;j++)bytes.push(0);
    bytes.push(0,0,0,0,0,1);
    bytes.push(232,3,0,0,0,0,0,0,0);
    bytes.push(0,0,0,0);
  }
  return hex(bytes);
}

test("hex fallback decodes a 3050-transaction Bitcoin fixture without changing output totals",()=>{
  const block=mockBlock(3050);
  const out=fallback.parseRawBlockOutputTotals(block,840000);
  assert.equal(out.length,3050);
  assert.ok(out.every(value=>value===1000));
  const decoded=fallback.rawBlockHexToBytes(block,840000);
  assert.equal(decoded.length,block.length/2);
  assert.equal(decoded[0],0);
  assert.equal(decoded[79],0);
});

test("fallback and native decoder match, preserving mixed-case hex",()=>{
  const input="FfaA".repeat(200);
  const fromFallback=fallback.rawBlockHexToBytes(input,840000);
  assert.equal(fromFallback.length,input.length/2);
  assert.equal(fromFallback[0],255);
  assert.equal(fromFallback[1],170);
  if (typeof Uint8Array.fromHex==="function"){
    const native=createDecoder(Uint8Array);
    assert.deepEqual(Array.from(native.rawBlockHexToBytes(input,840000)),Array.from(fromFallback));
  }
  let called=0;
  class NativeShimArray extends Uint8Array {
    static fromHex(s) {
      called++;
      // A native-path shim for Node versions predating fromHex.
      return fallback.rawBlockHexToBytes(s,840000);
    }
  }
  const shim=createDecoder(NativeShimArray);
  assert.deepEqual(Array.from(shim.rawBlockHexToBytes(input,840000)),Array.from(fromFallback));
  assert.equal(called,1);
});

test("native and fallback reject malformed or truncated hexadecimal block strings",()=>{
  const decoderPairs=[fallback];
  if(typeof Uint8Array.fromHex==="function")decoderPairs.push(createDecoder(Uint8Array));
  const good="ab".repeat(100);
  for(const decoder of decoderPairs){
    for(const value of [null,42,"","aa","ab".repeat(40),good+"f",
      good.slice(0,88)+"!"+good.slice(89),
      good.slice(0,88)+" "+good.slice(89),
      good.slice(0,88)+"\u00ff"+good.slice(89)])
      assert.throws(()=>decoder.rawBlockHexToBytes(value,840000),/returned invalid block hex/);
    assert.equal(decoder.rawBlockHexToBytes(good,840000).length,100);
  }
});
