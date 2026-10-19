import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { Script } from "node:vm";

const file = new URL("./ordinals-viewer-probe.html", import.meta.url);
const consoleFile = new URL("./ordinals-viewer-console.js", import.meta.url);
const html = await readFile(file, "utf8");
const consoleJs = await readFile(consoleFile, "utf8");
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
