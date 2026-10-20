# Multi-Block Compact Mondrian Index — Design Gate

Status: **design/test only**, no approved inscription, deployment or production lookup change.

## What is established

- Real 840000.bitmap pattern: 3050 transaction-size classes, packed 1525 bytes, Brotli-11 405 bytes, gzip 479 bytes.
- SHA-256 of unpacked bytes: `3469c9067eade08b6a0213345d3d22f0751790e425d67eb304c72faf5c29e858`.
- Browser runtime: existing on-chain BrotliOC decodes this pattern; warm median 0.7ms on the observed device, versus native gzip 1.8ms; cold Brotli first decode ~282ms.
- Reconstructed geometry has 3050 parcel slots and 48 empty spaces; captured block hash matches current Ord recursive `/r/blockhash/840000`.
- Browser fetch of *a separate existing* Brotli-encoded inscription returned HTTP 200 and recognisable decoded HTML. **840000 pattern itself has NOT been inscribed.**

## Bitmon catalogue is intentionally selective — NOT a general Bitcoin-block index

The existing on-chain Mondrian/Bitmon module
`55551557695dd82a2bda5ec3497684ec7cbb2cc1752ff5101accff1648666c3ai0`
contains **Bitmon repeated-pattern entries only**. Its `getPatternArray(height)`
provides a pattern for a block classified in that catalogue; an absent entry
does **not** mean the Bitmon index has incomplete coverage or that its data
needs backfilling. The old coverage probe merely checked whether the sample
heights have catalogue entries.

The general Bitmap problem is distinct: every Bitcoin block has a Mondrian
layout derivable from its real output totals, regardless of whether it is a
Bitmon. The compact multi-block project is a separate optional transport/
cache for those general per-block patterns. It must not change Bitmon
classification, overwrite the Bitmon catalogue, or treat a non-Bitmon as an
indexing error.

## Proposed design if enough general Bitmap demand justifies new bundles

1. Preserve the existing Bitmon catalogue and its pattern lookup unchanged.
   Never introduce general Bitcoin-block patterns into the Bitmon catalogue.
2. Group a bounded run of **previously verified** Bitcoin block patterns into one
   immutable *bundle inscription* rather than inscribing individual patterns.
   Candidate sizes to benchmark: 32, 64 and 128 blocks; not a fixed choice yet.
3. Each bundle starts with a versioned binary header, record table and length-checked
   entries. Each entry includes the actual height (or bounded delta), raw Bitcoin
   block hash, transaction count, packed-pattern length, digest and pattern bytes.
   All untrusted sizes, offsets and transaction counts must be bounded and checked.
4. Compare **whole-bundle Brotli** against independent per-pattern Brotli.
   Whole-bundle encoding may allow better inter-pattern compression, but forces
   reading the bundle to extract one height. Do not assume Ord HTTP Range support.
5. Keep a separate, small directory mapping height ranges to bundle inscription IDs,
   with no invented endpoint, registry sat, or promise of a mutable on-chain pointer.
   Any proposal to update a canonical registry must be reviewed before inscription.
6. For HTTP `Content-Encoding: br` bundles, test whether Ord/browser supplies decoded
   binary to `fetch(...).arrayBuffer()`; do not double decompress.
7. For the currently proposed JSON/Base64 manifest form, use the native Brotli stream
   if available, else the **already-inscribed** `BrotliOC` fallback. Prefer binary
   over Base64 on-chain if it actually saves bytes after envelope/directory overhead.

## Provenance and safety

- A SHA-256 of data supplied beside the data is an **integrity checksum, not proof**
  that Bitcoin output values produced the claimed square sizes.
- A matching `/r/blockhash/<height>` and `/r/blockinfo/<height>` verifies current
  chain hash and transaction count only. It does **not** prove pattern correctness.
- Distinguish `integrityVerified`, `blockHashMatches`, and `verifiedAgainstRawBlock`.
- Unverified on-chain bundles may power **explicit previews** only, never silently
  populate the trusted canonical geometry cache. Canonical trust requires prior
  independent raw-block derivation or a separately defined authenticated proof.
- `includeValues: true` must continue to derive exact satoshi output totals from
  the raw block: a compact pattern stores size classes, not those totals.
- Handle reorgs by comparing saved block hashes with live recursive height hashes;
  invalidate derived geometry and range records when mismatched.
- Do not let an absent bundle cause a hard failure when live raw-block fallback is permitted.

## Acceptance tests before committing inscription fees

- Preserve the semantic distinction between Bitmon repeated-pattern catalogue membership and general Bitcoin-block pattern availability.
- Derive/verify patterns for several **different** real block heights before bundling.
- Compare every packed value and occupied/gap coordinate against live canonical SDK
  layout (not just 3050/48 counts). Test odd transaction counts and malformed bounds.
- Report total delivered bytes including directory, envelope and Brotli decoder overhead;
  include cold/warm latency and requests, not compressed ratio alone.
- Demonstrate index lookup, missing-range fallback, reorg handling and no unverified
  insertion to trusted cache in the browser plus the automated suite.
- Obtain explicit user review of exact artifacts and fees before any on-chain write.

## 2026-10-20 Bitmon membership sample and prototype update

Observed in the **same-origin Ord browser** (eight catalogue lookups, not a random sample):

| Height | Bitmon catalogue lookup |
| --- | --- |
| 177700 | Has a repeated-pattern entry (6 sizes) |
| 500000 | No entry |
| 700000 | No entry |
| 767430 | No entry |
| 800000 | No entry |
| 840000 | No entry |
| 900000 | No entry |
| 960000 | No entry |

These results are expected for a **selective catalogue of repeated Bitmon
patterns**. They are **not** a measure of missing general Bitmap data or
incomplete Bitmon coverage. In particular, Bitmap 840000 has a valid,
raw-derived pattern (3050 sizes) even though it has no Bitmon catalogue entry.

A **non-production** deterministic binary format exists in
[`experimental/compact-multiblock-v1.mjs`](../experimental/compact-multiblock-v1.mjs),
with pure-JS encode/decode and lookup by height, big-endian height/counts,
32-byte block hash, per-record packed SHA-256, 4-bit sizes and defensive
bounds. The record header alone is **76 bytes per block**, plus 8 bytes
per bundle. Decoding marks provenance as `verifiedAgainstRawBlock:false`.
Nothing automatically imports these bundled patterns into the canonical cache.

Synthetic examples (Brotli quality 6, **NOT real Bitcoin block samples**):

| Synthetic blocks | Uncompressed bundle | Brotli quality 6 |
| ---: | ---: | ---: |
| 32 | 18,552 bytes | 3,335 bytes |
| 64 | 51,335 bytes | 6,386 bytes |
| 128 | 105,164 bytes | 11,685 bytes |

Synthetic patterns reuse substrings of the 840000 fixture and thus may be
artificially compressible. **Do not derive inscription fees or throughput
promises from these numbers.** Index record overhead includes 32 bytes of
block hash and 32 bytes of SHA-256 per block; future optimisation may be
possible if whole-bundle integrity and authenticity are designed carefully.

For the first actual multi-block comparison, run
[`tests/ordinals-real-3block-bundle-console.js`](ordinals-real-3block-bundle-console.js)
on the Ord browser. It uses 840000's previously raw-verified 405-byte
fixture, fetches only two **neighbouring live** blocks (839999 and 840001)
via the existing inscribed SDK's `getBitmapPattern(forceLive:true)`, builds
one three-block bundle, checks each record, and compares Brotli 11 with
native gzip. This experiment is read-only. Do not extrapolate three heights
to overall network-wide performance.

## Scope and inscription economics

Do not automatically index every mined Bitcoin block on-chain. The current
approach is an **optional, demand-driven accelerator** for general Bitmap
geometry, with canonical live derivation and local caching retained for
unindexed heights. Even compressed hundreds-of-bytes-per-block records become
large and potentially costly across hundreds of thousands of blocks.
The multi-block bundle prototype tests transport savings only; neither all-
chain coverage nor a new canonical pointer is authorised or established.

## First observed REAL contiguous three-block bundle: 839999–840001

User ran the read-only Ord viewer probe on 2026-10-20:

| Height | Source | Transaction count | Nibble-packed bytes |
| ---: | --- | ---: | ---: |
| 839999 | raw Bitcoin block through inscribed SDK | 2,328 | 1,164 |
| 840000 | earlier raw-derived, SHA-verified fixture | 3,050 | 1,525 |
| 840001 | raw Bitcoin block through inscribed SDK | 2,823 | 1,412 |

- Total packed pattern bytes: **4,101**; combined transaction count: **8,201**.
- Bundle binary total: **4,337 bytes**, including **236 bytes** of current
  format record headers (8 base + 3 × 76 record headers).
- Whole-bundle Brotli quality 11: **1,611 bytes**; native gzip: **1,873 bytes**.
- Record encode/decode equality and both compression roundtrips: **passed**.
- End-to-end experiment: **18,392.3 ms**, including two forced-live raw-block
  fetch/derivation operations, so this is **not** a compact-bundle loading time.

**Do not conclude yet that whole-bundle Brotli beats three separately compressed
patterns**: the original test did not report those three compressed sizes.
The updated `ordinals-real-3block-bundle-console.js` now compares whole-bundle
Brotli against (a) independent Brotli-compressed bare patterns and
(b) independent Brotli-compressed self-describing single-record bundles,
with gzip equivalents. It checks each individual codec roundtrip and retains
packed fixtures in memory for future tests. An inscription directory, envelope
fees, network requests and browser download latency remain to be accounted for.

Although the transport checksum and reconstruction tests pass, this is still
an **uninscribed experimental transport**, not a consensus-authenticated
source or permission to populate canonical trusted indexes.

## 2026-10-20 real three-block head-to-head comparison

The user reran the 839999–840001 test with separate per-pattern compression.
All pattern, Brotli and gzip roundtrips passed. The observations:

| Encoding approach | Brotli-11 output | Notes |
| --- | ---: | --- |
| Three separately compressed bare nibble patterns | **1,386 bytes** | No height, block hash, count or checksum supplied |
| One full three-block binary bundle (v1) | **1,611 bytes** | 8-byte bundle header, three 76-byte metadata headers |
| Three separately compressed self-describing v1 records | **1,711 bytes** | Each has standalone header and metadata |
| Full v1 bundle with gzip | 1,873 bytes | Same v1 binary input |

The v1 bundle saves **100 bytes (5.8%)** versus three separately compressed
self-describing records, but occupies **225 bytes more** than three
*bare* patterns without any indexing metadata. These comparisons do not
include an inscription envelope, a separate directory or per-inscription
network requests and fees. Total experiment runtime **5,794.1 ms** includes
raw-block retrieval for 839999 and 840001 and is NOT compact lookup latency.

### Lean-header experiment (not an approved format)

The original v1 binary bundle uses 76 metadata bytes per record:
height (4), transaction count (4), block hash (32), packed-pattern SHA-256 (32),
payload length (4). An experimental lean version removes the **redundant
per-record SHA-256** and retains the other 44 bytes. The complete binary
bundle's SHA-256 would instead need to be anchored in a separate,
versioned *authenticated* directory, alongside an actual on-chain bundle
locator. That directory is **not designed or inscribed yet**. No hash,
whether internal or directory-based, proves canonical Bitcoin-output-derived
pattern correctness.

The read-only test
[`ordinals-real-3block-header-compare-console.js`](ordinals-real-3block-header-compare-console.js)
uses the in-tab `window.__bitmapReal3BlockPackedFixture` from the previous
three-block experiment to compare real pattern payloads in v1 (76-byte)
and lean (44-byte) per-record formats, with Brotli quality 11, complete
record/byte roundtrips and checksum checks. It makes **no raw block requests**.
The lean variant is for sizing only; it has NOT been integrated into SDK
production lookups or trusted storage. Await measurements before choosing it.

### Access-pattern decision still open

Three separate single-block requests can retrieve only the target block,
whereas a single combined bundle may require downloading and decoding the
entire group for one lookup. Larger bundles may save more per-inscription
overhead but can hurt random access. Measure cold and warm fetch/decode,
selection and index lookup, including directory metadata, before fixing
32/64/128-block groups. Do not extrapolate from only three neighbouring
heights.
