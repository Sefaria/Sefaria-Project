## 2026-11-10 — data lane: freshness, ref corpus, history rules, storage, slow sidebar, page-kind chunks

### Corrected

- **TXD-003** Text and catalog are fresh for an hour (D-7), staff always revalidate text, a copy restored from disk past the hour is
  refetched behind it (it was used as is for 30 days), and writes (links, topic links, lexicon, notes, a return from a Django editor)
  forget what they changed in memory and on disk.
- **TXD-068** Opening the sidebar below ~1075px moved the chosen verse (35–105px): fixed; tested at 1280, 1000 and 900px.
- **RTE-054** History rules tested (T-E03): rewrites replace the entry; a range of whole chapters becomes its first chapter in place.
- **RTE-028** The old `/<ref>/<lang>/<version>` address redirects as on sefaria.org (was a 404). _Verified_ by the ref corpus.
- **TXD-003 / PLT-016** Review fixes: a stale cached copy never blocks a navigation; a hanging IndexedDB never blocks a write and is
  skipped for the session after one timeout; more editor returns recognised, only on a navigation.
- **CON-071** A slow or failing `/api/related` or `/api/links` shows what arrived, says it is still loading, and offers a retry (SB-02).
  SB-03 measured: Resources downloads Genesis 1's links a second time inside `/api/related` (633 KB gzip); needs a server parameter.

- **TXD-050 / TXD-055** Corrected (owner decision 2026-11-10, _verified_): several highlighted segments show blue with the sidebar
  closed; only a range inside one section collapses.
- **TXD-057** Text selected across segments is highlighted and written to the address as on sefaria.org (_verified_ 2026-11-10).

### Added

- **TXD-070** Ranged address kept and highlighted across sections (chapters, dapim, commentary), sidebar open or closed; a range of
  whole chapters written by its verses. _Verified_ 2026-11-10.

- **RTE-027** The ref torture corpus (`scripts/ref-corpus.mjs`, 63 addresses compared with www.sefaria.org; 43 the same, 20 recorded
  with their reason) and its e2e replay. _Verified_ 2026-11-10.
- **PLT-016** IndexedDB missing, throwing, hanging, full or evicted: reading works (unit-tested; no WebKit run yet).
