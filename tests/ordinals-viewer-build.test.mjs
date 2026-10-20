import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { Script } from "node:vm";

const file = new URL("./ordinals-viewer-probe.html", import.meta.url);
const consoleFile = new URL("./ordinals-viewer-console.js", import.meta.url);
const html = await readFile(file, "utf8");
const consoleJs = await readFile(consoleFile, "utf8");
const profilerJs = await readFile(new URL("./ordinals-mondrian-profiler-console.js", import.meta.url), "utf8");
const hexJs = await readFile(new URL("./ordinals-hex-benchmark-console.js", import.meta.url), "utf8");
const packJs = await readFile(new URL("./ordinals-pattern-packing-console.js", import.meta.url), "utf8");
const manifestJs = await readFile(new URL("./ordinals-pattern-manifest-console.js", import.meta.url), "utf8");
const onchainBrotliProbe = await readFile(new URL("./ordinals-brotli-compat-console.js", import.meta.url), "utf8");
const codecBenchmark = await readFile(new URL("./ordinals-codec-benchmark-console.js", import.meta.url), "utf8");
const brTransportProbe = await readFile(new URL("./ordinals-http-brotli-geometry-console.js", import.meta.url), "utf8");
const match = html.match(/<script type="module">([\s\S]*?)<\/script>/);
if (!match) throw new Error("Missing inline viewer module");

test("inscription viewer script and console script parse as JavaScript", () => {
  assert.doesNotThrow(() => new Script(match[1], { filename: "ordinals-viewer-probe-inline.js" }));
  assert.doesNotThrow(() => new Script(consoleJs, { filename: "ordinals-viewer-console.js" }));
});

test("inscription probe has no off-chain runtime dependencies", () => {
  assert.equal(/<script[^>]*\ssrc=/i.test(html), false);
  assert.equal(/<link[^>]*\shref=/i.test(html), false);
  assert.equal(/https?:\/\/[^"' ]+/.test(match[1]), false);
  assert.match(match[1], /\/r\/sat\/25483050779204\/at\/-1\/content/);
  assert.match(match[1], /\/r\/blockheight/);
  assert.match(match[1], /\/r\/blockhash\//);
  assert.match(match[1], /\/r\/inscription\//);
});

test("inscription probe enforces bounded scans and caps indexing workload", () => {
  assert.match(match[1], /maxScanBlocks/);
  assert.match(match[1], /integer\("blocks",2,1,16\)/);
  assert.match(match[1], /maxBlocks:2,concurrency:2,confirmations:6,persist:true/);
  assert.match(match[1], /forceRefresh:true/);
  assert.match(match[1], /d\.rawBlocks!==0/);
});

test("console probe restores global fetch even after errors", () => {
  assert.match(consoleJs, /finally\s*\{[\s\S]*?globalThis\.fetch=original/);
  assert.match(consoleJs, /\/r\/sat\/25483050779204\/at\/-1\/content/);
  assert.match(consoleJs, /maxScanBlocks:BLOCKS/);
});

test("840000 viewer performance probe is syntactically valid and read-only", () => {
  assert.doesNotThrow(() => new Script(profilerJs, { filename: "ordinals-mondrian-profiler-console.js" }));
  assert.match(profilerJs, /const BITMAP = 840000/);
  assert.match(profilerJs, /forceRefresh:true,forceLive:true,includeEmptySpaces:true,persist:true/);
  assert.match(profilerJs, /globalThis\.fetch=nativeFetch/);
  assert.match(profilerJs, /onTiming:/);
  assert.equal(/https?:\/\/[^"' ]+/.test(profilerJs), false, "No off-chain fetch URLs are required");
});

test("840000 hex decoder benchmark parses and contains only same-origin recursive fetch",()=>{
  assert.doesNotThrow(()=>new Script(hexJs,{filename:"ordinals-hex-benchmark-console.js"}));
  assert.match(hexJs,/"\/r\/block\/" \+ height/);
  assert.match(hexJs,/Uint8Array\.fromHex\(hex\)/);
  assert.match(hexJs,/report\.equalBytes=identical/);
  assert.equal(/https?:\/\/[^"' ]+/.test(hexJs),false);
});

test("840000 compact Mondrian pattern probe has valid syntax, local recursion and exact nibble roundtrip",()=>{
  assert.doesNotThrow(()=>new Script(packJs,{filename:"ordinals-pattern-packing-console.js"}));
  assert.match(packJs,/getBitmapPattern\(HEIGHT,\{forceLive:true\}\)/);
  assert.match(packJs,/const HEIGHT = 840000/);
  assert.equal(/https?:\/\/[^"' ]+/.test(packJs),false);
  const beginning=packJs.indexOf("function sizeToNibble");
  const ending=packJs.indexOf("const sdk = ",beginning);
  assert.ok(beginning>0 && ending>beginning);
  const helpers=packJs.slice(beginning,ending);
  const api=new Function(helpers+"\nreturn {encode,decode};")();
  const sizes=[1,9,3,8,6,7,2];
  const encoded=api.encode(sizes);
  assert.deepEqual(Array.from(encoded),[0x19,0x38,0x67,0x20]);
  assert.deepEqual(api.decode(encoded,sizes.length),sizes);
  assert.throws(()=>api.encode([0]),/Invalid Mondrian/);
  assert.throws(()=>api.decode(Uint8Array.of(0),2),/Invalid Mondrian/);
});

test("840000 compact pattern manifest export is read-only and roundtrips 3050 slots", () => {
  assert.doesNotThrow(() => new Script(manifestJs, {filename:"ordinals-pattern-manifest-console.js"}));
  assert.match(manifestJs, /getBitmapPattern\(HEIGHT, \{forceLive:true\}\)/);
  assert.match(manifestJs, /crypto\.subtle\.digest\("SHA-256", bytes\)/);
  assert.match(manifestJs, /DecompressionStream/);
  assert.match(manifestJs, /roundtripEqual: true/);
  assert.equal(/https?:\/\/[^"' ]+/.test(manifestJs),false);
  const begin=manifestJs.indexOf("function nibble(");
  const end=manifestJs.indexOf("const hex = ",begin);
  assert.ok(begin>0 && end>begin);
  const {pack,unpack} = new Function(manifestJs.slice(begin,end)+"\nreturn {pack,unpack};")();
  const values=Array.from({length:3050},(_,i)=>1+(i%9));
  const encoded=pack(values);
  assert.equal(encoded.length,1525);
  assert.deepEqual(unpack(encoded,values.length),values);
  assert.throws(()=>pack([0]),/Out-of-range Mondrian/);
  assert.throws(()=>unpack(Uint8Array.from([0x11,0x12]),3),/Invalid nonzero trailing nibble/);
});


test("on-chain Brotli compatibility probe uses exact inscribed module and same-origin imports",()=>{
  assert.doesNotThrow(()=>new Script(onchainBrotliProbe, {filename:"ordinals-brotli-compat-console.js"}));
  assert.match(onchainBrotliProbe, /fb483c53bc6938c1df1e25e03e99f726d08a1c0d2db4e0e644c0baf3526a1d60i0/);
  assert.match(onchainBrotliProbe, /DecompressionStream\("brotli"\)/);
  assert.match(onchainBrotliProbe, /globalThis\.BrotliOC/);
  assert.match(onchainBrotliProbe, /digestMatches/);
  assert.equal(/https?:\/\/[^"' ]+/.test(onchainBrotliProbe),false);
});

test("840000 warm Brotli vs gzip probe is read-only and validates both payloads", () => {
  assert.doesNotThrow(() => new Script(codecBenchmark, {filename:"ordinals-codec-benchmark-console.js"}));
  assert.match(codecBenchmark, /DecompressionStream\("gzip"\)/);
  assert.match(codecBenchmark, /await import\("\/content\/" \+ BROTLI_OC_ID\)/);
  assert.match(codecBenchmark, /const COUNT = 10/);
  assert.match(codecBenchmark, /const WARMUPS = 2/);
  assert.match(codecBenchmark, /sha256\(gzReference\)/);
  assert.match(codecBenchmark, /compare\(brReference,gzReference\)/);
  assert.match(codecBenchmark, /window\.__bitmapCodecBenchmark840000|globalThis\.__bitmapCodecBenchmark840000/);
  assert.equal(/https?:\/\/[^"' ]+/.test(codecBenchmark),false,
    "Probe must use embedded fixtures and same-origin on-chain loader only");
});


test("Ord content-encoding and 840000 compressed geometry probe uses only safe recursive paths",()=>{
  assert.doesNotThrow(()=>new Script(brTransportProbe,{filename:"ordinals-http-brotli-geometry-console.js"}));
  assert.match(brTransportProbe,/\/content\/6d4ae768dfa5f7c7a275673fc82a323fc0daf4a61f00e4dd538385ed1f62368ci278/);
  assert.match(brTransportProbe,/const KNOWN_BR="6d4ae768dfa5f7c7a275673fc82a323fc0daf4a61f00e4dd538385ed1f62368ci278"/);
  assert.match(brTransportProbe,/await fetch\("\/content\/"\+KNOWN_BR\)/);
  assert.match(brTransportProbe,/await fetch\("\/r\/blockhash\/"\+HEIGHT\)/);
  assert.match(brTransportProbe,/const layout=new layoutModule\.MondrianLayout\(pattern\)/);
  assert.match(brTransportProbe,/layout\.fillEmptySpaces\(true\)/);
  assert.match(brTransportProbe,/const BR_B64="G\/QFg/);
  assert.match(brTransportProbe,/const PACKED_SHA="3469c9067eade08b6a0213345d3d22f0751790e425d67eb304c72faf5c29e858"/);
  assert.equal(/fetch\(\s*["'\x60]\/r\/block\//.test(brTransportProbe),false);
  assert.equal(/https?:\/\/[^"' ]+/.test(brTransportProbe),false);
});
