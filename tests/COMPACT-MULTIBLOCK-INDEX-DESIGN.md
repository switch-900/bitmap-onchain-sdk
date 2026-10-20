# Multi-Block Compact Mondrian Index — Design Gate

Status: **design/test only**, no approved inscription, deployment or production lookup change.

## What is established

- Real 840000.bitmap pattern: 3050 transaction-size classes, packed 1525 bytes, Brotli-11 405 bytes, gzip 479 bytes.
- SHA-256 of unpacked bytes: `3469c9067eade08b6a0213345d3d22f0751790e425d67eb304c72faf5c29e858`.
- Browser runtime: existing on-chain BrotliOC decodes this pattern; warm median 0.7ms on the observed device, versus native gzip 1.8ms; cold Brotli first decode ~282ms.
- Reconstructed geometry has 3050 parcel slots and 48 empty spaces; captured block hash matches current Ord recursive `/r/blockhash/840000`.
- Browser fetch of *a separate existing* Brotli-encoded inscription returned HTTP 200 and recognisable decoded HTML. **840000 pattern itself has NOT been inscribed.**

## Critical discovery: the Bitmon pattern index already exists

The SDK imports existing on-chain Mondrian/Bitmon module
`55551557695dd82a2bda5ec3497684ec7cbb2cc1752ff5101accff1648666c3ai0`,
and calls `getPatternArray(height)` before falling back to raw block. Therefore do
**not** assume each block needs a new index. First inspect whether original index
covers target heights. Run `tests/ordinals-existing-pattern-coverage-console.js`
from the same-origin Ord viewer and record index hits and misses. No `/r/block` fetch.

## Proposed design if uncovered blocks justify new bundles

1. Reuse the canonical on-chain Bitmon index for its existing coverage; don't duplicate it.
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

- Inspect real existing Bitmon index coverage across old/new heights, especially 840000.
- Derive/verify patterns for several **different** real block heights before bundling.
- Compare every packed value and occupied/gap coordinate against live canonical SDK
  layout (not just 3050/48 counts). Test odd transaction counts and malformed bounds.
- Report total delivered bytes including directory, envelope and Brotli decoder overhead;
  include cold/warm latency and requests, not compressed ratio alone.
- Demonstrate index lookup, missing-range fallback, reorg handling and no unverified
  insertion to trusted cache in the browser plus the automated suite.
- Obtain explicit user review of exact artifacts and fees before any on-chain write.
