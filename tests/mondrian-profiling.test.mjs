import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const source = (await readFile(new URL(
  "../1858bb7e91d48226586cf4ae78a739a54adbfa047f8a2040ef25c6b31feeca74i0.js",
  import.meta.url
), "utf8"))
  .replace(/^import .*$/gm, "")
  .replace(/\bexport\s+default\s+BitmapSDK;/g, "")
  .replace(/\bexport\s+(?=(?:const|async|function|class|let)\b)/g, "")
  .replace('import("/content/" + MONDRIAN_MODULE_ID)', 'Promise.resolve(mockMondrianModule)');

const HEIGHT = 840000;
const TXS = 3050;

function bitcoinBlockHex(txCount) {
  const bytes = Array(80).fill(0);
  // 3050 transactions encoded as CompactSize uint16.
  bytes.push(253, txCount % 256, Math.floor(txCount / 256));
  for (let i = 0; i < txCount; i++) {
    bytes.push(1, 0, 0, 0, 1); // version, one input
    for (let z = 0; z < 36; z++) bytes.push(0); // prev tx, output
    bytes.push(0, 0, 0, 0, 0, 1); // no input script, sequence, one output
    bytes.push(232, 3, 0, 0, 0, 0, 0, 0, 0); // output 1000 sats and empty script
    bytes.push(0, 0, 0, 0); // locktime
  }
  return Uint8Array.from(bytes).reduce((out, value) =>
    out + value.toString(16).padStart(2, "0"), "");
}

function createHarness() {
  const paths = [];
  const timeEvents = [];
  const rawBlock = bitcoinBlockHex(TXS);
  const mockMondrianModule = {
    getSquareSize: () => 1,
    getPatternArray: () => null,
    MondrianLayout: class {
      constructor(pattern) {
        assert.equal(pattern.length, TXS);
        this.slots = pattern.map((size, i) => ({
          position:{ x:i%60, y:Math.floor(i/60) }, size
        }));
        this.width = 60;
        this.height = 51;
        this.length = pattern.length;
      }
      getSize(){ return { width:this.width, height:this.height }; }
      fillEmptySpaces(){ return Array.from({length:48}, (_,i)=>({
        position:{x:61,y:i},size:1
      })); }
    }
  };
  const fetchMock = async path => {
    paths.push(path);
    if (path === "/r/block/" + HEIGHT) {
      // Verify blockinfo was started while raw block is still awaiting response.
      await Promise.resolve();
      assert.ok(paths.includes("/r/blockinfo/" + HEIGHT),
        "blockinfo request must start concurrently with raw block");
      return {ok:true,status:200,json:async()=>rawBlock};
    }
    if (path === "/r/blockinfo/" + HEIGHT)
      return {ok:true,status:200,json:async()=>({transaction_count:TXS})};
    throw Error("Unexpected recursive URL " + path);
  };
  const compile = new Function(
    "indexSat","indexInscriptionId","fetchBlock","listInscriptions","toHex",
    "fetch","mockMondrianModule",
    source + "\nreturn {getBitmapMondrian,getBitmapPatternInfo};"
  );
  const sdk = compile(async()=>null,async()=>null,
    async()=>{throw Error("No inscription scanning should occur");},
    ()=>[],bytes=>Array.from(bytes,b=>b.toString(16).padStart(2,"0")).join(""),
    fetchMock,mockMondrianModule);
  return {sdk,paths,timeEvents};
}

test("840000-sized raw block: concurrent block info and detailed telemetry", async () => {
  const {sdk,paths,timeEvents} = createHarness();
  const out = await sdk.getBitmapMondrian(HEIGHT,{
    includeEmptySpaces:true,
    forceLive:true,
    persist:false,
    onTiming:event=>timeEvents.push(event)
  });
  assert.equal(out.slots.length, 3050);
  assert.equal(out.emptySpaces.length, 48);
  assert.equal(out.source, "recursive-raw-block");
  assert.deepEqual(paths, ["/r/block/" + HEIGHT, "/r/blockinfo/" + HEIGHT]);
  const required = [
    "mondrian-module", "raw-block-http", "raw-block-json",
    "raw-block-hex-decoder", "raw-block-transaction-parser", "block-transaction-count",
    "pattern-derivation", "pattern-resolution", "layout-construction",
    "slot-mapping", "empty-space-construction", "total"
  ];
  const stageSet = new Set(timeEvents.map(event=>event.stage));
  for(const stage of required)assert.ok(stageSet.has(stage), "Missing timing stage "+stage);
  for(const event of timeEvents)assert.ok(Number.isFinite(event.ms) && event.ms >= 0);
  assert.equal(timeEvents.find(x=>x.stage==="total").slots,3050);
});

test("onTiming callback errors must not alter Bitmap geometry",async()=>{
  const {sdk}=createHarness();
  const result=await sdk.getBitmapMondrian(HEIGHT,{
    forceLive:true,persist:false,
    onTiming:()=>{throw Error("Telemetry consumer failure");}
  });
  assert.equal(result.slots.length,3050);
});

test("onTiming must be a callback if provided",async()=>{
  const {sdk}=createHarness();
  await assert.rejects(
    sdk.getBitmapMondrian(HEIGHT,{onTiming:true}),
    /onTiming must be a function or null/
  );
});
