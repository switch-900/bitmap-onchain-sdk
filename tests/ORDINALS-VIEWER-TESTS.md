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

## Relevant source

- [Ordinal Theory Handbook: recursion](https://docs.ordinals.com/inscriptions/recursion.html)
- [Ordinal Theory Handbook: inscription sandboxing](https://docs.ordinals.com/inscriptions.html)
