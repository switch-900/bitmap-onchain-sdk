import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { indexedDB, IDBKeyRange } from "fake-indexeddb";

// Synthetic geometry sized like the observed 840000.bitmap test
// (3,050 slots / 48 gaps). It tests cache behaviour, not on-chain values.
const HEIGHT = 840000;
const SLOT_COUNT = 3050;
const GAP_COUNT = 48;
const runtime = (await readFile(
  new URL("../1858bb7e91d48226586cf4ae78a739a54adbfa047f8a2040ef25c6b31feeca74i0.js", import.meta.url),
  "utf8"
))
  .replace(/^import .*$/gm, "")
  .replace(/\bexport\s+default\s+BitmapSDK;/g, "")
  .replace(/\bexport\s+(?=(?:const|async|function|class|let)\b)/g, "")
  .replace('import("/content/" + MONDRIAN_MODULE_ID)', 'Promise.resolve(mockMondrianModule)');

test("cached base geometry expands gaps from stored pattern, persists them and honours forceLive", async () => {
  const calls = { layout:0, blockinfo:0, blockhash:0, raw:0, indexedPattern:0 };
  const mockMondrianModule = {
    getPatternArray: number => {
      calls.indexedPattern++;
      assert.equal(number, HEIGHT);
      return Array(SLOT_COUNT).fill(1);
    },
    getSquareSize: () => 1,
    MondrianLayout: class {
      constructor(pattern) {
        calls.layout++;
        this.slots = pattern.map((size, i) => ({
          position: { x: (i % 55) * 2, y: Math.floor(i / 55) * 2 }, size
        }));
        this.width = 110;
        this.height = 112;
        this.length = pattern.length;
      }
      getSize() { return { width:this.width, height:this.height }; }
      fillEmptySpaces() {
        return Array.from({ length:GAP_COUNT }, (_, i) => ({
          position: { x:111, y:i * 2 }, size:1
        }));
      }
    }
  };
  const fetchMock = async path => {
    if (path === "/r/blockinfo/" + HEIGHT) {
      calls.blockinfo++;
      return { ok:true, json:async () => ({ transaction_count:SLOT_COUNT }) };
    }
    if (path === "/r/blockhash/" + HEIGHT) {
      calls.blockhash++;
      return { ok:true, json:async () => "a".repeat(64) };
    }
    if (path === "/r/block/" + HEIGHT) {
      calls.raw++;
      return { ok:true, json:async () => "not-hex" };
    }
    throw Error("Unexpected recursive fetch " + path);
  };
  const factory = new Function(
    "indexSat", "indexInscriptionId", "fetchBlock", "listInscriptions", "toHex",
    "fetch", "indexedDB", "IDBKeyRange", "mockMondrianModule",
    runtime + "\nreturn { getBitmapMondrian, storage };"
  );
  const sdk = () => factory(
    async () => null, async () => null,
    async () => { throw Error("Not needed by Mondrian test"); },
    () => [], bytes => Array.from(bytes, b => b.toString(16).padStart(2,"0")).join(""),
    fetchMock, indexedDB, IDBKeyRange, mockMondrianModule
  );

  const firstInstance = sdk();
  try {
    assert.equal((await firstInstance.storage.ready()).available, true);
    const base = await firstInstance.getBitmapMondrian(HEIGHT);
    assert.equal(base.slots.length, SLOT_COUNT);
    assert.equal("emptySpaces" in base, false);
    assert.equal((await firstInstance.storage.getMondrian(HEIGHT)).emptySpaces, undefined);

    // Before the fix this silently returned cached geometry with no gaps.
    const expanded = await firstInstance.getBitmapMondrian(HEIGHT, { includeEmptySpaces:true });
    assert.equal(expanded.slots.length, SLOT_COUNT);
    assert.equal(expanded.emptySpaces.length, GAP_COUNT);
    assert.equal(calls.raw, 0, "gaps must come from the stored pattern, not another raw block");
    assert.equal(calls.indexedPattern, 1, "does not refetch an indexed pattern");
    assert.equal((await firstInstance.storage.getMondrian(HEIGHT)).emptySpaces.length, GAP_COUNT);

    const layoutCalls = calls.layout;
    const warm = await firstInstance.getBitmapMondrian(HEIGHT, { includeEmptySpaces:true });
    assert.equal(warm.emptySpaces.length, GAP_COUNT);
    assert.equal(calls.layout, layoutCalls, "warm geometry must not rebuild the layout");
  } finally {
    firstInstance.storage.close();
  }

  // Same fake IndexedDB origin, fresh independent SDK instance.
  const secondInstance = sdk();
  try {
    const previousLayouts = calls.layout;
    const fromDisk = await secondInstance.getBitmapMondrian(HEIGHT, { includeEmptySpaces:true });
    assert.equal(fromDisk.emptySpaces.length, GAP_COUNT);
    assert.equal(calls.layout, previousLayouts, "gap cache persists over SDK instances");

    // forceLive must never be silently overridden by a stored geometry hit.
    await assert.rejects(
      secondInstance.getBitmapMondrian(HEIGHT, { forceLive:true }),
      /returned invalid block hex/
    );
    assert.equal(calls.raw, 1, "forceLive must attempt the live recursive raw block path");
  } finally {
    secondInstance.storage.close();
  }
});
