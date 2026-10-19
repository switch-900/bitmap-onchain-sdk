import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const source = await readFile(
  new URL("../1858bb7e91d48226586cf4ae78a739a54adbfa047f8a2040ef25c6b31feeca74i0.js", import.meta.url),
  "utf8"
);
// Browser-recursive imports are injected as test doubles. No network or wallet.
const executable = source
  .replace(/^import .*$/gm, "")
  .replace(/\bexport\s+default\s+BitmapSDK;/g, "")
  .replace(/\bexport\s+(?=(?:const|async|function|class|let)\b)/g, "");

const id = ch => ch.repeat(64) + "i0";
const hex = s => Array.from(new TextEncoder().encode(s), b => b.toString(16).padStart(2, "0")).join("");
const claim = (name, ch, options = {}) => ({
  id: id(ch), complete: true, bodyHex: hex(name), ...options
});

function createSdk() {
  const blocks = new Map([
    [942000, [claim("942000.bitmap", "a", { complete: false }), claim("942000.bitmap", "b", { delegate: "bad" })]],
    [942001, [claim("942000.bitmap", "c"), claim("942000.bitmap", "d")]],
    [942002, [claim("942001.bitmap", "e")]],
    [942003, [claim("942003.bitmap", "f", { contentEncoding: "gzip" })]]
  ]);
  const hashes = new Map([...blocks.keys()].map((h, i) => [h, String(i).repeat(64)]));
  const requests = { raw: 0, hash: 0, inscription: 0 };
  const fetchBlock = async h => {
    requests.raw++;
    return { inscriptions: blocks.get(h) ?? [] };
  };
  const fetchMock = async path => {
    if (path === "/r/blockheight") return { ok: true, text: async () => "942003" };
    if (path.startsWith("/r/blockhash/")) {
      requests.hash++;
      return { ok: true, json: async () => hashes.get(Number(path.split("/").at(-1))) };
    }
    if (path.startsWith("/r/inscription/")) {
      requests.inscription++;
      const inscriptionId = path.split("/").at(-1);
      const height = [...blocks].find(([, items]) => items.some(c => c.id === inscriptionId))?.[0];
      return { ok: height !== undefined, status: height === undefined ? 404 : 200,
        json: async () => ({ height, sat: 12345 }) };
    }
    throw new Error("Unexpected recursive request: " + path);
  };
  const load = new Function("indexSat", "indexInscriptionId", "fetchBlock", "listInscriptions",
    "toHex", "fetch", executable + "\nreturn { indexBitmapBlocks, scanBitmapClaim, getBitmapInscriptionId, getBitmapSat };");
  const sdk = load(async () => null, async () => null, fetchBlock,
    block => block.inscriptions, bytes => Array.from(bytes, b => b.toString(16).padStart(2, "0")).join(""),
    fetchMock);
  return { sdk, hashes, requests };
}

test("parallel range indexing records valid claims and reuses empty blocks", async () => {
  const { sdk, requests } = createSdk();
  const a = await sdk.indexBitmapBlocks({
    startHeight: 942000, endHeight: 942003, confirmations: 0, concurrency: 3, persist: false
  });
  assert.equal(a.processedBlocks, 4);
  assert.equal(a.bitmapCandidates, 3);
  assert.equal(a.fetchedBlocks, 4);
  assert.equal(requests.raw, 4);
  const b = await sdk.indexBitmapBlocks({
    startHeight: 942000, endHeight: 942003, confirmations: 0, persist: false
  });
  assert.equal(b.reusedBlocks, 4);
  assert.equal(requests.raw, 4);
});

test("bounded scans resume, reject invalids and preserve earliest claim", async () => {
  const { sdk, requests } = createSdk();
  await sdk.indexBitmapBlocks({ startHeight: 942000, endHeight: 942003, confirmations: 0, persist: false });
  const first = await sdk.scanBitmapClaim(942000, { maxScanBlocks: 1, persist: false });
  assert.equal(first.state, "missing");
  assert.equal(first.complete, false);
  assert.equal(first.nextHeight, 942001);
  const second = await sdk.scanBitmapClaim(942000, { maxScanBlocks: 1, persist: false });
  assert.equal(second.inscriptionId, id("c"));
  assert.equal(await sdk.getBitmapInscriptionId(942000), id("c"));
  assert.equal(await sdk.getBitmapInscriptionId(942001), id("e"));
  assert.equal(await sdk.getBitmapSat(942000), 12345);
  assert.equal(requests.raw, 4);
});

test("cached coverage detects changed block hashes and reparses", async () => {
  const { sdk, hashes, requests } = createSdk();
  await sdk.indexBitmapBlocks({ startHeight: 942002, endHeight: 942002, confirmations: 0, persist: false });
  assert.equal(requests.raw, 1);
  hashes.set(942002, "f".repeat(64));
  const updated = await sdk.indexBitmapBlocks({
    startHeight: 942002, endHeight: 942002, confirmations: 0, persist: false
  });
  assert.equal(updated.fetchedBlocks, 1);
  assert.equal(requests.raw, 2);
});

test("range indexer enforces bounded parameters", async () => {
  const { sdk } = createSdk();
  await assert.rejects(sdk.indexBitmapBlocks({ concurrency: 0 }), /concurrency/);
  await assert.rejects(sdk.indexBitmapBlocks({ maxBlocks: 0 }), /maxBlocks/);
  await assert.rejects(sdk.indexBitmapBlocks({ confirmations: -1 }), /confirmations/);
});
