"""Wave 1, lane D (data): freshness, ref corpus, history rules, storage robustness, sidebar under a slow server, page-kind chunks. Idempotent."""

import json
import os
import pathlib

T = pathlib.Path(os.environ.get("ATLAS_DIR") or pathlib.Path(__file__).resolve().parents[1])
atlas = json.load(open(T / "features.json"))
by = {f["id"]: f for f in atlas}
status = json.load(open(T / "rebuild-status.json"))


def add(fid, lines):
    print(fid, by[fid]["name"])
    for l in lines:
        if l not in by[fid]["details"]:
            by[fid]["details"].append(l)


add(
    "TXD-003",
    [
        "Freshness (D-7, LAUNCH_PLAN T-E01, 2026-11-10): text and catalog are fresh for 1 hour (were 7 days and 1 day); the disk keeps them 30 days, so a page still paints from IndexedDB and refreshes behind. Staff and moderators: text is never fresh (learned from the viewer query). A copy restored from disk past its hour is refetched behind what shows (TanStack only did that for an observer, and the reader reads text through loaders: a stored copy was used as is for 30 days). Tests: src/lib/cache/invalidate.test.ts, storage-failure.test.ts, e2e/freshness.spec.ts (faked clock: 50 min no request, 61 min a request).",
        "Writes forget what they changed (T-E01): src/lib/cache/invalidate.ts maps each write (links, topic links, lexicon, notes, a text edit, a book change) to its queries, invalidates them in memory and deletes their IndexedDB entries. A page reached from a Django editor (/edit, /translate, /add, /admin/reset, by document.referrer) forgets the edited book on disk before any disk read; the sidebar's Edit Text and Add Translation forget it before leaving. Tests: e2e/freshness.spec.ts ('back from a Django editor').",
    ],
)
add(
    "PLT-016",
    [
        "IndexedDB robustness (T-E04, 2026-11-10): reading works with IndexedDB missing, throwing on open (idb-keyval throws synchronously then: the ref index used to reject and fail the loader), hanging (disk reads give up after 1.5 s), failing mid-session (quota) and emptied (iOS evicts script-written storage after 7 days). Tests: src/lib/cache/storage-failure.test.ts. No WebKit run: Playwright 1.63's WebKit (revision 2359) is not installed on the build machine.",
    ],
)
add(
    "RTE-054",
    [
        "T-E03 (2026-11-10): a non-canonical spelling, a range across sections, a range of whole chapters (now rewritten to its first section) and a commentary's whole chapter, opened inside the app, are rewritten by replacing the entry (one entry; Back leaves); a range loaded as a page collapses in place; Back after reading many verses leaves the page instead of walking verses. Tests: e2e/history.spec.ts ('history rules (T-E03)').",
    ],
)
add(
    "TXD-068",
    [
        "Fixed 2026-11-10 (T-E03): below ~1075px the column rewraps when the sidebar narrows it, and the chosen verse moved (35px at 1000px, 105px at 900px): React runs a click's effects before the ResizeObserver, and the column's selected-segment effect re-recorded the anchor after the reflow. setFocus keeps an anchor already on that verse. Tests: e2e/history.spec.ts ('opening the sidebar at 1280/1000/900px does not move the chosen verse').",
    ],
)
add(
    "RTE-027",
    [
        "Ref torture corpus (T-E02, 2026-11-10): scripts/ref-corpus.cases.mjs (63 addresses: complex schemas, default nodes, alt structures, commentary and Talmud ranges across sections, Hebrew refs, titles with / and \\, Zohar, dictionaries, old version URLs, category titles); scripts/ref-corpus.mjs compares the final address and highlighted segments with www.sefaria.org: 43 the same, 20 recorded in KNOWN_DIFFERENCES (ranges across sections: sefaria.org's answer varies from load to load; out-of-range refs are not found here by decision; book pages without ?tab=contents; one bug: a title with a backslash). e2e/ref-corpus.spec.ts replays the 43 through the cassette.",
    ],
)
add(
    "RTE-028",
    [
        "BUILT 2026-11-10 (T-E08): the old /<ref>/<lang>/<version> address (Django old_versions_redirect) redirects 301 to /<ref>?v<lang>=<family>|<Version>, the family from the ref's versions list, as sefaria.org's client ends up. Was a 404 here. Tests: e2e/ref-corpus.spec.ts (three old-version addresses).",
    ],
)
add(
    "CON-071",
    [
        "SB-02 (T-H02, 2026-11-10): a slow or failing /api/related (a cold one is a 504 after ~15 s) or /api/links never leaves an endless spinner: Resources shows the connections /api/links gave at once, says the rest is still loading after 3 s, and on failure says what is missing with Try again; views that need the failed data show the same in place. Tests: e2e/connections.spec.ts ('a slow or failing server (SB-02)').",
        "SB-03 (measured 2026-11-10 through the cassette, Genesis 1:1): the page's /api/links is 6.19 MB raw / 638 KB gzip; opening the sidebar and Resources adds /api/related 12.09 MB / 1.27 MB gzip, of which its links are 8.2 MB / 633 KB gzip already loaded and its sheets 6.1 MB / 613 KB gzip used only for a count. No URL is fetched twice. The links cannot be dropped from the client side: related_api has no parameter to omit them (request: with_links=0, and a count-only sheets mode).",
    ],
)

# --- Rework 1 (2026-11-10): ranges and selection with legacy parity (owner decision), and the review's data-layer fixes ---

V = "VERIFIED 2026-11-10 on www.sefaria.org (Playwright, interfaceLang=english; lane-D report, legacy-ranges probe)"
RANGE_SUMMARY = "Every ranged address of several segments stays in the address and every segment in it is highlighted light blue, sidebar open or closed, inside one section or across sections; a daf without its amud is both amudim."
RANGE_DETAILS = [
    V + ": /Genesis.1.30-2.3, /Berakhot.2b.5-3a.2, /Rashi_on_Genesis.1.31.1-2.2.1 keep their address and highlight every segment (sidebar closed and with=all); /Genesis.6-8 is rewritten to /Genesis.6.1-8.22 (68 verses highlighted) without the sidebar and kept with it; /Berakhot.2 opens 2a and 2b, all highlighted, written /Berakhot.2a.1-2b.19 (sidebar closed) or /Berakhot.2a-2b (open), replacing the entry. Inside one section (integrator's probe, sidebar closed): /Genesis.1.1-3, /Genesis.1.4-6, /Genesis.1.20-25, /Exodus.3.1-4, /Psalms.23.1-4, /Berakhot.5a.3-6 stay highlighted; /Genesis.1.20-25?with=all keeps 6 highlighted.",
    "Kept and highlighted; legacy's occasional collapse is a race, not ported (owner 2026-11-10): /Genesis.1.3-5 showed 3 blue segments at 3.5 s and one by 8 s, because a stray scroll event runs adjustHighlightedAndVisible (static/js/TextColumn.jsx) and the history writes the segment (ReaderApp.jsx).",
    "A range of whole sections longer than the sections loaded with the page (Genesis 1-50) keeps its address as asked and is not highlighted (choice recorded 2026-11-10: blue over whole books is not what legacy effectively shows; only the requested range up to what loads would be).",
    "Reading on drops the highlight and the address follows the verse (/Berakhot.2b.17), as legacy. A navigation (a link, Back/Forward to another entry) drops a selection at once.",
    "Owner decision 2026-11-10: legacy parity. Built: src/lib/text/range-selection.ts, src/lib/text/queries.ts (spannedPlan), src/features/reader/TextPanel.tsx. Tests: src/lib/text/range-selection.test.ts, e2e/ranges.spec.ts, e2e/history.spec.ts, e2e/routing.spec.ts, e2e/scroll.spec.ts.",
]
RANGE = {
    "id": "TXD-070",
    "area": "text-display",
    "group": "Scrolling",
    "name": "Ranged address kept and highlighted across sections",
    "summary": RANGE_SUMMARY,
    "details": list(RANGE_DETAILS),
    "audience": "all",
    "platform": "all",
    "status": "core",
    "tier": "standard",
    "refs": [],
    "src": "static/js/ReaderApp.jsx (history from highlightedRefs), static/js/TextRange.jsx (highlight), static/js/ReaderPanel.jsx (showHighlight)",
}
if "TXD-070" not in by:
    atlas.append(RANGE)
    by["TXD-070"] = RANGE
# round 2 (2026-11-10) replaces round 1's text, so the entry is the same however many times this runs
by["TXD-070"]["name"] = "Ranged address kept and highlighted"
by["TXD-070"]["summary"] = RANGE_SUMMARY
by["TXD-070"]["details"] = list(RANGE_DETAILS)
print("TXD-070", by["TXD-070"]["name"])
status["TXD-070"] = {"status": "done", "note": "Kept and highlighted across sections, sidebar open or closed (legacy parity, verified 2026-11-10)", "by": "src/lib/text/range-selection.ts, src/features/reader/TextPanel.tsx"}

by["TXD-050"]["summary"] = "The segment being studied is marked light blue while the sidebar is open; several segments (a pasted range across sections, or text selected across segments) are marked whether or not the sidebar is open."
add(
    "TXD-050",
    [
        "Corrected 2026-11-10: the blue highlight also shows with the sidebar closed when more than one segment is highlighted (the old ReaderPanel showHighlight = showHighlight || highlightedRefs.length > 1). " + V + ": dragging a selection from Genesis 1:30 to 2:2 with the sidebar closed highlights the four verses; the sidebar does not open. Tests: e2e/ranges.spec.ts.",
    ],
)
add(
    "TXD-055",
    [
        "Corrected 2026-11-10: a range is not replaced by its first segment, inside one section or across sections (TXD-070; owner decision: legacy's occasional collapse is a race, not ported). " + V + ".",
    ],
)
add(
    "TXD-057",
    [
        "BUILT 2026-11-10 (legacy parity, " + V + "): text selected across several segments highlights them (blue) with the sidebar open or closed and never opens it; with the sidebar open the address becomes the range (/Genesis.1.30-2.2?with=all) and the sidebar shows it; closed, the address becomes the range only when it lies in the section being read (/Genesis.1.3-5), otherwise it stays (/Genesis.1.29); the entry is replaced, not added. Choosing a verse or reading on drops it. Tests: e2e/ranges.spec.ts ('selecting text across segments').",
    ],
)
status["TXD-057"] = {"status": "partial", "note": "Multi-segment selection highlighted and written to the address as legacy (verified 2026-11-10); double-click guard not ported", "by": "src/lib/text/range-selection.ts, src/features/reader/TextPanel.tsx"}
add(
    "TXD-003",
    [
        "Review fix 2026-11-10: loaders read text and catalog with ensureQueryData(revalidateIfStale): a stale cached copy shows at once and is refetched behind it, so Back and section navigation never wait on the network (staff's 0 applies to revalidation only); neighbours are prefetched only when not in memory.",
    ],
)
add(
    "PLT-016",
    [
        "Review fix 2026-11-10: every disk call (reads, key scans, deletions) is bounded; after one timeout the disk is skipped for the rest of the visit; writes invalidate memory first and never wait on the disk; leaving for a Django editor waits at most 300 ms. Editor returns recognised: /edit, /translate, /add, /add/textinfo/<title>, /admin/reset/cache|counts/<title>, /admin/reset/toc (whole catalog), on the site origin or the page's own, on a navigation only (not a reload or Back).",
    ],
)

status["PLT-016"] = status.get("PLT-016") or {
    "status": "partial",
    "note": "IndexedDB failure modes handled and unit-tested; no WebKit browser run yet",
    "by": "src/lib/cache/storage.ts, src/lib/cache/ref-index.ts",
}

json.dump(atlas, open(T / "features.json", "w"), ensure_ascii=False, indent=1)
json.dump(status, open(T / "rebuild-status.json", "w"), ensure_ascii=False, indent=1)
