/*
 * Bitmap SDK v1.0.1
 *
 * On-chain Bitmap development SDK.
 *
 * Provides:
 * - canonical Bitmap resolution and validation
 * - canonical Parcel discovery and validation
 * - Parcel protocol rules and tie-breaks
 * - deterministic Bitmap Mondrian geometry
 * - parent/child provenance and same-sat reinscription history
 * - optional persistent IndexedDB acceleration
 * - live Bitcoin block scanning, reorg handling and updates
 *
 * Built recursively using existing on-chain primitives:
 * - Legacy <942k Bitmap OCI:
 *   942b5886158d57fc70cb8fb7d9bd4d37aa95b8b145be1a351326336b087262dbi0
 * - Bitcoin block / inscription parser:
 *   bbbb2172ebca174579884df1ad7487196c39e860b3aacdf4e052a33bf5ec31fai0
 * - Mondrian layout primitive:
 *   55551557695dd82a2bda5ec3497684ec7cbb2cc1752ff5101accff1648666c3ai0
 *
 * Bitcoin and Ord recursive endpoints remain the source of truth.
 * IndexedDB is an optional validated local cache only.
 *
 * Parcel rules are deliberately locked to the supplied working Parcel Validator:
 * whitespace is removed before parsing; the block token must exactly match N;
 * parcelNumber uses parseInt(..., 10); /r/blockinfo supplies the normal tx count;
 * /r/block raw hex is the recursive fallback and live Mondrian source;
 * block scans stay cheap by default and do not resolve every encoded/delegated inscription;
 * set resolveEncodedParcelCandidates:true for an exhaustive but potentially expensive scan;
 * duplicates resolve by lower genesis height, then numeric-aware inscription ID.
 *
 * Experimental software. Verify critical results independently.
 */
import { getBitmapSat as indexSat, getBitmapInscriptionId as indexInscriptionId } from "/content/942b5886158d57fc70cb8fb7d9bd4d37aa95b8b145be1a351326336b087262dbi0";
import { fetchBlock, listInscriptions, toHex } from "/content/bbbb2172ebca174579884df1ad7487196c39e860b3aacdf4e052a33bf5ec31fai0";
export const SDK_NAME = "Bitmap SDK";
export const VERSION = "1.0.1";
export const OLD_OCI_LIMIT = 942e3;
export const MONDRIAN_MODULE_ID = "55551557695dd82a2bda5ec3497684ec7cbb2cc1752ff5101accff1648666c3ai0";
export const STORAGE_DB_NAME = "bitmap-sdk";
export const STORAGE_DB_VERSION = 2;
export const STORAGE_PROTOCOL_VERSION = "bitmap-sdk-v1.0.1";
const STORAGE_CHANNEL_NAME = "bitmap-sdk-v1.0.1", REQUEST_TIMEOUT_MS = 2e4, LIVE_CACHE_TTL_MS = 3e4, BLOCK_CACHE_LIMIT = 32, MAX_PAGINATION_PAGES = 1e5, SYNC_LEASE_MS = 12e4, SYNC_LEASE_POLL_MS = 250, foundBitmapCache = new Map, bitmapPromiseCache = new Map, blockInfoCache = new Map, rawTransactionCountCache = new Map, parcelContentCache = new Map, parsedBlockCache = new Map, parsedBlockPromiseCache = new Map, parentIdsCache = new Map, inscriptionInfoCache = new Map, childrenDetailsCache = new Map, childrenDetailsPromiseCache = new Map, parcelStateCache = new Map, mondrianCache = new Map;
let mondrianModulePromise = null, tipCache = { height: null, expiresAt: 0 };
function getTtl(e, t) { const a = e.get(t); if (a) {
    if (!(Date.now() >= a.expiresAt))
        return a.value;
    e.delete(t);
} }
function setTtl(e, t, a, r = 3e4) { return e.set(t, { value: a, expiresAt: Date.now() + r }), a; }
function rememberParsedBlock(e, t) { for (parsedBlockCache.delete(e), parsedBlockCache.set(e, t); parsedBlockCache.size > 32;)
    parsedBlockCache.delete(parsedBlockCache.keys().next().value); }
function checkBitmapNumber(e) { if (!Number.isSafeInteger(e) || e < 0)
    throw new TypeError("bitmapNumber must be a safe whole number, 0 or higher"); }
function checkParcelNumber(e) { if (!Number.isSafeInteger(e) || e < 0)
    throw new TypeError("parcelNumber must be a safe whole number, 0 or higher"); }
function checkInscriptionId(e) { if ("string" != typeof e || !/^[0-9a-f]{64}i[0-9]+$/i.test(e))
    throw new TypeError("Invalid inscription ID"); }
function normaliseHeight(e) { const t = e?.height ?? e?.genesis_height; return Number.isSafeInteger(t) && t >= 0 ? t : null; }
const sleep = e => new Promise(t => setTimeout(t, e));
async function mapWithConcurrency(e, t, a) { if (!Array.isArray(e) || 0 === e.length)
    return []; const r = Math.max(1, Math.min(Number(t) || 1, e.length)), n = new Array(e.length); let i = 0; return await Promise.all(Array.from({ length: r }, () => async function () { for (;;) {
    const t = i++;
    if (t >= e.length)
        return;
    n[t] = await a(e[t], t);
} }())), n; }
async function fetchWithTimeout(e, t = {}) { const a = new AbortController, r = setTimeout(() => a.abort(), 2e4); try {
    return await fetch(e, { ...t, signal: a.signal });
}
catch (t) {
    if ("AbortError" === t?.name)
        throw new Error("Request timed out: " + e);
    throw t;
}
finally {
    clearTimeout(r);
} }
async function fetchJson(e) { const t = await fetchWithTimeout(e); if (!t.ok)
    throw new Error(e + " returned HTTP " + t.status); return await t.json(); }
async function fetchText(e) { const t = await fetchWithTimeout(e); if (!t.ok)
    throw new Error(e + " returned HTTP " + t.status); return await t.text(); }
export async function getChainHeight() { const e = Number(await fetchText("/r/blockheight")); if (!Number.isSafeInteger(e) || e < 0)
    throw new Error("Invalid /r/blockheight response"); return tipCache = { height: e, expiresAt: Date.now() + 5e3 }, e; }
async function getChainHeightCached() { return Number.isSafeInteger(tipCache.height) && Date.now() < tipCache.expiresAt ? tipCache.height : await getChainHeight(); }
export async function getBlockHash(e) { checkBitmapNumber(e); const t = await fetchJson("/r/blockhash/" + e); if ("string" != typeof t || !/^[0-9a-f]{64}$/i.test(t))
    throw new Error("Invalid /r/blockhash/" + e + " response"); return t.toLowerCase(); }
export async function getBlockHashWithRetry(e, { attempts: t = 5, delayMs: a = 500 } = {}) { checkBitmapNumber(e); let r = null; for (let n = 0; n < t; n++)
    try {
        return await getBlockHash(e);
    }
    catch (e) {
        if (r = e, !String(e?.message || "").includes("404") || n === t - 1)
            throw e;
        await sleep(a * (n + 1));
    } throw r; }
async function getBlockInfo(e) { if (checkBitmapNumber(e), blockInfoCache.has(e))
    return blockInfoCache.get(e); const t = await fetchJson("/r/blockinfo/" + e); if (!Number.isSafeInteger(t?.transaction_count) || t.transaction_count < 0)
    throw new Error("Block " + e + " has no valid transaction_count"); return blockInfoCache.set(e, t), t; }
async function getInscriptionInfo(e, { forceRefresh: t = !1 } = {}) { if (checkInscriptionId(e), !t) {
    const t = getTtl(inscriptionInfoCache, e);
    if (void 0 !== t)
        return t;
} const a = await fetchJson("/r/inscription/" + e); return setTtl(inscriptionInfoCache, e, a); }
async function getParsedBlockInscriptions(e) { if (checkBitmapNumber(e), parsedBlockCache.has(e))
    return parsedBlockCache.get(e); if (parsedBlockPromiseCache.has(e))
    return await parsedBlockPromiseCache.get(e); const t = (async () => { try {
    const t = await fetchBlock(e, { classify: !1, locate: !1 }), a = listInscriptions(t);
    if (!Array.isArray(a))
        throw new Error("Block parser returned non-array inscriptions for block " + e);
    return rememberParsedBlock(e, a), a;
}
finally {
    parsedBlockPromiseCache.delete(e);
} })(); return parsedBlockPromiseCache.set(e, t), await t; }
async function getParsedBlockInscriptionsWithRetry(e, { attempts: t = 5, delayMs: a = 500 } = {}) { let r = null; for (let n = 0; n < t; n++)
    try {
        return await getParsedBlockInscriptions(e);
    }
    catch (e) {
        if (r = e, !String(e?.message || "").includes("404") || n === t - 1)
            throw e;
        await sleep(a * (n + 1));
    } throw r; }
async function getParsedInscription(e, t) { return (await getParsedBlockInscriptions(t)).find(t => t?.id === e) || null; }
const hasContentEncoding = e => null != e?.contentEncoding, hasDelegate = e => null != e?.delegate, utf8Hex = e => toHex((new TextEncoder).encode(e));
function validateRawTextClaim(e, t) { return e ? !0 !== e.complete ? { valid: !1, reason: "Inscription is incomplete" } : hasContentEncoding(e) ? { valid: !1, reason: "content-encoding is not allowed" } : hasDelegate(e) ? { valid: !1, reason: "Delegates are not allowed" } : e.bodyHex !== utf8Hex(t) ? { valid: !1, reason: 'Raw body is not exactly "' + t + '"' } : { valid: !0 } : { valid: !1, reason: "Inscription was not found in its genesis block" }; }
function decodeBodyHex(e) { if ("string" != typeof e || e.length % 2 != 0 || e.length > 512)
    return null; const t = new Uint8Array(e.length / 2); for (let a = 0; a < t.length; a++) {
    const r = Number.parseInt(e.slice(2 * a, 2 * a + 2), 16);
    if (Number.isNaN(r))
        return null;
    t[a] = r;
} try {
    return new TextDecoder("utf-8", { fatal: !0 }).decode(t);
}
catch {
    return null;
} }
export function parseBitmapName(e) { if ("string" != typeof e)
    return null; const t = /^(0|[1-9][0-9]*)\.bitmap$/.exec(e); if (!t)
    return null; const a = Number(t[1]); return !Number.isSafeInteger(a) || a < 0 ? null : { bitmapNumber: a, content: e, name: a + ".bitmap" }; }
function normalizeParcelContent(e) { return "string" == typeof e ? e.trim().replace(/\s+/g, "") : null; }
export function parseParcelName(e) { const t = normalizeParcelContent(e); if (null === t)
    return null; const a = t.split("."); if (3 !== a.length || "bitmap" !== a[2])
    return null; const r = a[0], n = a[1], i = Number(n); if (!Number.isSafeInteger(i) || i < 0 || n !== String(i))
    return null; const o = Number.parseInt(r, 10); return Number.isNaN(o) || o < 0 || !Number.isSafeInteger(o) ? null : { parcelNumber: o, bitmapNumber: i, content: t, name: o + "." + i + ".bitmap", parcelToken: r, bitmapToken: n }; }
let storageDbPromise = null, storageInitialisedPromise = null, storageChannel = null, storageUnavailableReason = null;
const storageSubscribers = new Set, storageInstanceId = "undefined" != typeof crypto && "function" == typeof crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + "-" + Math.random().toString(36).slice(2), indexedDbAvailable = () => !storageUnavailableReason && "undefined" != typeof indexedDB && null !== indexedDB;
function disableStorage(e) { return storageUnavailableReason = e?.name ? e.name + (e.message ? ": " + e.message : "") : e?.message || String(e || "IndexedDB unavailable"), storageDbPromise = null, storageInitialisedPromise = null, null; }
function ensureIndex(e, t, a, r = {}) { e.indexNames.contains(t) || e.createIndex(t, a, r); }
function openStorageDb() { if (!indexedDbAvailable())
    return Promise.resolve(null); if (storageDbPromise)
    return storageDbPromise; const e = new Promise(e => { let t = null, a = !1, r = null; const n = (n, i = null) => { if (a)
    return void (i && i.close?.()); a = !0, null !== r && clearTimeout(r), n ? e(n) : (disableStorage(i || new Error("IndexedDB unavailable")), e(null)); }; try {
    t = indexedDB.open(STORAGE_DB_NAME, STORAGE_DB_VERSION);
}
catch (e) {
    return void n(null, e);
} r = setTimeout(() => n(null, new Error("IndexedDB open timed out")), 2500), t.onerror = () => n(null, t.error || new Error("Failed to open IndexedDB")), t.onblocked = () => n(null, new Error("IndexedDB upgrade blocked by another tab")), t.onupgradeneeded = () => { const e = t.result, a = t.transaction, r = (t, r) => e.objectStoreNames.contains(t) ? a.objectStore(t) : e.createObjectStore(t, r); r("meta", { keyPath: "key" }); const n = r("bitmaps", { keyPath: "bitmapNumber" }); ensureIndex(n, "inscriptionId", "inscriptionId"), ensureIndex(n, "height", "height"); const i = r("parcels", { keyPath: ["bitmapNumber", "parcelNumber"] }); ensureIndex(i, "bitmapNumber", "bitmapNumber"), ensureIndex(i, "inscriptionId", "id"), ensureIndex(i, "height", "height"), ensureIndex(r("bitmapState", { keyPath: "bitmapNumber" }), "childrenScannedThroughHeight", "childrenScannedThroughHeight"), r("mondrians", { keyPath: "bitmapNumber" }), r("blockHashes", { keyPath: "height" }), ensureIndex(r("childTrees", { keyPath: "rootId" }), "syncedThroughHeight", "syncedThroughHeight"), ensureIndex(r("satChains", { keyPath: "sat" }), "syncedThroughHeight", "syncedThroughHeight"); const o = r("parcelClaims", { keyPath: ["bitmapNumber", "id"] }); ensureIndex(o, "bitmapNumber", "bitmapNumber"), ensureIndex(o, "height", "height"); const s = r("bitmapSearch", { keyPath: "bitmapNumber" }); ensureIndex(s, "scannedThroughHeight", "scannedThroughHeight"); }, t.onsuccess = () => { const e = t.result; if (a)
    return void e.close(); e.onversionchange = () => { e.close(), storageDbPromise = null, storageInitialisedPromise = null; }, n(e); }; }); return storageDbPromise = e, e; }
async function clearStorageForProtocolChange(e) { const t = ["bitmaps", "parcels", "bitmapState", "mondrians", "blockHashes", "childTrees", "satChains", "parcelClaims", "bitmapSearch", "meta"].filter(t => e.objectStoreNames.contains(t)); if (!t.length)
    return !0; return await new Promise(a => { try {
    const r = e.transaction(t, "readwrite");
    for (const e of t)
        r.objectStore(e).clear();
    r.oncomplete = () => a(!0), r.onerror = () => a(!1), r.onabort = () => a(!1);
}
catch {
    return a(!1);
} }); }
async function initialiseStorage() { const e = { available: !1, dbName: STORAGE_DB_NAME, dbVersion: STORAGE_DB_VERSION, protocolVersion: STORAGE_PROTOCOL_VERSION, moduleVersion: VERSION, reason: storageUnavailableReason }; if (!indexedDbAvailable())
    return e; if (storageInitialisedPromise)
    return await storageInitialisedPromise; storageInitialisedPromise = (async () => { const t = await openStorageDb(); if (!t)
    return { ...e, reason: storageUnavailableReason }; const a = await idbGet("meta", "schema"); if (a?.protocolVersion !== STORAGE_PROTOCOL_VERSION) {
    const e = await clearStorageForProtocolChange(t);
    if (!e)
        throw new Error("Unable to invalidate old Bitmap SDK validation cache");
} ; await idbPut("meta", { key: "schema", dbVersion: STORAGE_DB_VERSION, protocolVersion: STORAGE_PROTOCOL_VERSION, sdkName: SDK_NAME, moduleVersion: VERSION, updatedAt: Date.now() }), ensureStorageChannel(); return { available: !0, dbName: STORAGE_DB_NAME, dbVersion: STORAGE_DB_VERSION, protocolVersion: STORAGE_PROTOCOL_VERSION, moduleVersion: VERSION }; })(); try {
    return await storageInitialisedPromise;
}
catch (t) {
    return disableStorage(t), { ...e, reason: storageUnavailableReason };
} }
function ensureStorageChannel() { if (storageChannel || "undefined" == typeof BroadcastChannel)
    return storageChannel; try {
    return storageChannel = new BroadcastChannel(STORAGE_CHANNEL_NAME), storageChannel.onmessage = e => { const t = e?.data; t && t.protocolVersion === STORAGE_PROTOCOL_VERSION && t.sourceId !== storageInstanceId && notifyStorageSubscribers(t, !1); }, storageChannel;
}
catch {
    return null;
} }
function notifyStorageSubscribers(e, t = !0) { const a = { protocolVersion: STORAGE_PROTOCOL_VERSION, sourceId: storageInstanceId, at: Date.now(), ...e }; for (const e of storageSubscribers)
    try {
        e(a);
    }
    catch (e) {
        console.error("Bitmap SDK storage subscriber error:", e);
    } if (t)
    try {
        ensureStorageChannel()?.postMessage(a);
    }
    catch { } }
async function idbGet(e, t) { const a = await openStorageDb(); if (!a)
    return null; try {
    return await new Promise(r => { let n; try {
        const i = a.transaction(e, "readonly");
        n = i.objectStore(e).get(t), n.onsuccess = () => r(n.result ?? null), n.onerror = () => r(null);
    }
    catch (e) {
        disableStorage(e), r(null);
    } });
}
catch {
    return null;
} }
async function idbPut(e, t) { const a = await openStorageDb(); if (!a)
    return !1; try {
    return await new Promise(r => { try {
        const n = a.transaction(e, "readwrite");
        n.objectStore(e).put(t), n.oncomplete = () => r(!0), n.onerror = () => r(!1), n.onabort = () => r(!1);
    }
    catch (e) {
        disableStorage(e), r(!1);
    } });
}
catch {
    return !1;
} }
async function idbPutMany(e, t) { if (!Array.isArray(t) || 0 === t.length)
    return !0; const a = await openStorageDb(); if (!a)
    return !1; try {
    return await new Promise(r => { try {
        const n = a.transaction(e, "readwrite"), i = n.objectStore(e);
        for (const e of t)
            i.put(e);
        n.oncomplete = () => r(!0), n.onerror = () => r(!1), n.onabort = () => r(!1);
    }
    catch (e) {
        disableStorage(e), r(!1);
    } });
}
catch {
    return !1;
} }
async function idbCount(e) { const t = await openStorageDb(); if (!t)
    return 0; try {
    return await new Promise(a => { try {
        const r = t.transaction(e, "readonly"), n = r.objectStore(e).count();
        n.onsuccess = () => a(Number(n.result) || 0), n.onerror = () => a(0);
    }
    catch (e) {
        disableStorage(e), a(0);
    } });
}
catch {
    return 0;
} }
async function idbGetAllByIndex(e, t, a) { const r = await openStorageDb(); if (!r)
    return []; try {
    return await new Promise(n => { try {
        const i = r.transaction(e, "readonly"), o = i.objectStore(e).index(t).getAll(a);
        o.onsuccess = () => n(Array.isArray(o.result) ? o.result : []), o.onerror = () => n([]);
    }
    catch (e) {
        disableStorage(e), n([]);
    } });
}
catch {
    return [];
} }
async function idbClearStore(e) { const t = await openStorageDb(); if (!t)
    return !1; try {
    return await new Promise(a => { try {
        const r = t.transaction(e, "readwrite");
        r.objectStore(e).clear(), r.oncomplete = () => a(!0), r.onerror = () => a(!1), r.onabort = () => a(!1);
    }
    catch (e) {
        disableStorage(e), a(!1);
    } });
}
catch {
    return !1;
} }
async function getMetaValue(e) { return (await idbGet("meta", e))?.value ?? null; }
async function setMetaValue(e, t) { return await idbPut("meta", { key: e, value: t, protocolVersion: STORAGE_PROTOCOL_VERSION, updatedAt: Date.now() }); }
function currentStoredRecord(e) { return e?.protocolVersion === STORAGE_PROTOCOL_VERSION ? e : null; }
function currentStoredRecords(e) { return Array.isArray(e) ? e.filter(e => e?.protocolVersion === STORAGE_PROTOCOL_VERSION) : []; }
async function storageGetBitmapSafe(e) { if (!indexedDbAvailable())
    return null; try {
    return await initialiseStorage(), currentStoredRecord(await idbGet("bitmaps", e));
}
catch {
    return null;
} }
async function storageGetParcelSafe(e, t) { if (!indexedDbAvailable())
    return null; try {
    return await initialiseStorage(), currentStoredRecord(await idbGet("parcels", [t, e]));
}
catch {
    return null;
} }
async function storageGetBitmapStateSafe(e) { if (!indexedDbAvailable())
    return null; try {
    return await initialiseStorage(), currentStoredRecord(await idbGet("bitmapState", e));
}
catch {
    return null;
} }
async function storageGetMondrianSafe(e) { if (!indexedDbAvailable())
    return null; try {
    return await initialiseStorage(), currentStoredRecord(await idbGet("mondrians", e));
}
catch {
    return null;
} }
async function storageGetBitmapParcelsSafe(e) { if (!indexedDbAvailable())
    return []; try {
    return await initialiseStorage(), currentStoredRecords(await idbGetAllByIndex("parcels", "bitmapNumber", e)).sort((e, t) => e.parcelNumber - t.parcelNumber);
}
catch {
    return [];
} }
async function storageGetParcelClaimsSafe(e) { if (!indexedDbAvailable())
    return []; try {
    return await initialiseStorage(), currentStoredRecords(await idbGetAllByIndex("parcelClaims", "bitmapNumber", e));
}
catch {
    return [];
} }
async function storageGetParcelByInscriptionSafe(e) { if (!indexedDbAvailable())
    return null; try {
    await initialiseStorage();
    const t = await openStorageDb();
    return t ? await new Promise((a, r) => { const n = t.transaction("parcels", "readonly"), i = n.objectStore("parcels").index("inscriptionId").get(e); i.onsuccess = () => a(currentStoredRecord(i.result ?? null)), i.onerror = () => r(i.error || n.error); }) : null;
}
catch {
    return null;
} }
async function storageGetChildTreeSafe(e) { if (!indexedDbAvailable())
    return null; try {
    return await initialiseStorage(), currentStoredRecord(await idbGet("childTrees", e));
}
catch {
    return null;
} }
async function storageGetSatChainSafe(e) { if (!indexedDbAvailable())
    return null; try {
    return await initialiseStorage(), currentStoredRecord(await idbGet("satChains", e));
}
catch {
    return null;
} }
async function storageGetBitmapSearchSafe(e) { if (!indexedDbAvailable())
    return null; try {
    return await initialiseStorage(), currentStoredRecord(await idbGet("bitmapSearch", e));
}
catch {
    return null;
} }
async function persistBitmapSearch(e, t, a = null, r = null) { return indexedDbAvailable() ? (await initialiseStorage(), await idbPut("bitmapSearch", { bitmapNumber: e, scannedThroughHeight: t, foundInscriptionId: a, foundHeight: r, protocolVersion: STORAGE_PROTOCOL_VERSION, storedAt: Date.now() })) : !1; }
function storedBitmapToValidation(e) { return { valid: !0, claimed: !0, canonical: !0, bitmapNumber: e.bitmapNumber, name: e.name, inscriptionId: e.inscriptionId, sat: e.sat ?? null, height: e.height, number: e.number ?? null, address: e.address ?? null, output: e.output ?? null, satpoint: e.satpoint ?? null, timestamp: e.timestamp ?? null, source: "indexeddb", validatedThroughHeight: e.validatedThroughHeight ?? null }; }
function storedParcelToValidation(e) { return { id: e.id, content: e.content, name: e.name, parcelNumber: e.parcelNumber, bitmapNumber: e.bitmapNumber, bitmapInscriptionId: e.bitmapInscriptionId, height: e.height, number: e.number ?? null, fee: e.fee ?? null, output: e.output ?? null, sat: e.sat ?? null, satpoint: e.satpoint ?? null, timestamp: e.timestamp ?? null, charms: Array.isArray(e.charms) ? [...e.charms] : [], validatedThroughHeight: e.validatedThroughHeight ?? null }; }
function storedMondrianToPublic(e) { return { bitmapNumber: e.bitmapNumber, source: "indexeddb", transactionCount: e.transactionCount, pattern: Array.isArray(e.pattern) ? e.pattern.slice() : [], width: e.width, height: e.height, length: e.length ?? null, slots: Array.isArray(e.slots) ? e.slots.map(e => ({ ...e })) : [], ...Array.isArray(e.emptySpaces) ? { emptySpaces: e.emptySpaces.map(e => ({ ...e })) } : {} }; }
function parcelStateFromStored(e, t, a, r) { const n = r.map(storedParcelToValidation); return { valid: !0, bitmapNumber: e, bitmap: t, transactionCount: a.transactionCount, totalChildren: a.totalChildren ?? null, validParcelCount: n.length, unclaimedParcelCount: Math.max(0, a.transactionCount - n.length), validParcels: n, invalidChildren: Array.isArray(a.invalidChildren) ? a.invalidChildren : [], duplicateClaims: Array.isArray(a.duplicateClaims) ? a.duplicateClaims : [], stored: !0, childrenScannedThroughHeight: a.childrenScannedThroughHeight ?? null }; }
async function safeCurrentTip(e = 0) { try {
    return Math.max(e, await getChainHeightCached());
}
catch {
    return e;
} }
async function persistBitmapRecord(e, t) { if (!indexedDbAvailable() || !e?.valid || !e?.canonical)
    return !1; await initialiseStorage(); const a = { bitmapNumber: e.bitmapNumber, name: e.name, inscriptionId: e.inscriptionId, sat: e.sat ?? null, height: e.height, number: e.number ?? null, address: e.address ?? null, output: e.output ?? null, satpoint: e.satpoint ?? null, timestamp: e.timestamp ?? null, validated: !0, validatedThroughHeight: t, protocolVersion: STORAGE_PROTOCOL_VERSION, storedAt: Date.now() }; return await idbPut("bitmaps", a), notifyStorageSubscribers({ type: "bitmap", bitmapNumber: e.bitmapNumber, inscriptionId: e.inscriptionId }), !0; }
async function persistCanonicalParcel(e, t) { if (!indexedDbAvailable() || !1 === e?.valid || !1 === e?.canonical)
    return !1; checkBitmapNumber(e.bitmapNumber), checkParcelNumber(e.parcelNumber), await initialiseStorage(); const a = { id: e.id ?? e.inscriptionId, content: e.content, name: e.name, parcelNumber: e.parcelNumber, bitmapNumber: e.bitmapNumber, bitmapInscriptionId: e.bitmapInscriptionId, height: e.height, number: e.number ?? null, fee: e.fee ?? null, output: e.output ?? null, sat: e.sat ?? null, satpoint: e.satpoint ?? null, timestamp: e.timestamp ?? null, charms: Array.isArray(e.charms) ? [...e.charms] : [], validated: !0, validatedThroughHeight: t, protocolVersion: STORAGE_PROTOCOL_VERSION, storedAt: Date.now() }; return await idbPut("parcels", a), notifyStorageSubscribers({ type: "parcel", bitmapNumber: e.bitmapNumber, parcelNumber: e.parcelNumber, inscriptionId: a.id }), !0; }
async function persistParcelState(e, t) { if (!indexedDbAvailable() || !e?.valid || !e?.bitmap?.valid)
    return !1; await initialiseStorage(); const a = await openStorageDb(); if (!a)
    return !1; const r = e.bitmap, n = { bitmapNumber: r.bitmapNumber, name: r.name, inscriptionId: r.inscriptionId, sat: r.sat ?? null, height: r.height, number: r.number ?? null, address: r.address ?? null, output: r.output ?? null, satpoint: r.satpoint ?? null, timestamp: r.timestamp ?? null, validated: !0, validatedThroughHeight: t, protocolVersion: STORAGE_PROTOCOL_VERSION, storedAt: Date.now() }, i = e.validParcels.map(e => ({ id: e.id, content: e.content, name: e.name, parcelNumber: e.parcelNumber, bitmapNumber: e.bitmapNumber, bitmapInscriptionId: e.bitmapInscriptionId, height: e.height, number: e.number ?? null, fee: e.fee ?? null, output: e.output ?? null, sat: e.sat ?? null, satpoint: e.satpoint ?? null, timestamp: e.timestamp ?? null, charms: Array.isArray(e.charms) ? [...e.charms] : [], validated: !0, validatedThroughHeight: t, protocolVersion: STORAGE_PROTOCOL_VERSION, storedAt: Date.now() })), o = { bitmapNumber: e.bitmapNumber, canonicalBitmapId: r.inscriptionId, transactionCount: e.transactionCount, totalChildren: e.totalChildren, validParcelCount: e.validParcelCount, invalidChildren: Array.isArray(e.invalidChildren) ? e.invalidChildren : [], duplicateClaims: Array.isArray(e.duplicateClaims) ? e.duplicateClaims : [], childrenScannedThroughHeight: t, protocolVersion: STORAGE_PROTOCOL_VERSION, syncedAt: Date.now() }; let s = !1; try {
    s = await new Promise(t => { try {
        const r = a.transaction(["bitmaps", "parcels", "bitmapState"], "readwrite");
        r.objectStore("bitmaps").put(n);
        const s = r.objectStore("parcels"), c = s.index("bitmapNumber").openKeyCursor(IDBKeyRange.only(e.bitmapNumber));
        c.onsuccess = () => { const e = c.result; if (e)
            return s.delete(e.primaryKey), void e.continue(); for (const e of i)
            s.put(e); r.objectStore("bitmapState").put(o); }, c.onerror = () => { try {
            r.abort();
        }
        catch { } }, r.oncomplete = () => t(!0), r.onerror = () => t(!1), r.onabort = () => t(!1);
    }
    catch (e) {
        disableStorage(e), t(!1);
    } });
}
catch {
    s = !1;
} return s && notifyStorageSubscribers({ type: "bitmap-snapshot", bitmapNumber: e.bitmapNumber, validParcelCount: e.validParcelCount, scannedThroughHeight: t }), s; }
async function persistMondrian(e) { if (!(indexedDbAvailable() && e && Array.isArray(e.pattern) && Array.isArray(e.slots)))
    return !1; await initialiseStorage(); let t = null; try {
    t = await getBlockHash(e.bitmapNumber);
}
catch { } return await idbPut("mondrians", { bitmapNumber: e.bitmapNumber, source: e.source, transactionCount: e.transactionCount, pattern: e.pattern.slice(), width: e.width, height: e.height, length: e.length ?? null, slots: e.slots.map(e => ({ ...e })), ...Array.isArray(e.emptySpaces) ? { emptySpaces: e.emptySpaces.map(e => ({ ...e })) } : {}, blockHash: t, protocolVersion: STORAGE_PROTOCOL_VERSION, storedAt: Date.now() }), notifyStorageSubscribers({ type: "mondrian", bitmapNumber: e.bitmapNumber }), !0; }
async function tryAcquireStorageLease(e, t = 12e4) { if (!indexedDbAvailable())
    return { acquired: !0, persistent: !1, owner: storageInstanceId }; await initialiseStorage(); const a = await openStorageDb(); if (!a)
    return { acquired: !0, persistent: !1, owner: storageInstanceId }; try {
    return await new Promise(r => { try {
        const n = a.transaction("meta", "readwrite"), i = n.objectStore("meta"), o = "lease:" + e, s = i.get(o);
        let c = !1, l = null;
        s.onsuccess = () => { const e = s.result, a = Date.now(); l = e?.owner ?? null, (!e || !Number.isFinite(e.expiresAt) || e.expiresAt <= a || e.owner === storageInstanceId) && (c = !0, i.put({ key: o, owner: storageInstanceId, expiresAt: a + t, protocolVersion: STORAGE_PROTOCOL_VERSION })); }, n.oncomplete = () => r({ acquired: c, persistent: !0, owner: c ? storageInstanceId : l }), n.onerror = () => r({ acquired: !0, persistent: !1, owner: storageInstanceId }), n.onabort = () => r({ acquired: !0, persistent: !1, owner: storageInstanceId });
    }
    catch (e) {
        disableStorage(e), r({ acquired: !0, persistent: !1, owner: storageInstanceId });
    } });
}
catch {
    return { acquired: !0, persistent: !1, owner: storageInstanceId };
} }
async function releaseStorageLease(e) { if (!indexedDbAvailable())
    return; const t = await openStorageDb(); t && await new Promise((a, r) => { const n = t.transaction("meta", "readwrite"), i = n.objectStore("meta"), o = "lease:" + e, s = i.get(o); s.onsuccess = () => { s.result?.owner === storageInstanceId && i.delete(o); }, n.oncomplete = () => a(!0), n.onerror = () => r(n.error), n.onabort = () => r(n.error); }); }
async function waitForBitmapLease(e, t, a = 12e4) { const r = Date.now(); for (; Date.now() - r < a;) {
    const a = await storageGetBitmapStateSafe(e);
    if (a && Number.isSafeInteger(a.childrenScannedThroughHeight) && a.childrenScannedThroughHeight >= t)
        return !0;
    const r = await idbGet("meta", "lease:bitmap:" + e);
    if (!r || r.expiresAt <= Date.now())
        return !1;
    await sleep(250);
} return !1; }
function isValidBitmapParsedInscription(e, t) { return validateRawTextClaim(e, t + ".bitmap").valid; }
async function verifyBitmapCandidate(e, t, { forceRefresh: a = !1 } = {}) { if (!t)
    return null; try {
    checkInscriptionId(t);
    const r = await getInscriptionInfo(t, { forceRefresh: a }), n = normaliseHeight(r);
    if (null === n || n < e)
        return null;
    const i = await getParsedInscription(t, n);
    return isValidBitmapParsedInscription(i, e) ? { id: t, height: n, parsed: i, info: r } : null;
}
catch {
    return null;
} }
async function findBitmapInBlocks(e, { forceRefresh: t = !1, startHeight: a = null } = {}) { if (checkBitmapNumber(e), t && foundBitmapCache.delete(e), !t && foundBitmapCache.has(e))
    return foundBitmapCache.get(e); if (!t && bitmapPromiseCache.has(e))
    return await bitmapPromiseCache.get(e); const r = async () => { const r = await getChainHeightCached(); if (e > r)
    return null; const n = t ? null : await storageGetBitmapSearchSafe(e); if (!t && n?.foundInscriptionId) {
    const t = await verifyBitmapCandidate(e, n.foundInscriptionId);
    if (t)
        return foundBitmapCache.set(e, t.parsed), t.parsed;
} let i = Number.isSafeInteger(a) ? Math.max(e, a) : e; !t && n && Number.isSafeInteger(n.scannedThroughHeight) && (i = Math.max(i, n.scannedThroughHeight + 1)); if (i > r)
    return null; for (let t = i; t <= r; t++) {
    const a = await getParsedBlockInscriptionsWithRetry(t);
    for (const r of a)
        if (isValidBitmapParsedInscription(r, e))
            return foundBitmapCache.set(e, r), await persistBitmapSearch(e, t, r.id, t), r;
    (t === r || (t - i + 1) % 250 == 0) && await persistBitmapSearch(e, t);
} return null; }; if (t)
    return await r(); const n = r().finally(() => bitmapPromiseCache.delete(e)); return bitmapPromiseCache.set(e, n), await n; }
export async function getBitmapInscriptionId(e, { forceRefresh: t = !1 } = {}) { if (checkBitmapNumber(e), !t) {
    const t = await storageGetBitmapSafe(e);
    if (!0 === t?.validated && "string" == typeof t.inscriptionId)
        return t.inscriptionId;
} if (e < OLD_OCI_LIMIT) {
    let a = null;
    try {
        a = await indexInscriptionId(e);
    }
    catch { }
    const r = await verifyBitmapCandidate(e, a, { forceRefresh: t });
    if (r)
        return foundBitmapCache.set(e, r.parsed), await persistBitmapSearch(e, r.height, r.id, r.height), r.id;
} const a = await findBitmapInBlocks(e, { forceRefresh: t }); return a?.id || null; }
export async function getBitmapSat(e, { forceRefresh: t = !1 } = {}) { if (checkBitmapNumber(e), !t) {
    const t = await storageGetBitmapSafe(e);
    if (!0 === t?.validated && void 0 !== t.sat && null !== t.sat)
        return t.sat;
} const a = await getBitmapInscriptionId(e, { forceRefresh: t }); if (!a)
    return null; if (e < OLD_OCI_LIMIT)
    try {
        const t = await indexInscriptionId(e);
        if (t === a) {
            const t = await indexSat(e);
            if (null != t)
                return t;
        }
    }
    catch { } const r = await getInscriptionInfo(a, { forceRefresh: t }); return null == r?.sat ? null : r.sat; }
export async function validateBitmap(e, { forceRefresh: t = !1, persist: a = !0, validatedThroughHeight: r = null } = {}) { if (checkBitmapNumber(e), !t) {
    const t = await storageGetBitmapSafe(e);
    if (!0 === t?.validated)
        return storedBitmapToValidation(t);
} const n = await getBitmapInscriptionId(e, { forceRefresh: t }); if (!n)
    return { valid: !1, claimed: !1, canonical: !1, bitmapNumber: e, name: e + ".bitmap", reason: "No canonical Bitmap claim found" }; const i = await getInscriptionInfo(n, { forceRefresh: t }), o = normaliseHeight(i); if (null === o)
    return { valid: !1, claimed: !0, canonical: !0, bitmapNumber: e, inscriptionId: n, reason: "Canonical Bitmap inscription has no valid genesis height" }; if (o < e)
    return { valid: !1, claimed: !0, canonical: !0, bitmapNumber: e, inscriptionId: n, height: o, reason: "Bitmap claim predates its Bitmap block" }; const s = validateRawTextClaim(await getParsedInscription(n, o), e + ".bitmap"); if (!s.valid)
    return { valid: !1, claimed: !0, canonical: !0, bitmapNumber: e, inscriptionId: n, height: o, reason: s.reason }; const c = { valid: !0, claimed: !0, canonical: !0, bitmapNumber: e, name: e + ".bitmap", inscriptionId: n, sat: i?.sat ?? null, height: o, number: i?.number ?? null, address: i?.address ?? null, output: i?.output ?? null, satpoint: i?.satpoint ?? null, timestamp: i?.timestamp ?? null, source: e < 942e3 ? "legacy-oci-or-live-fallback" : "live-block-scan" }; if (a) {
    const e = Number.isSafeInteger(r) ? r : await safeCurrentTip(o);
    await persistBitmapRecord(c, e);
} return c; }
async function getChildrenDetailsFallback(e) { const t = [], a = new Set; for (let r = 0; r < 1e5; r++) {
    const n = 0 === r ? "/r/children/" + e : "/r/children/" + e + "/" + r, i = await fetchJson(n), o = Array.isArray(i?.ids) ? i.ids : [];
    for (const e of o)
        "string" != typeof e || a.has(e) || (a.add(e), t.push(e));
    if (!i?.more)
        break;
    if (99999 === r)
        throw new Error("Child pagination exceeded safety limit");
} return await mapWithConcurrency(t, 8, async (e) => ({ id: e, ...await getInscriptionInfo(e) })); }
async function getChildrenDetails(e, { forceRefresh: t = !1 } = {}) { checkInscriptionId(e); if (!t) {
    const t = getTtl(childrenDetailsCache, e);
    if (void 0 !== t)
        return t;
} const a = e + ":" + (t ? 1 : 0); if (childrenDetailsPromiseCache.has(a))
    return await childrenDetailsPromiseCache.get(a); const r = (async () => { const a = [], r = new Set; for (let n = 0; n < MAX_PAGINATION_PAGES; n++) {
    const i = 0 === n ? "/r/children/" + e + "/inscriptions" : "/r/children/" + e + "/inscriptions/" + n, o = await fetchWithTimeout(i);
    if (404 === o.status && 0 === n) {
        const a = await getChildrenDetailsFallback(e);
        return setTtl(childrenDetailsCache, e, a);
    }
    if (!o.ok)
        throw new Error(i + " returned HTTP " + o.status);
    const s = await o.json(), c = Array.isArray(s?.children) ? s.children : [];
    for (const e of c)
        "string" != typeof e?.id || r.has(e.id) || (r.add(e.id), a.push(e));
    if (!s?.more)
        break;
    if (n === MAX_PAGINATION_PAGES - 1)
        throw new Error("Child pagination exceeded safety limit");
} return setTtl(childrenDetailsCache, e, a); })().finally(() => childrenDetailsPromiseCache.delete(a)); return childrenDetailsPromiseCache.set(a, r), await r; }
async function getParentIds(e) { if (checkInscriptionId(e), parentIdsCache.has(e))
    return parentIdsCache.get(e); const t = [], a = new Set; for (let r = 0; r < 1e5; r++) {
    const n = 0 === r ? "/r/parents/" + e : "/r/parents/" + e + "/" + r, i = await fetchJson(n), o = Array.isArray(i?.ids) ? i.ids : [];
    for (const e of o)
        "string" != typeof e || a.has(e) || (a.add(e), t.push(e));
    if (!i?.more)
        break;
    if (99999 === r)
        throw new Error("Parent pagination exceeded safety limit");
} return parentIdsCache.set(e, t), t; }
function compareInscriptionIdsNumeric(e, t) { return String(e).localeCompare(String(t), void 0, { numeric: !0 }); }
export function compareParcelClaims(e, t) { return e.height !== t.height ? e.height - t.height : compareInscriptionIdsNumeric(e.id, t.id); }
function parcelFromChild(e, t, a) { return { id: e.id, content: t.content, name: t.name, parcelNumber: t.parcelNumber, bitmapNumber: a.bitmapNumber, bitmapInscriptionId: a.bitmapInscriptionId, height: a.height, number: e?.number ?? null, fee: e?.fee ?? null, output: e?.output ?? null, sat: e?.sat ?? null, satpoint: e?.satpoint ?? null, timestamp: e?.timestamp ?? null, charms: Array.isArray(e?.charms) ? [...e.charms] : [] }; }
async function fetchParcelClaimContent(e) { checkInscriptionId(e); const t = getTtl(parcelContentCache, e); if (void 0 !== t)
    return t; const a = await fetchWithTimeout("/content/" + e); if (!a.ok)
    throw new Error("/content/" + e + " returned HTTP " + a.status); return setTtl(parcelContentCache, e, normalizeParcelContent(await a.text())); }
async function getBlockTransactionCount(e) { checkBitmapNumber(e); const t = getTtl(rawTransactionCountCache, e); if (void 0 !== t)
    return t; let a = null; try {
    const t = await getBlockInfo(e), r = t?.transaction_count;
    if (Number.isSafeInteger(r) && r > 0)
        return setTtl(rawTransactionCountCache, e, r);
}
catch (e) {
    a = e;
} try {
    const t = await fetchRecursiveBlockOutputTotals(e);
    if (t.length > 0)
        return setTtl(rawTransactionCountCache, e, t.length);
}
catch (e) {
    a = a || e;
} throw new Error("Unable to determine transaction count for block " + e + (a ? ": " + (a?.message || String(a)) : "")); }
async function classifyNewParcelChildren(e, t, a, r) { const n = [], i = [], o = []; const s = await mapWithConcurrency(a, 8, async (a) => { const s = normaliseHeight(a); if (!a?.id || null === s)
    return { invalid: { id: a?.id || null, reason: "Missing child inscription ID or genesis height" } }; const c = r.get(a.id); if (c && c.protocolVersion === STORAGE_PROTOCOL_VERSION && c.bitmapInscriptionId === e.inscriptionId && c.height === s)
    return !0 === c.valid && c.parcel ? { parcel: c.parcel, cached: !0 } : { invalid: { id: a.id, reason: c.reason || "Invalid Parcel candidate", cached: !0 }, cached: !0 }; let l = null, u = null; try {
    const r = await fetchParcelClaimContent(a.id), n = parseParcelName(r);
    n ? n.bitmapNumber !== e.bitmapNumber ? l = "Parcel references a different Bitmap" : 0 !== e.bitmapNumber && null !== t && n.parcelNumber >= t ? l = "Parcel number is outside the Bitmap block transaction count" : s < e.height ? l = "Parcel predates the canonical Bitmap" : u = parcelFromChild(a, n, { bitmapNumber: e.bitmapNumber, bitmapInscriptionId: e.inscriptionId, height: s }) : l = "Invalid Parcel claim";
}
catch (e) {
    l = "Parcel content unavailable: " + (e?.message || String(e));
} const d = { bitmapNumber: e.bitmapNumber, id: a.id, bitmapInscriptionId: e.inscriptionId, height: s, valid: Boolean(u), parcel: u, reason: l, protocolVersion: STORAGE_PROTOCOL_VERSION, storedAt: Date.now() }; return { parcel: u, invalid: u ? null : { id: a.id, reason: l }, record: d, cached: !1 }; }); for (const e of s)
    e.record && o.push(e.record), e.parcel ? n.push(e.parcel) : e.invalid && i.push(e.invalid); return { valid: n, invalid: i, recordsToPersist: o }; }
async function storedStateIsCurrent(e, t) { return Boolean(e && e.protocolVersion === STORAGE_PROTOCOL_VERSION && Number.isSafeInteger(t) && Number.isSafeInteger(e.childrenScannedThroughHeight) && e.childrenScannedThroughHeight >= t); }
export async function getBitmapParcels(e, { forceRefresh: t = !1, requireCurrent: a = !0, includeInvalid: r = !0, includeDuplicates: n = !0, persist: i = !0, validatedThroughHeight: o = null } = {}) { if (checkBitmapNumber(e), !t) {
    const [t, i, o] = await Promise.all([storageGetBitmapStateSafe(e), storageGetBitmapParcelsSafe(e), storageGetBitmapSafe(e)]);
    if (t?.canonicalBitmapId && o?.validated && Number.isSafeInteger(t.transactionCount)) {
        const s = a ? await getChainHeightCached() : null;
        if (!a || await storedStateIsCurrent(t, s))
            return filterParcelState(parcelStateFromStored(e, storedBitmapToValidation(o), t, i), { includeInvalid: r, includeDuplicates: n });
    }
    const s = getTtl(parcelStateCache, e);
    if (void 0 !== s && !a)
        return filterParcelState(s, { includeInvalid: r, includeDuplicates: n });
} const s = await validateBitmap(e, { forceRefresh: !1, persist: i, validatedThroughHeight: o }); if (!s.valid)
    return filterParcelState({ valid: !1, bitmapNumber: e, bitmap: s, transactionCount: null, totalChildren: 0, validParcelCount: 0, unclaimedParcelCount: 0, validParcels: [], invalidChildren: [], duplicateClaims: [], reason: "Canonical Bitmap is not valid" }, { includeInvalid: r, includeDuplicates: n }); const c = await getBlockTransactionCount(e), l = await getChildrenDetails(s.inscriptionId, { forceRefresh: t }), u = await storageGetParcelClaimsSafe(e), d = new Map(u.map(e => [e.id, e])), p = await classifyNewParcelChildren(s, c, l, d); i && p.recordsToPersist.length && await idbPutMany("parcelClaims", p.recordsToPersist); const m = new Map, h = []; for (const e of p.valid) {
    const t = m.get(e.parcelNumber);
    if (!t) {
        m.set(e.parcelNumber, e);
        continue;
    }
    const a = compareParcelClaims(e, t) < 0, r = a ? e : t, n = a ? t : e;
    h.push({ parcelNumber: e.parcelNumber, winnerId: r.id, loserId: n.id, reason: r.height < n.height ? "lower-genesis-height" : "lower-inscription-id" }), a && m.set(e.parcelNumber, e);
} const b = [...m.values()].sort((e, t) => e.parcelNumber - t.parcelNumber), g = { valid: !0, bitmapNumber: e, bitmap: s, transactionCount: c, totalChildren: l.length, validParcelCount: b.length, unclaimedParcelCount: Math.max(0, c - b.length), validParcels: b, invalidChildren: p.invalid, duplicateClaims: h, cachedChildCount: l.length - p.recordsToPersist.length, newlyParsedChildCount: p.recordsToPersist.length, stored: !1 }; if (setTtl(parcelStateCache, e, g), i) {
    const e = Number.isSafeInteger(o) ? o : await safeCurrentTip(s.height);
    await persistParcelState(g, e);
} return filterParcelState(g, { includeInvalid: r, includeDuplicates: n }); }
function filterParcelState(e, t) { const a = { ...e }; return t.includeInvalid || delete a.invalidChildren, t.includeDuplicates || delete a.duplicateClaims, a; }
export async function getParcelInscriptionId(e, t, a = {}) { checkParcelNumber(e), checkBitmapNumber(t); const r = await storageGetParcelSafe(e, t); if (r?.validated && !0 !== a.forceRefresh)
    return r.id; const n = await getBitmapParcels(t, { ...a, requireCurrent: !0, includeInvalid: !1, includeDuplicates: !1 }); return !n.valid || 0 !== t && e >= n.transactionCount ? null : n.validParcels.find(t => t.parcelNumber === e)?.id || null; }
export async function validateParcel(e, t, a = {}) { checkParcelNumber(e), checkBitmapNumber(t); const r = await storageGetParcelSafe(e, t); if (r?.validated && !0 !== a.forceRefresh) {
    const e = await storageGetBitmapStateSafe(t);
    return { valid: !0, exists: !0, claimed: !0, canonical: !0, transactionCount: e?.transactionCount ?? null, ...storedParcelToValidation(r) };
} const n = await getBitmapParcels(t, { ...a, requireCurrent: !0, includeInvalid: !1, includeDuplicates: !1 }); if (!n.valid)
    return { valid: !1, exists: !1, claimed: !1, canonical: !1, parcelNumber: e, bitmapNumber: t, name: e + "." + t + ".bitmap", reason: n.reason || "Canonical Bitmap is not valid" }; if (0 !== t && e >= n.transactionCount)
    return { valid: !1, exists: !1, claimed: !1, canonical: !1, parcelNumber: e, bitmapNumber: t, name: e + "." + t + ".bitmap", transactionCount: n.transactionCount, reason: "Parcel does not exist: transaction index is outside the Bitmap block" }; const i = n.validParcels.find(t => t.parcelNumber === e); return i ? { valid: !0, exists: !0, claimed: !0, canonical: !0, transactionCount: n.transactionCount, ...i } : { valid: !0, exists: !0, claimed: !1, canonical: !1, parcelNumber: e, bitmapNumber: t, name: e + "." + t + ".bitmap", transactionCount: n.transactionCount, bitmapInscriptionId: n.bitmap.inscriptionId, reason: "Parcel exists but has not been validly claimed" }; }
export async function validateParcelInscription(e, { forceRefresh: t = !1, persist: a = !0, validatedThroughHeight: r = null } = {}) { if (checkInscriptionId(e), !t) {
    const t = await storageGetParcelByInscriptionSafe(e);
    if (t?.validated && t.protocolVersion === STORAGE_PROTOCOL_VERSION)
        return { valid: !0, claimValid: !0, provenanceValid: !0, canonical: !0, inscriptionId: t.id, ...storedParcelToValidation(t) };
} const n = await getInscriptionInfo(e, { forceRefresh: t }), i = normaliseHeight(n); if (null === i)
    return { valid: !1, claimValid: !1, provenanceValid: !1, canonical: !1, inscriptionId: e, reason: "Inscription has no valid genesis height" }; let o; try {
    o = await fetchParcelClaimContent(e);
}
catch (t) {
    return { valid: !1, claimValid: !1, provenanceValid: !1, canonical: !1, inscriptionId: e, reason: "Parcel content unavailable: " + (t?.message || String(t)) };
} const s = parseParcelName(o); if (!s)
    return { valid: !1, claimValid: !1, provenanceValid: !1, canonical: !1, inscriptionId: e, reason: "Inscription content is not a valid Parcel claim" }; const c = await validateBitmap(s.bitmapNumber, { forceRefresh: !1, persist: a, validatedThroughHeight: r }); if (!c.valid)
    return { valid: !1, claimValid: !0, provenanceValid: !1, canonical: !1, inscriptionId: e, parcelNumber: s.parcelNumber, bitmapNumber: s.bitmapNumber, content: o, reason: "Referenced Bitmap is not valid/canonical" }; if (i < c.height)
    return { valid: !1, claimValid: !0, provenanceValid: !1, canonical: !1, inscriptionId: e, parcelNumber: s.parcelNumber, bitmapNumber: s.bitmapNumber, content: o, reason: "Parcel predates the canonical Bitmap" }; const l = await getBlockTransactionCount(s.bitmapNumber); if (0 !== s.bitmapNumber && s.parcelNumber >= l)
    return { valid: !1, claimValid: !0, provenanceValid: !1, canonical: !1, inscriptionId: e, parcelNumber: s.parcelNumber, bitmapNumber: s.bitmapNumber, content: o, transactionCount: l, reason: "Parcel number is outside the Bitmap block transaction count" }; if (!(await getParentIds(e)).includes(c.inscriptionId))
    return { valid: !1, claimValid: !0, provenanceValid: !1, canonical: !1, inscriptionId: e, parcelNumber: s.parcelNumber, bitmapNumber: s.bitmapNumber, content: o, bitmapInscriptionId: c.inscriptionId, reason: "Parcel is not a direct child of the canonical Bitmap inscription" }; const u = await getParcelInscriptionId(s.parcelNumber, s.bitmapNumber, { forceRefresh: t, persist: a, validatedThroughHeight: r }); if (u !== e)
    return { valid: !1, claimValid: !0, provenanceValid: !0, canonical: !1, inscriptionId: e, canonicalInscriptionId: u, parcelNumber: s.parcelNumber, bitmapNumber: s.bitmapNumber, content: o, bitmapInscriptionId: c.inscriptionId, height: i, reason: u ? "Valid Parcel claim but it lost the Parcel tie-break" : "Parcel claim was not selected as canonical" }; const d = { valid: !0, claimValid: !0, provenanceValid: !0, canonical: !0, inscriptionId: e, id: e, parcelNumber: s.parcelNumber, bitmapNumber: s.bitmapNumber, content: o, name: s.parcelNumber + "." + s.bitmapNumber + ".bitmap", bitmapInscriptionId: c.inscriptionId, transactionCount: l, height: i, number: n?.number ?? null, address: n?.address ?? null, output: n?.output ?? null, sat: n?.sat ?? null, satpoint: n?.satpoint ?? null, timestamp: n?.timestamp ?? null }; if (a) {
    const e = Number.isSafeInteger(r) ? r : await safeCurrentTip(i);
    await persistCanonicalParcel(d, e);
} return d; }
async function loadMondrianModule() { if (mondrianModulePromise)
    return await mondrianModulePromise; mondrianModulePromise = import("/content/" + MONDRIAN_MODULE_ID); try {
    return await mondrianModulePromise;
}
catch (e) {
    throw mondrianModulePromise = null, e;
} }
function validateMondrianPattern(e, t) { return Array.isArray(e) && 0 !== e.length ? e.map((e, a) => { const r = Number(e); if (!Number.isSafeInteger(r) || r < 1 || r > 9)
    throw new Error("Invalid Mondrian square size at transaction " + a + " for block " + t); return r; }) : null; }
function patternFromTransactions(e, t, a) { if (!Array.isArray(e))
    return null; if ("function" != typeof a?.getSquareSize)
    throw new Error("Mondrian module does not export getSquareSize()"); return validateMondrianPattern(e.map((e, r) => { const n = Array.isArray(e?.output) ? e.output : Array.isArray(e?.out) ? e.out : Array.isArray(e?.outputs) ? e.outputs : null; if (!n)
    throw new Error("Transaction " + r + " in block " + t + " returned no output array"); let i = 0; for (const e of n) {
    const a = Number(e?.value);
    if (!Number.isSafeInteger(a) || a < 0)
        throw new Error("Transaction " + r + " in block " + t + " has invalid output value");
    if (i += a, !Number.isSafeInteger(i))
        throw new Error("Transaction " + r + " in block " + t + " exceeds safe-integer range");
} return a.getSquareSize(i); }), t); }
function rawBlockHexToBytes(e, t) { if ("string" != typeof e || e.length < 162 || e.length % 2 != 0 || !/^[0-9a-f]+$/i.test(e))
    throw new Error("/r/block/" + t + " returned invalid block hex"); const a = new Uint8Array(e.length / 2); for (let t = 0; t < a.length; t++)
    a[t] = Number.parseInt(e.slice(2 * t, 2 * t + 2), 16); return a; }
function readCompactSize(e, t, a) { if (t.offset >= e.length)
    throw new Error("Truncated " + a); const r = e[t.offset++]; if (r < 253)
    return r; let n = 0; if (253 === r) {
    if (t.offset + 2 > e.length)
        throw new Error("Truncated " + a);
    n = e[t.offset] + 256 * e[t.offset + 1], t.offset += 2;
}
else if (254 === r) {
    if (t.offset + 4 > e.length)
        throw new Error("Truncated " + a);
    n = e[t.offset] + 256 * e[t.offset + 1] + 65536 * e[t.offset + 2] + 16777216 * e[t.offset + 3], t.offset += 4;
}
else {
    if (t.offset + 8 > e.length)
        throw new Error("Truncated " + a);
    let r = 0n;
    for (let a = 0; a < 8; a++)
        r += BigInt(e[t.offset + a]) << (8n * BigInt(a));
    t.offset += 8;
    if (r > BigInt(Number.MAX_SAFE_INTEGER))
        throw new Error(a + " exceeds safe integer range");
    n = Number(r);
} if (!Number.isSafeInteger(n) || n < 0)
    throw new Error("Invalid " + a); return n; }
function skipRawBytes(e, t, a, r) { if (!Number.isSafeInteger(a) || a < 0 || t.offset + a > e.length)
    throw new Error("Truncated " + r); t.offset += a; }
function readUInt64LE(e, t, a) { if (t.offset + 8 > e.length)
    throw new Error("Truncated " + a); let r = 0n; for (let a = 0; a < 8; a++)
    r += BigInt(e[t.offset + a]) << (8n * BigInt(a)); t.offset += 8; if (r > BigInt(Number.MAX_SAFE_INTEGER))
    throw new Error(a + " exceeds safe integer range"); return Number(r); }
function parseRawBlockOutputTotals(e, t) { const a = rawBlockHexToBytes(e, t), r = { offset: 80 }, n = readCompactSize(a, r, "block transaction count"); if (n < 1)
    throw new Error("Block " + t + " has no transactions"); const i = new Array(n); for (let e = 0; e < n; e++) {
    skipRawBytes(a, r, 4, "transaction version");
    let t = !1;
    if (r.offset + 2 <= a.length && 0 === a[r.offset] && 0 !== a[r.offset + 1]) {
        t = !0, r.offset += 2;
    }
    const n = readCompactSize(a, r, "transaction input count");
    if (n < 1)
        throw new Error("Transaction " + e + " has no inputs");
    for (let e = 0; e < n; e++) {
        skipRawBytes(a, r, 36, "transaction input outpoint");
        const e = readCompactSize(a, r, "input script length");
        skipRawBytes(a, r, e, "input script");
        skipRawBytes(a, r, 4, "input sequence");
    }
    const o = readCompactSize(a, r, "transaction output count");
    let s = 0;
    for (let t = 0; t < o; t++) {
        const t = readUInt64LE(a, r, "transaction output value");
        if (s += t, !Number.isSafeInteger(s))
            throw new Error("Transaction " + e + " output total exceeds safe integer range");
        const n = readCompactSize(a, r, "output script length");
        skipRawBytes(a, r, n, "output script");
    }
    if (t)
        for (let e = 0; e < n; e++) {
            const e = readCompactSize(a, r, "witness item count");
            for (let t = 0; t < e; t++) {
                const e = readCompactSize(a, r, "witness item length");
                skipRawBytes(a, r, e, "witness item");
            }
        }
    skipRawBytes(a, r, 4, "transaction locktime"), i[e] = s;
} if (r.offset !== a.length)
    throw new Error("Raw block parser ended at byte " + r.offset + " of " + a.length + " for block " + t); return i; }
async function fetchRecursiveBlockOutputTotals(e) { checkBitmapNumber(e); const t = await fetchWithTimeout("/r/block/" + e); if (!t.ok)
    throw new Error("/r/block/" + e + " returned HTTP " + t.status); const a = await t.json(); return parseRawBlockOutputTotals(a, e); }
async function fetchLiveMondrianPattern(e, t) { if ("function" != typeof t?.getSquareSize)
    throw new Error("Mondrian module does not export getSquareSize()"); const a = await fetchRecursiveBlockOutputTotals(e), r = await getBlockTransactionCount(e); if (a.length !== r)
    throw new Error("Mondrian transaction count mismatch for block " + e + ": raw-block=" + a.length + ", blockinfo=" + r); const n = validateMondrianPattern(a.map(e => t.getSquareSize(e)), e); return { pattern: n, source: "recursive-raw-block" }; }
async function resolveBitmapPattern(e, { forceLive: t = !1, allowLiveFallback: a = !0 } = {}) { checkBitmapNumber(e); const r = await storageGetMondrianSafe(e); if (!t && Array.isArray(r?.pattern) && r.pattern.length > 0)
    return { pattern: validateMondrianPattern(r.pattern, e), source: "indexeddb", mondrianModule: await loadMondrianModule() }; const n = await loadMondrianModule(); if (!t && "function" == typeof n?.getPatternArray) {
    const t = validateMondrianPattern(n.getPatternArray(e), e);
    if (t) {
        const a = await getBlockTransactionCount(e);
        if (t.length !== a)
            throw new Error("Indexed Mondrian transaction count mismatch for block " + e + ": pattern=" + t.length + ", blockinfo=" + a);
        return { pattern: t, source: "on-chain-pattern-index", mondrianModule: n };
    }
} if (!a)
    throw new Error("No indexed Mondrian pattern is available for block " + e); return { ...await fetchLiveMondrianPattern(e, n), mondrianModule: n }; }
export async function getBitmapPattern(e, t = {}) { return (await resolveBitmapPattern(e, t)).pattern.slice(); }
export async function getBitmapMondrian(e, { includeEmptySpaces: t = !1, includeClaims: a = !1, forceRefresh: r = !1, forceLive: n = !1, allowLiveFallback: i = !0, persist: o = !0 } = {}) { checkBitmapNumber(e); const s = [e, t ? 1 : 0, a ? 1 : 0, n ? 1 : 0, i ? 1 : 0].join(":"); if (!a && !r) {
    const t = await storageGetMondrianSafe(e);
    if (t?.slots)
        return storedMondrianToPublic(t);
    if (mondrianCache.has(s))
        return mondrianCache.get(s);
} const { pattern: c, source: l, mondrianModule: u } = await resolveBitmapPattern(e, { forceLive: n, allowLiveFallback: i }); if ("function" != typeof u?.MondrianLayout)
    throw new Error("Mondrian module does not export MondrianLayout"); const d = new u.MondrianLayout(c), p = "function" == typeof d.getSize ? d.getSize() : { width: d.width, height: d.height }; if (!Number.isFinite(p?.width) || !Number.isFinite(p?.height) || !Array.isArray(d?.slots))
    throw new Error("Mondrian module returned an invalid layout"); let m = null, h = null; if (a && (h = await validateBitmap(e, { forceRefresh: !1, persist: o }), m = new Map, h.valid)) {
    const t = await getBitmapParcels(e, { forceRefresh: r, requireCurrent: !0, persist: o });
    for (const e of t.validParcels || [])
        m.set(e.parcelNumber, e);
} const b = d.slots.map((t, r) => { const n = m?.get(r) || null; return { parcelNumber: r, name: r + "." + e + ".bitmap", x: t.position.x, y: t.position.y, size: t.size, ...a ? { claimed: Boolean(n), inscriptionId: n?.id ?? null } : {} }; }), g = t ? d.fillEmptySpaces(!0).map(e => ({ x: e.position.x, y: e.position.y, size: e.size })) : void 0, f = { bitmapNumber: e, source: l, transactionCount: c.length, pattern: c.slice(), width: p.width, height: p.height, length: Number.isFinite(d.length) ? d.length : null, slots: b, ...t ? { emptySpaces: g } : {}, ...a ? { bitmapClaimed: Boolean(h?.valid), bitmapInscriptionId: h?.inscriptionId ?? null } : {} }; return o && !a && await persistMondrian(f), a || mondrianCache.set(s, f), f; }
function treeNodeFromInfo(e, t, a = null) { return { id: e, depth: a, height: normaliseHeight(t), number: t?.number ?? null, sat: t?.sat ?? null, address: t?.address ?? null, output: t?.output ?? null, satpoint: t?.satpoint ?? null, timestamp: t?.timestamp ?? null, charms: Array.isArray(t?.charms) ? [...t.charms] : [] }; }
function buildNestedTree(e, t, a) { const r = new Map(t.map(e => [e.id, e])), n = new Map, i = new Map; for (const e of a)
    "parent-child" === e.type && (n.has(e.from) || n.set(e.from, []), n.get(e.from).push(e.to), i.set(e.to, (i.get(e.to) || 0) + 1)); const o = new Set; return function t(a, s = new Set) { const c = r.get(a) || { id: a }; if (s.has(a))
    return { id: a, cycle: !0, children: [] }; const l = (i.get(a) || 0) > 1; if (a !== e && o.has(a))
    return { ...c, shared: l, reference: !0, children: [] }; o.add(a); const u = new Set(s); return u.add(a), { ...c, shared: l, reference: !1, children: (n.get(a) || []).map(e => t(e, u)) }; }(e); }
export async function getChildrenTree(e, { maxDepth: t = 4, maxNodes: a = 1e3, concurrency: r = 4, forceRefresh: n = !1, persist: i = !0, requireCurrent: o = !0 } = {}) { if (checkInscriptionId(e), !Number.isSafeInteger(t) || t < 0 || t > 32)
    throw new TypeError("maxDepth must be 0..32"); if (!Number.isSafeInteger(a) || a < 1 || a > 1e5)
    throw new TypeError("maxNodes must be 1..100000"); const s = o ? await getChainHeightCached() : null; if (!n) {
    const r = await storageGetChildTreeSafe(e);
    if (r && r.maxDepth >= t && r.maxNodes >= a && (!o || r.syncedThroughHeight >= s))
        return { ...r, source: "indexeddb" };
} const c = await getInscriptionInfo(e, { forceRefresh: n }), l = new Map([[e, treeNodeFromInfo(e, c, 0)]]), u = []; let d = [e], p = !1, m = !1, h = 0; for (let e = 0; e < t && d.length; e++) {
    const t = await mapWithConcurrency(d, r, async (e) => ({ parentId: e, children: await getChildrenDetails(e, { forceRefresh: n }) })), i = [];
    for (const r of t)
        for (const t of r.children)
            t?.id && (u.push({ type: "parent-child", from: r.parentId, to: t.id }), l.has(t.id) || (l.size >= a ? (m = !0, h++) : (l.set(t.id, treeNodeFromInfo(t.id, t, e + 1)), i.push(t.id))));
    d = i;
} d.length && (p = !0); const b = [...l.values()], g = Number.isSafeInteger(s) ? s : await safeCurrentTip(normaliseHeight(c) || 0), f = { rootId: e, maxDepth: t, maxNodes: a, nodeCount: b.length, edgeCount: u.length, truncated: p || m, truncatedByDepth: p, truncatedByMaxNodes: m, omittedNodeCount: h, syncedThroughHeight: g, nodes: b, edges: u, tree: buildNestedTree(e, b, u), source: "live" }; return i && (await idbPut("childTrees", { ...f, protocolVersion: STORAGE_PROTOCOL_VERSION, storedAt: Date.now() }), notifyStorageSubscribers({ type: "children-tree", rootId: e, nodeCount: b.length, edgeCount: u.length, syncedThroughHeight: g })), f; }
async function getSatInscriptionIds(e, { maxPages: t = 1e4 } = {}) { if (!Number.isSafeInteger(e) || e < 0)
    throw new TypeError("sat must be a non-negative safe integer"); const a = [], r = new Set; for (let n = 0; n < t; n++) {
    const i = 0 === n ? "/r/sat/" + e : "/r/sat/" + e + "/" + n, o = await fetchWithTimeout(i);
    if (404 === o.status)
        return { supported: !1, sat: e, ids: [], reason: "/r/sat is unavailable. This ord server may not have the sat index enabled." };
    if (!o.ok)
        throw new Error(i + " returned HTTP " + o.status);
    const s = await o.json(), c = Array.isArray(s?.ids) ? s.ids : [];
    for (const e of c)
        "string" != typeof e || r.has(e) || (r.add(e), a.push(e));
    if (!s?.more)
        break;
    if (n === t - 1)
        throw new Error("Sat pagination exceeded maxPages");
} return { supported: !0, sat: e, ids: a }; }
export async function getReinscriptionChain(e, { forceRefresh: t = !1, persist: a = !0, requireCurrent: r = !0, concurrency: n = 6, maxPages: i = 1e4 } = {}) { checkInscriptionId(e); const o = await getInscriptionInfo(e, { forceRefresh: t }), s = o?.sat; if (!Number.isSafeInteger(s))
    return { supported: !1, inscriptionId: e, sat: null, reason: "The inscription has no indexed sat value." }; const c = r ? await getChainHeightCached() : null; if (!t) {
    const t = await storageGetSatChainSafe(s);
    if (t && (!r || t.syncedThroughHeight >= c))
        return { ...t, targetInscriptionId: e, targetIndex: t.ids.indexOf(e), source: "indexeddb" };
} const l = await getSatInscriptionIds(s, { maxPages: i }); if (!0 !== l.supported)
    return { ...l, inscriptionId: e }; const u = await mapWithConcurrency(l.ids, n, async (e) => { try {
    return await getInscriptionInfo(e, { forceRefresh: t });
}
catch (t) {
    return { id: e, error: t?.message || String(t) };
} }), d = l.ids.map((t, a) => { const r = u[a]; return { index: a, id: t, sat: s, original: 0 === a, reinscription: a > 0, target: t === e, height: normaliseHeight(r), number: r?.number ?? null, address: r?.address ?? null, output: r?.output ?? null, satpoint: r?.satpoint ?? null, timestamp: r?.timestamp ?? null, charms: Array.isArray(r?.charms) ? [...r.charms] : [], error: r?.error ?? null }; }), p = []; for (let e = 1; e < l.ids.length; e++)
    p.push({ type: "reinscription", sat: s, from: l.ids[e - 1], to: l.ids[e], fromIndex: e - 1, toIndex: e }); const m = Number.isSafeInteger(c) ? c : await safeCurrentTip(normaliseHeight(o) || 0), h = { supported: !0, sat: s, ids: l.ids, inscriptionCount: l.ids.length, originalId: l.ids[0] ?? null, latestId: l.ids[l.ids.length - 1] ?? null, targetInscriptionId: e, targetIndex: l.ids.indexOf(e), hasReinscriptions: l.ids.length > 1, reinscriptionCount: Math.max(0, l.ids.length - 1), inscriptions: d, edges: p, syncedThroughHeight: m, source: "live" }; return a && (await idbPut("satChains", { ...h, protocolVersion: STORAGE_PROTOCOL_VERSION, storedAt: Date.now() }), notifyStorageSubscribers({ type: "reinscription-chain", sat: s, inscriptionCount: h.inscriptions.length, syncedThroughHeight: m })), h; }
export async function getBitmapTree(e, { maxDepth: t = 4, maxNodes: a = 1e3, forceRefresh: r = !1, persist: n = !0, includeReinscriptions: i = "root", reinscriptionConcurrency: o = 4, maxReinscriptionTargets: s = 250 } = {}) { checkBitmapNumber(e); const c = await validateBitmap(e, { forceRefresh: r, persist: n }); if (!c.valid)
    return { valid: !1, bitmapNumber: e, reason: c.reason || "Bitmap is not valid" }; const [l, u] = await Promise.all([getChildrenTree(c.inscriptionId, { maxDepth: t, maxNodes: a, forceRefresh: r, persist: n }), getBitmapParcels(e, { forceRefresh: r, requireCurrent: !0, persist: n })]), d = new Map(u.validParcels.map(e => [e.id, e])), p = l.nodes.map(t => { if (t.id === c.inscriptionId)
    return { ...t, role: "bitmap", canonical: !0, bitmapNumber: e }; const a = d.get(t.id); return a ? { ...t, role: "parcel", canonical: !0, parcelNumber: a.parcelNumber, bitmapNumber: e } : { ...t, role: "child", canonical: null }; }); let m = []; if ("root" === i)
    m = [c.inscriptionId];
else if ("root-and-parcels" === i)
    m = [c.inscriptionId, ...u.validParcels.map(e => e.id)];
else if ("all" === i)
    m = p.slice(0, s).map(e => e.id);
else if (!1 !== i)
    throw new TypeError('includeReinscriptions must be false, "root", "root-and-parcels", or "all"'); m = [...new Set(m)]; const R = m.length > s; m = m.slice(0, s); const h = await mapWithConcurrency(m, o, async (e) => { try {
    return await getReinscriptionChain(e, { forceRefresh: r, persist: n });
}
catch (t) {
    return { supported: !1, inscriptionId: e, reason: t?.message || String(t) };
} }), b = {}; for (let e = 0; e < m.length; e++)
    b[m[e]] = h[e]; return { valid: !0, bitmapNumber: e, bitmap: c, parcels: { transactionCount: u.transactionCount, canonicalCount: u.validParcels.length, canonical: u.validParcels, duplicateClaims: u.duplicateClaims ?? [], cachedChildCount: u.cachedChildCount ?? null, newlyParsedChildCount: u.newlyParsedChildCount ?? null }, provenance: { ...l, nodes: p }, reinscriptions: b, stats: { provenanceNodes: p.length, provenanceEdges: l.edges.length, canonicalParcels: u.validParcels.length, reinscriptionTargets: m.length, reinscriptionsTruncated: R, truncated: l.truncated, truncatedByDepth: l.truncatedByDepth, truncatedByMaxNodes: l.truncatedByMaxNodes } }; }
async function readStoredBitmapData(e, { includeMondrian: t = !0, tipHeight: a = null } = {}) { const [r, n, i, o] = await Promise.all([storageGetBitmapSafe(e), storageGetBitmapStateSafe(e), storageGetBitmapParcelsSafe(e), t ? storageGetMondrianSafe(e) : Promise.resolve(null)]); if (!r)
    return { valid: !1, bitmapNumber: e, bitmap: null, parcels: [], state: n, mondrian: null, current: !1, source: "indexeddb", reason: "Bitmap is not present in the local Bitmap SDK index" }; const s = !!Number.isSafeInteger(a) && await storedStateIsCurrent(n, a); return { valid: !0, bitmapNumber: e, bitmap: storedBitmapToValidation(r), parcels: i.map(storedParcelToValidation), state: n, mondrian: o ? storedMondrianToPublic(o) : null, current: s, source: "indexeddb" }; }
export async function syncBitmap(e, { includeMondrian: t = !0, includeTree: a = !1, treeOptions: r = {}, forceRefresh: n = !0, targetHeight: i = null, useLease: o = !0 } = {}) { checkBitmapNumber(e), await initialiseStorage(); const s = Number.isSafeInteger(i) ? i : await getChainHeightCached(), c = await storageGetBitmapStateSafe(e); if (!n && await storedStateIsCurrent(c, s))
    return await readStoredBitmapData(e, { includeMondrian: t, tipHeight: s }); const l = "bitmap:" + e; let u = { acquired: !0, persistent: !1 }; if (o && indexedDbAvailable())
    for (; u = await tryAcquireStorageLease(l), !u.acquired;)
        if (await waitForBitmapLease(e, s))
            return await readStoredBitmapData(e, { includeMondrian: t, tipHeight: s }); try {
    const n = await validateBitmap(e, { forceRefresh: !1, persist: !1, validatedThroughHeight: s });
    if (!n.valid)
        return { valid: !1, bitmapNumber: e, bitmap: n, reason: n.reason, source: "live" };
    const i = await getBitmapParcels(e, { forceRefresh: !0, requireCurrent: !1, includeInvalid: !0, includeDuplicates: !0, persist: !1, validatedThroughHeight: s });
    await persistParcelState(i, s);
    let o = null;
    t && (o = await getBitmapMondrian(e, { includeClaims: !1, forceRefresh: !1, persist: !1 }), await persistMondrian(o));
    let c = null;
    return a && (c = await getBitmapTree(e, { ...r, forceRefresh: !1, persist: !0 })), notifyStorageSubscribers({ type: "bitmap-sync", bitmapNumber: e, scannedThroughHeight: s }), { valid: !0, bitmapNumber: e, bitmap: n, parcels: i.validParcels, parcelState: i, mondrian: o, tree: c, scannedThroughHeight: s, source: "live-sync" };
}
finally {
    o && u.acquired && await releaseStorageLease(l).catch(() => { });
} }
export async function getBitmapData(e, { refresh: t = "if-stale", includeMondrian: a = !0 } = {}) { if (checkBitmapNumber(e), !0 !== t && !1 !== t && "if-stale" !== t)
    throw new TypeError('refresh must be true, false, or "if-stale"'); if (await initialiseStorage(), !1 === t)
    return await readStoredBitmapData(e, { includeMondrian: a, tipHeight: null }); const r = await getChainHeightCached(), n = await readStoredBitmapData(e, { includeMondrian: a, tipHeight: r }); return "if-stale" === t && n.current ? n : await syncBitmap(e, { includeMondrian: a, forceRefresh: !0, targetHeight: r }); }
export async function getParcelData(e, t, { refresh: a = "if-stale" } = {}) { checkParcelNumber(e), checkBitmapNumber(t); const r = await getBitmapData(t, { refresh: a, includeMondrian: !1 }); if (!r || !1 === r.valid || !r.bitmap)
    return { valid: !1, exists: !1, claimed: !1, canonical: !1, parcelNumber: e, bitmapNumber: t, reason: r?.reason || "Bitmap data is unavailable" }; const n = r.state?.transactionCount ?? r.parcelState?.transactionCount ?? null; if (0 !== t && Number.isSafeInteger(n) && e >= n)
    return { valid: !1, exists: !1, claimed: !1, canonical: !1, parcelNumber: e, bitmapNumber: t, transactionCount: n, reason: "Parcel does not exist: transaction index is outside the Bitmap block" }; const i = r.parcels?.find(t => t.parcelNumber === e); return i ? { valid: !0, exists: !0, claimed: !0, canonical: !0, transactionCount: n, current: r.current ?? !1, ...i } : { valid: !0, exists: !0, claimed: !1, canonical: !1, parcelNumber: e, bitmapNumber: t, name: e + "." + t + ".bitmap", transactionCount: n, bitmapInscriptionId: r.bitmap.inscriptionId, current: r.current ?? !1, reason: "Parcel exists but has not been validly claimed" }; }
function strictClaimText(e) { return !e || !0 !== e.complete || hasContentEncoding(e) || hasDelegate(e) ? null : decodeBodyHex(e.bodyHex); }
async function advanceStoredParcelWatermarks(e, t) { if (!indexedDbAvailable())
    return !1; await initialiseStorage(); const a = await openStorageDb(); if (!a)
    return !1; try {
    return await new Promise(r => { try {
        const n = a.transaction("bitmapState", "readwrite"), i = n.objectStore("bitmapState").openCursor();
        i.onsuccess = () => { const a = i.result; if (!a)
            return; const r = a.value, o = r.childrenScannedThroughHeight ?? -1; o >= t - 1 && o < e && (r.childrenScannedThroughHeight = e, r.syncedAt = Date.now(), a.update(r)), a.continue(); }, n.oncomplete = () => r(!0), n.onerror = () => r(!1), n.onabort = () => r(!1);
    }
    catch (e) {
        disableStorage(e), r(!1);
    } });
}
catch {
    return !1;
} }
async function persistProcessedBlock(e, t, a) { await idbPut("blockHashes", { height: e, hash: t, protocolVersion: STORAGE_PROTOCOL_VERSION, storedAt: Date.now() }), await Promise.all([setMetaValue("watch:lastProcessedHeight", e), setMetaValue("watch:lastProcessedHash", t), setMetaValue("watch:coverageStartHeight", a)]); }
async function scanBlockInternal(e, { validate: t = !0, includeNonCanonical: a = !1, validationConcurrency: r = 4, persist: n = !0, continuous: i = !1, coverageStartHeight: o = null, resolveEncodedParcelCandidates: v = !1 } = {}) { checkBitmapNumber(e); const [s, c] = await Promise.all([getBlockHashWithRetry(e), getParsedBlockInscriptionsWithRetry(e)]), l = [], u = [], k = []; await mapWithConcurrency(c, r, async (t) => { const a = strictClaimText(t), r = parseBitmapName(a); if (r)
    return void l.push({ id: t.id, height: e, content: a, bitmapNumber: r.bitmapNumber, eligibleHeight: r.bitmapNumber <= e }); let n = parseParcelName(a); if (!n && (hasContentEncoding(t) || hasDelegate(t))) {
    if (!v)
        return void k.push({ id: t.id, height: e });
    try {
        const e = await fetchParcelClaimContent(t.id);
        n = parseParcelName(e);
    }
    catch { }
} n && u.push({ id: t.id, height: e, content: n.content, parcelNumber: n.parcelNumber, bitmapNumber: n.bitmapNumber }); }); if (!t) {
    const t = { height: e, hash: s, totalInscriptions: c.length, bitmapCandidates: l, parcelCandidates: u, unresolvedEncodedOrDelegatedCount: k.length, exhaustiveParcelDiscovery: v || 0 === k.length, newBitmaps: [], newParcels: [], hasUpdates: l.length > 0 || u.length > 0, validated: !1 };
    return a && (t.unresolvedEncodedOrDelegated = k), t;
} const d = await mapWithConcurrency(l, r, async (t) => { if (!t.eligibleHeight)
    return { candidate: t, result: { valid: !1, canonical: !1, reason: "Bitmap claim predates its Bitmap block" } }; try {
    return { candidate: t, result: await validateBitmap(t.bitmapNumber, { forceRefresh: !1, persist: !1, validatedThroughHeight: e }) };
}
catch (e) {
    return { candidate: t, result: { valid: !1, canonical: !1, error: !0, reason: e?.message || String(e) } };
} }), p = new Map; for (const e of u)
    p.has(e.bitmapNumber) || p.set(e.bitmapNumber, []), p.get(e.bitmapNumber).push(e); const m = await getChainHeightCached(), h = await mapWithConcurrency([...p.keys()], r, async (e) => { try {
    return { bitmapNumber: e, state: await getBitmapParcels(e, { forceRefresh: !0, requireCurrent: !1, includeInvalid: !0, includeDuplicates: !0, persist: n, validatedThroughHeight: m }) };
}
catch (t) {
    return { bitmapNumber: e, error: t };
} }), b = new Map(h.map(e => [e.bitmapNumber, e])), g = u.map(e => { const t = b.get(e.bitmapNumber); if (t?.error)
    return { candidate: e, result: { valid: !1, canonical: !1, error: !0, reason: t.error?.message || String(t.error) } }; const a = t?.state; if (!a?.valid)
    return { candidate: e, result: { valid: !1, canonical: !1, reason: a?.reason || "Referenced Bitmap is not valid" } }; const r = a.validParcels.find(t => t.parcelNumber === e.parcelNumber); return r?.id === e.id ? { candidate: e, result: { valid: !0, claimValid: !0, provenanceValid: !0, canonical: !0, inscriptionId: r.id, ...r, transactionCount: a.transactionCount } } : { candidate: e, result: { valid: !1, claimValid: !0, canonical: !1, canonicalInscriptionId: r?.id ?? null, parcelNumber: e.parcelNumber, bitmapNumber: e.bitmapNumber, reason: r ? "Parcel claim lost the canonical tie-break" : "Parcel candidate is not a canonical direct-child claim" } }; }), f = d.filter(({ candidate: t, result: a }) => a?.valid && a?.canonical && a.inscriptionId === t.id && a.height === e).map(e => e.result), w = g.filter(({ candidate: t, result: a }) => a?.valid && a?.canonical && a.inscriptionId === t.id && a.height === e).map(e => e.result); if (n) {
    for (const e of f)
        await persistBitmapRecord(e, m);
    if (i) {
        if (!Number.isSafeInteger(o) || o < 0)
            throw new Error("continuous scan requires a valid coverageStartHeight");
        await advanceStoredParcelWatermarks(e, o), await persistProcessedBlock(e, s, o);
    }
    else
        await idbPut("blockHashes", { height: e, hash: s, protocolVersion: STORAGE_PROTOCOL_VERSION, storedAt: Date.now() });
} const y = { height: e, hash: s, totalInscriptions: c.length, bitmapCandidateCount: l.length, parcelCandidateCount: u.length, unresolvedEncodedOrDelegatedCount: k.length, exhaustiveParcelDiscovery: v || 0 === k.length, newBitmaps: f, newParcels: w, hasUpdates: f.length > 0 || w.length > 0, validated: !0 }; return a && (y.bitmapCandidates = d, y.parcelCandidates = g, y.unresolvedEncodedOrDelegated = k), y; }
export async function scanBlock(e, t = {}) { return await scanBlockInternal(e, { ...t, continuous: !1, coverageStartHeight: null }); }
export async function getLatestBlockUpdates(e = {}) { return await scanBlock(await getChainHeight(), e); }
function deleteByHeightIndex(e, t, a) { const r = e.index(t).openKeyCursor(IDBKeyRange.lowerBound(a)); r.onsuccess = () => { const t = r.result; t && (e.delete(t.primaryKey), t.continue()); }; }
function deleteByPrimaryKeyRange(e, t) { const a = e.openKeyCursor(IDBKeyRange.lowerBound(t)); a.onsuccess = () => { const t = a.result; t && (e.delete(t.primaryKey), t.continue()); }; }
async function rollbackStorageFromHeight(e) { if (!indexedDbAvailable())
    return !1; checkBitmapNumber(e), await initialiseStorage(); const t = await openStorageDb(); if (!t)
    return !1; return await new Promise((a, r) => { const n = t.transaction(["bitmaps", "parcels", "parcelClaims", "bitmapState", "mondrians", "blockHashes", "childTrees", "satChains", "bitmapSearch", "meta"], "readwrite"); deleteByHeightIndex(n.objectStore("bitmaps"), "height", e), deleteByHeightIndex(n.objectStore("parcels"), "height", e), deleteByHeightIndex(n.objectStore("parcelClaims"), "height", e), deleteByPrimaryKeyRange(n.objectStore("mondrians"), e), deleteByPrimaryKeyRange(n.objectStore("blockHashes"), e), n.objectStore("childTrees").clear(), n.objectStore("satChains").clear(), n.objectStore("bitmapSearch").clear(); const i = n.objectStore("bitmapState").openCursor(); i.onsuccess = () => { const t = i.result; if (!t)
    return; const a = t.value; Number.isSafeInteger(a?.childrenScannedThroughHeight) && a.childrenScannedThroughHeight >= e && (a.childrenScannedThroughHeight = e - 1, a.syncedAt = Date.now(), t.update(a)), t.continue(); }, n.objectStore("meta").put({ key: "watch:lastProcessedHeight", value: e - 1, protocolVersion: STORAGE_PROTOCOL_VERSION, updatedAt: Date.now() }), n.objectStore("meta").put({ key: "watch:lastProcessedHash", value: null, protocolVersion: STORAGE_PROTOCOL_VERSION, updatedAt: Date.now() }), n.oncomplete = () => a(!0), n.onerror = () => r(n.error), n.onabort = () => r(n.error); }), clearCaches(), notifyStorageSubscribers({ type: "reorg-rollback", rewindHeight: e }), !0; }
async function findReorgRewindHeight(e, t) { const a = Math.max(0, e - t); for (let t = e; t >= a; t--) {
    const e = currentStoredRecord(await idbGet("blockHashes", t));
    if (e?.hash)
        try {
            if (await getBlockHashWithRetry(t) === e.hash)
                return t + 1;
        }
        catch { }
} return a; }
export function watchBlocks(e, { pollIntervalMs: t = 3e4, scanCurrent: a = !0, emitEmptyBlocks: r = !1, includeNonCanonical: n = !1, validationConcurrency: i = 4, resolveEncodedParcelCandidates: q = !1, reorgDepth: o = 12, signal: s = null, persist: c = !0, broadcast: l = !0, resumeFromStorage: u = !0, maxCatchupBlocks: d = 144, startHeight: p = null } = {}) { if ("function" != typeof e)
    throw new TypeError("watchBlocks requires an onEvent callback"); if (!Number.isFinite(t) || t < 5e3)
    throw new TypeError("pollIntervalMs must be at least 5000 ms"); if (!Number.isSafeInteger(o) || o < 1 || o > 144)
    throw new TypeError("reorgDepth must be 1..144"); if (!Number.isSafeInteger(d) || d < 0 || d > 1e4)
    throw new TypeError("maxCatchupBlocks must be 0..10000"); if (null !== p && (!Number.isSafeInteger(p) || p < 0))
    throw new TypeError("startHeight must be null or a non-negative whole number"); let m = !1, h = null, b = null, g = !1, f = null, w = null; const y = { running: !0, lastProcessedHeight: null, lastTipHeight: null, lastError: null }; async function I(t) { try {
    await e(t);
}
catch (e) {
    console.error("Bitmap SDK watchBlocks callback error:", e);
} } function S() { return m ? Promise.resolve(y) : b || (b = async function () { if (m)
    return y; try {
    const e = await getChainHeight();
    if (y.lastTipHeight = e, await async function (e) { if (!g) {
        if (g = !0, c && await initialiseStorage(), null !== p)
            f = p - 1, w = p;
        else if (c && u) {
            const [t, a] = await Promise.all([getMetaValue("watch:lastProcessedHeight"), getMetaValue("watch:coverageStartHeight")]), r = Number(t), n = Number(a);
            Number.isSafeInteger(r) && r >= 0 && e - r <= d && (f = r, w = Number.isSafeInteger(n) && n >= 0 ? n : r + 1);
        }
        null === f && (f = a ? e - 1 : e, w = a ? e : e + 1), y.lastProcessedHeight = f, c && await setMetaValue("watch:coverageStartHeight", w);
    } }(e), await async function (e) { if (!c || null === f || f < 0)
        return !1; const t = Math.min(f, e), a = currentStoredRecord(await idbGet("blockHashes", t)); if (!a?.hash)
        return !1; let r; try {
        r = await getBlockHashWithRetry(t);
    }
    catch {
        return !1;
    } if (r === a.hash)
        return !1; const n = await findReorgRewindHeight(t, o); await rollbackStorageFromHeight(n), f = n - 1, w = Math.min(Number.isSafeInteger(w) ? w : n, n), y.lastProcessedHeight = f, c && await setMetaValue("watch:coverageStartHeight", w); const i = { type: "reorg", detectedAtHeight: t, previousHash: a.hash, currentHash: r, rescanFromHeight: n, tipHeight: e }; return await I(i), l && notifyStorageSubscribers(i), !0; }(e), f > e) {
        const t = Math.max(0, e - o + 1);
        c ? await rollbackStorageFromHeight(t) : clearCaches(), f = t - 1, w = Math.min(Number.isSafeInteger(w) ? w : t, t), y.lastProcessedHeight = f, c && await setMetaValue("watch:coverageStartHeight", w);
    }
    for (let t = f + 1; t <= e && !m; t++) {
        let a;
        try {
            a = await scanBlockInternal(t, { validate: !0, includeNonCanonical: n, validationConcurrency: i, resolveEncodedParcelCandidates: q, persist: c, continuous: c, coverageStartHeight: w });
        }
        catch (a) {
            if (String(a?.message || a).includes("404")) {
                const a = await getChainHeight().catch(() => e);
                if (t >= a)
                    break;
            }
            throw a;
        }
        f = t, y.lastProcessedHeight = t, y.lastError = null, (a.hasUpdates || r) && await I({ type: "block", ...a }), l && c && a.hasUpdates && notifyStorageSubscribers({ type: "block-update", height: t, hash: a.hash, newBitmaps: a.newBitmaps, newParcels: a.newParcels });
    }
}
catch (e) {
    y.lastError = e?.message || String(e), await I({ type: "error", error: e, message: y.lastError, lastProcessedHeight: f });
} return y; }().finally(() => { b = null; }), b); } function C() { m || (h = setTimeout(async () => { await S(), C(); }, t)); } function N() { m || (m = !0, y.running = !1, null !== h && (clearTimeout(h), h = null), s && v && s.removeEventListener("abort", v)); } const v = () => N(); s && (s.aborted ? N() : s.addEventListener("abort", v, { once: !0 })); const P = S().finally(() => { m || C(); }); return Object.freeze({ stop: N, checkNow: S, ready: P, state: y }); }
export function clearCaches() { foundBitmapCache.clear(), bitmapPromiseCache.clear(), blockInfoCache.clear(), rawTransactionCountCache.clear(), parcelContentCache.clear(), parsedBlockCache.clear(), parsedBlockPromiseCache.clear(), parentIdsCache.clear(), inscriptionInfoCache.clear(), childrenDetailsCache.clear(), childrenDetailsPromiseCache.clear(), parcelStateCache.clear(), mondrianCache.clear(), tipCache = { height: null, expiresAt: 0 }; }
export function clearParcelCache(e) { if (void 0 === e)
    return childrenDetailsCache.clear(), childrenDetailsPromiseCache.clear(), void parcelStateCache.clear(); checkBitmapNumber(e), parcelStateCache.delete(e); }
export const storage = Object.freeze({ ready: async () => await initialiseStorage(), available: () => indexedDbAvailable(), getBitmap: async (e) => (checkBitmapNumber(e), await storageGetBitmapSafe(e)), getParcel: async (e, t) => (checkParcelNumber(e), checkBitmapNumber(t), await storageGetParcelSafe(e, t)), getBitmapParcels: async (e) => (checkBitmapNumber(e), await storageGetBitmapParcelsSafe(e)), getBitmapState: async (e) => (checkBitmapNumber(e), await storageGetBitmapStateSafe(e)), getMondrian: async (e) => (checkBitmapNumber(e), await storageGetMondrianSafe(e)), async clear() { if (!indexedDbAvailable())
        return !1; const e = await openStorageDb(); if (!e)
        return !1; const t = await clearStorageForProtocolChange(e); return t && (await idbPut("meta", { key: "schema", dbVersion: STORAGE_DB_VERSION, protocolVersion: STORAGE_PROTOCOL_VERSION, sdkName: SDK_NAME, moduleVersion: VERSION, updatedAt: Date.now() }), clearCaches(), notifyStorageSubscribers({ type: "storage-cleared" })), t; }, getChildrenTree: async (e) => (checkInscriptionId(e), await storageGetChildTreeSafe(e)), async getSatChain(e) { if (!Number.isSafeInteger(e) || e < 0)
        throw new TypeError("sat must be a non-negative safe integer"); return await storageGetSatChainSafe(e); }, async getStatus() { const e = await initialiseStorage(); if (!e.available)
        return { ...e, bitmaps: 0, parcels: 0, bitmapState: 0, mondrians: 0, blockHashes: 0, childTrees: 0, satChains: 0, parcelClaims: 0, bitmapSearch: 0, lastProcessedHeight: null, lastProcessedHash: null, coverageStartHeight: null }; const t = ["bitmaps", "parcels", "bitmapState", "mondrians", "blockHashes", "childTrees", "satChains", "parcelClaims", "bitmapSearch"], [a, r, n, i] = await Promise.all([Promise.all(t.map(e => idbCount(e))), getMetaValue("watch:lastProcessedHeight"), getMetaValue("watch:lastProcessedHash"), getMetaValue("watch:coverageStartHeight")]); return { ...e, ...Object.fromEntries(t.map((e, t) => [e, a[t]])), lastProcessedHeight: r, lastProcessedHash: n, coverageStartHeight: i }; }, subscribe(e) { if ("function" != typeof e)
        throw new TypeError("storage.subscribe requires a function"); return storageSubscribers.add(e), ensureStorageChannel(), () => storageSubscribers.delete(e); }, close() { if (storageChannel) {
        try {
            storageChannel.close();
        }
        catch { }
        storageChannel = null;
    } storageDbPromise && storageDbPromise.then(e => e?.close()).catch(() => { }), storageDbPromise = null, storageInitialisedPromise = null; } });
const BitmapSDK = Object.freeze({ SDK_NAME, VERSION: "1.0.1", OLD_OCI_LIMIT: 942e3, MONDRIAN_MODULE_ID, STORAGE_DB_NAME, STORAGE_DB_VERSION, STORAGE_PROTOCOL_VERSION, getChainHeight, getBlockHash, getBlockHashWithRetry, getBitmapInscriptionId, getBitmapSat, validateBitmap, getBitmapParcels, getParcelInscriptionId, validateParcel, validateParcelInscription, parseBitmapName, parseParcelName, compareParcelClaims, getBitmapPattern, getBitmapMondrian, getChildrenTree, getReinscriptionChain, getBitmapTree, getBitmapData, getParcelData, syncBitmap, scanBlock, getLatestBlockUpdates, watchBlocks, storage, clearParcelCache, clearCaches });
export default BitmapSDK;