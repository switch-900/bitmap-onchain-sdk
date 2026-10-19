# Ordinals inscription-viewer tests

Two **read-only** probes are available for use with a real \`ord server\`,
including \`ordinals.com\`. Neither signs messages, connects wallets,
submits transactions, modifies Bitcoin, deploys a site or inscribes code.

## A. Test today, without inscribing a test page

1. Open an existing HTML inscription directly using
   \`https://ordinals.com/content/<INSCRIPTION_ID>\`.
   For example, use the known LiveOCI HTML inscription URL:
   \`https://ordinals.com/content/0c1d5fbd2cf9a2bd33d53d444e4873f9b2efb54f823226f8a76ba0e4baa5cb11i0\`.
2. In desktop Chrome/Edge, press **F12**, open **Console**, and make sure its
   execution context is the inscription document itself, not the enclosing
   explorer page. If using an Ordinals **preview iframe**, select its frame
   from the DevTools execution-context dropdown.
3. Open
   [ordinals-viewer-console.js](./ordinals-viewer-console.js), copy its full
   JavaScript, paste it into the Console and run it. Chrome may require
   typing \`allow pasting\` first.
4. Inspect \`console.table\` for elapsed time and fetch-request counts.
   Copy the final JSON or run:
   \`copy(JSON.stringify(window.__bitmapOrdProbeReport, null, 2))\`.

The console probe temporarily instruments \`fetch()\`, then restores it on
completion (also after errors). Only fetch calls are counted: browser-managed
ES-module imports, HTTP cache hits, IndexedDB transaction counts and network
transfer bytes are not included in request totals.

**IMPORTANT:** As long as canonical SDK sat
\`25483050779204\` points to the earlier inscribed version,
this runs the **earlier on-chain SDK**, not the new GitHub v1.0.3 branch.
It will report the version it loaded, and skip new indexer benchmarks when
\`indexBitmapBlocks()\` is absent. This is intentional, not a simulated result.
A GitHub URL cannot simply be imported inside an Ord inscription due to the
viewer content-security policy. If a **separate staging SDK inscription** later
exists, change the `SDK` constant at the beginning of the console script to
`"/content/<STAGING_SDK_INSCRIPTION_ID>"` before pasting. That tests the
specific on-chain staging bytes without replacing the canonical SDK.

## B. Self-contained HTML test inscription

The source
[ordinals-viewer-probe.html](./ordinals-viewer-probe.html)
contains the entire HTML/CSS/JS test interface. It only imports the already
inscribed SDK through:

\`\`\`js
await import("/r/sat/25483050779204/at/-1/content");
\`\`\`

by default, or imports `/content/<STAGING_SDK_INSCRIPTION_ID>` if you enter a
valid on-chain staging ID in the optional input. It fetches same-origin Ord
recursive data. It has no npm imports, CDNs,
external stylesheets or wallet libraries.

**This HTML has not been inscribed.** A Github raw HTML file does not become
an Ordinals inscription just by being opened. To view it in an Ord explorer,
it would first have to be inscribed as \`text/html;charset=utf-8\` (a paid,
irreversible action not performed here). It is provided for source review or
a later deliberate test inscription.

Buttons:

- **Run read-only checks**: loads the canonical sat SDK or the explicitly chosen staging SDK,
  checks \`/r/blockheight\` and \`/r/blockhash/\`, checks strict Bitmap-name
  parsing, and uses \`scanBitmapClaim()\` with **no more than 16 blocks**
  for each requested historical/modern Bitmap. If a claim is found,
  compares the ID, height and sat to actual \`/r/inscription/<ID>\` data
  and calls the canonical Bitmap validator.
- **Run v1.0.3 two-block cache benchmark**: after importing SDK v1.0.3,
  force-fetches **exactly two confirmed modern Bitcoin blocks** using
  \`indexBitmapBlocks()\`, then repeats the same range without forcing.
  It checks that the warm run makes **no new raw block fetches** and
  records hash checks, latency, indexed candidates and storage status.
- **Recheck saved blocks (after reload)**: attempts to reuse the same two
  blocks **without forcing a refresh**. Run the forced benchmark, reload
  the same direct content URL, then click this button; reuse across loads
  depends on IndexedDB being available in that viewer/browser context.
- **Copy JSON report**: retains exact IDs, sats, scan bounds, timings,
  request counts and errors. If iframe clipboard access is denied,
  manually copy the selected JSON textarea.

### Sandbox caveat

Ord HTML previews may be displayed in an iframe with
\`sandbox="allow-scripts"\` **without** \`allow-same-origin\`. In that
environment, IndexedDB can be unavailable because the frame has an
opaque origin. It must be marked as **unavailable**, not failed indexing.
A direct \`/content/<ID>\` page may have different storage permissions.
Test both contexts and record the reported storage status.

### Valid and invalid claims

The live probe can validate a **discovered** claim against Ord metadata.
It does not generate duplicates or invalid Bitcoin inscriptions to create
a test case. Those cases are exercised by the existing **synthetic,
read-only Node test suite** in this repo. Likewise, no actual Bitcoin
reorganisation can be safely triggered in a public explorer: the
simulated reorg regression tests remain separate.

A bounded \`missing, complete:false\` response means **not found yet
in scanned coverage**. It is not evidence that a Bitmap is unclaimed.

### How to distinguish results

- **PASS**: a specific invariant was checked using observed data.
- **INFO**: a bounded scan has not established a canonical winner or no
  forced conclusion is possible.
- **SKIP**: the loaded SDK or browser sandbox does not offer the feature.
- **FAIL**: an endpoint/API call failed, or the observed result contradicts
  a stated invariant.

A successful UI load and passing Node mock tests do **not** prove that
v1.0.3 works on a live Ord viewer. Run the probes directly in that
environment and share their resulting JSON before publishing or
reinscribing the SDK.


## C. Profile first-load Mondrian geometry (840000.bitmap)

The live baseline measured from an Ordinals viewer for \`840000.bitmap\` was:
- initial geometry: **1,803.9 ms** with \`recursive-raw-block\`;
- warm local geometry: **4.1 ms**, 3,050 parcel slots;
- a forced rebuild including gaps: **32.3 ms**, 48 empty spaces.

Those numbers are browser observations, not separate parser/network timing
measurements. The raw block fallback (and its network/cache behaviour) is a
plausible major cost, but cannot be identified as the dominant component
without profiling.

[ordinals-mondrian-profiler-console.js](./ordinals-mondrian-profiler-console.js)
runs in the **same Ordinals inscription DevTools console** as test A.
Copy all of it and paste into the inscription document context.

The script intentionally calls \`getBitmapMondrian(840000)\` with
\`forceRefresh:true, forceLive:true, includeEmptySpaces:true\` so the
current v1.0.2 does not silently return an old cached layout. It then
runs a warm lookup and reports the number of slots and empty spaces,
\`/r/block/\` requests, HTTP and JSON decode timings, and overall
elapsed time. It restores \`window.fetch\` afterwards.

v1.0.3 adds the optional \`onTiming\` callback, which reports:
- \`mondrian-module\`
- \`raw-block-http\`
- \`raw-block-json\`
- \`raw-block-hex-decoder\` (text-to-byte conversion)
- \`raw-block-transaction-parser\` (includes decoding)
- \`block-transaction-count\`
- \`pattern-derivation\`
- \`pattern-resolution\` (inclusive of nested stages)
- \`layout-construction\`
- \`slot-mapping\`
- \`empty-space-construction\`
- \`indexeddb-persist\` (when available and requested)
- \`total\` (inclusive elapsed time)

Nested stages and independently awaited requests can overlap, so **do not
sum the stage durations to calculate total runtime**.

Until v1.0.3 is actually published to an accessible Ord inscription, the
current canonical v1.0.2 still yields endpoint measurements but no internal
\`onTiming\` records. For a deliberately inscribed staging version, enter
its real inscription ID in the script's \`STAGING_INSCRIPTION_ID\` constant.
Never use GitHub-hosted code as an Ord recursive import substitute.

### Optimisations already applied to the v1.0.3 development branch

- \`/r/block/<height>\` and \`/r/blockinfo/<height>\` are fetched in
  parallel on the raw Mondrian fallback. Previously the code fetched
  the block, parsed it and **then** fetched transaction count.
- The geometry loader reuses an IndexedDB record already read in the same
  call when expanding base geometry into empty spaces.
- Geometry now has opt-in per-stage profiling without a default network or
  feature dependency.

No real-world speedup is asserted until the on-chain staging version
has been profiled against the current canonical version.

## Relevant source

- [Ordinal Theory Handbook: recursion](https://docs.ordinals.com/inscriptions/recursion.html)
- [Ordinal Theory Handbook: inscription sandboxing](https://docs.ordinals.com/inscriptions.html)

### Raw block hexadecimal conversion

The development SDK uses native `Uint8Array.fromHex()` on supporting browsers and a strict validated fallback elsewhere. This removes the older per-byte `parseInt(hex.slice())` loop on modern browsers. A 6-million-character synthetic V8 benchmark showed conversion much faster, but that **does not measure total Bitmap load time**: HTTP transfer and JSON body reading are separate bottlenecks. Compare the detailed `raw-block-hex-decoder` timing in a real staged viewer before attributing an end-to-end speedup.

## D. Compare raw block hex decoder on actual 840000.bitmap

Open an Ordinals HTML inscription viewer, select the inscription document's
DevTools Console and paste the entire file
[ordinals-hex-benchmark-console.js](./ordinals-hex-benchmark-console.js).
It fetches `/r/block/840000` **once** and compares byte-for-byte:

- v1.0.2's `parseInt(hex.slice())` decoder;
- v1.0.3's manually validated older-browser decoder;
- the browser's native `Uint8Array.fromHex()` when supported.

It shows actual `response.json()` time separately from hex conversion time.
It rejects mismatches. The console object is saved to
`window.__bitmapHex840000Report`, and
`copy(JSON.stringify(window.__bitmapHex840000Report,null,2))`
copies its report. **This does not test the complete v1.0.3 Mondrian path**;
it isolates the new conversion optimisation on real block bytes.

## E. Lossless compact Mondrian pattern size test for block 840000

Copy [ordinals-pattern-packing-console.js](./ordinals-pattern-packing-console.js)
into the DevTools Console of an existing Ordinals HTML inscription.
It uses only the on-chain SDK and Ord recursive endpoints.
It calls `getBitmapPattern(840000, { forceLive: true })` and will therefore
incur a real, **read-only** `/r/block/840000` download.

It packs exact Mondrian size classes 1 through 9 into 4-bit nibbles,
unpacks them independently, and compares every element. For 3,050 slots,
four-bit packing is exactly **1,525 bytes** before block height, version,
block hash, lookup metadata, index overhead and inscription costs.
This is not a network latency or inscription fee estimate.

Where supported, `CompressionStream('gzip')` measures gzip size. This
does not measure Brotli or Bitcoin inscription transaction size.
Results are stored in `window.__bitmapPattern840000Report`.

The compact pattern is derived data: being on-chain and matching a
transaction count or block hash does not independently prove that it
matches every transaction's output value. A future pattern index requires
an explicit provenance and verification/trust policy.

No new inscription or production index entry is created by this probe.
