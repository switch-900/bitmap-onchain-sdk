import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { indexedDB, IDBKeyRange } from "fake-indexeddb";

const code = (await readFile(
  new URL("../1858bb7e91d48226586cf4ae78a739a54adbfa047f8a2040ef25c6b31feeca74i0.js", import.meta.url),
  "utf8"
)).replace(/^import .*$/gm, "")
  .replace(/\bexport\s+default\s+BitmapSDK;/g, "")
  .replace(/\bexport\s+(?=(?:const|async|function|class|let)\b)/g, "");
const inscriptionId = ch => ch.repeat(64) + "i0";
const textHex = text => Array.from(new TextEncoder().encode(text), b => b.toString(16).padStart(2, "0")).join("");

test("IndexedDB survives a new SDK instance, resumes and rewinds after reorg", async () => {
  const claims = new Map([
    [942000, []],
    [942001, [{ id: inscriptionId("a"), complete: true, bodyHex: textHex("942000.bitmap") }]],
    [942002, [{ id: inscriptionId("b"), complete: true, bodyHex: textHex("942001.bitmap") }]]
  ]);
  const hashes = new Map([...claims.keys()].map((h, i) => [h, String(i).repeat(64)]));
  const reads = { raw: 0, hash: 0 };
  const fetchBlock = async height => {
    reads.raw++;
    return { inscriptions: claims.get(height) ?? [] };
  };
  const fetchMock = async path => {
    if (path === "/r/blockheight") return { ok: true, text: async () => "942002" };
    if (path.startsWith("/r/blockhash/")) {
      reads.hash++;
      return { ok: true, json: async () => hashes.get(Number(path.split("/").at(-1))) };
    }
    if (path.startsWith("/r/inscription/")) {
      const id = path.split("/").at(-1);
      const height = [...claims].find(([, list]) => list.some(i => i.id === id))?.[0];
      return { ok: height !== undefined, status: height === undefined ? 404 : 200,
        json: async () => ({ height, sat: 12345 }) };
    }
    throw new Error("Unknown recursive fetch " + path);
  };
  const factory = new Function("indexSat", "indexInscriptionId", "fetchBlock", "listInscriptions",
    "toHex", "fetch", "indexedDB", "IDBKeyRange",
    code + "\nreturn { indexBitmapBlocks, getBitmapInscriptionId, validateBitmap, storage };");
  const instantiate = () => factory(async () => null, async () => null,
    fetchBlock, block => block.inscriptions,
    bytes => Array.from(bytes, b => b.toString(16).padStart(2, "0")).join(""),
    fetchMock, indexedDB, IDBKeyRange);

  const first = instantiate();
  try {
    const ready = await first.storage.ready();
    assert.equal(ready.available, true);
    assert.equal(ready.dbVersion, 3);
    const a = await first.indexBitmapBlocks({ maxBlocks: 2, confirmations: 0 });
    assert.equal(a.startHeight, 942000);
    assert.equal(a.scannedThroughHeight, 942001);
    assert.equal(a.fetchedBlocks, 2);
    assert.equal((await first.storage.getStatus()).bitmapBlockIndex, 2);
  } finally {
    first.storage.close();
  }

  const next = instantiate();
  try {
    const resumed = await next.indexBitmapBlocks({ maxBlocks: 2, confirmations: 0 });
    assert.equal(resumed.startHeight, 942001);
    assert.equal(resumed.scannedThroughHeight, 942002);
    assert.equal(resumed.fetchedBlocks, 1);
    assert.equal(resumed.reusedBlocks, 1);
    assert.equal((await next.storage.getStatus()).bitmapBlockIndex, 3);

    const before = reads.raw;
    const reuse = await next.indexBitmapBlocks({
      startHeight: 942000, endHeight: 942002, maxBlocks: 3, confirmations: 0
    });
    assert.equal(reuse.reusedBlocks, 3);
    assert.equal(reads.raw, before);

    const winner = await next.validateBitmap(942001);
    assert.equal(winner.inscriptionId, inscriptionId("b"));
    assert.equal((await next.storage.getStatus()).bitmaps, 1);

    // A formerly canonical claim disappears in a block reorganisation.
    hashes.set(942002, "f".repeat(64));
    claims.set(942002, [
      { id: inscriptionId("c"), complete: true, bodyHex: textHex("942001.bitmap") }
    ]);
    const rebuilt = await next.indexBitmapBlocks({
      startHeight: 942002, endHeight: 942002, maxBlocks: 1, confirmations: 0
    });
    assert.equal(rebuilt.fetchedBlocks, 1);
    const state = await next.storage.getStatus();
    assert.equal(state.bitmapBlockIndex, 3);
    assert.equal(state.bitmaps, 0, "stale canonical Bitmap record was removed");
    assert.equal(await next.getBitmapInscriptionId(942001), inscriptionId("c"));
  } finally {
    next.storage.close();
  }
});
