# Multi-panel parity plan: opening panels from the sidebar

Written 2026-10-06 from three sources: a read of the legacy code (Sefaria-Project `static/js`, cited `file:line` below), a survey of
this client, and a live probe of www.sefaria.org at 1440×900 (`scripts/probes/multipanel-probe.mjs`). Live behaviour wins over
the code and over the atlas. Every step is test-first: the parity script, unit tests, then e2e tests tagged with atlas IDs.

## 1. What the legacy reader does

In legacy, a connections sidebar is a panel of its own (index n+1, `mode:"Connections"`). In this client it is an *aside* that
belongs to its text panel (docs/WORKSPACE.md). Every legacy behaviour below is restated in those terms.

| # | Action in the sidebar (desktop) | Legacy result | Source |
|---|---|---|---|
| A | **"Open"** on a connected text (TextList) | **The sidebar is replaced by a new text panel** showing that text *as itself* (Rashi on Genesis 1:1:1, not converted to base text). The text is highlighted, the language is bilingual if the source panel is, and versions are default. The source panel keeps its highlight but loses its sidebar. Width 68/32 → 50/50. URL `/Genesis.1.1?lang=bi&p2=Rashi_on_Genesis.1.1.1&lang2=bi`. **VERIFIED live.** | TextList.jsx:255-279 → ReaderPanel.showBaseText :259-292 → openPanelAt(replace) ReaderApp:1730-1808 |
| B | Click on the comment's own text | Nothing. **VERIFIED live.** | TextList.jsx:162-173 |
| C | **Citation inside sidebar text** (CON-038) | New panel *after* the sidebar; the sidebar stays: [A, Conn] → [A, Conn, Cit], 37/26/37 | TextRange.jsx:459-480 → ReaderApp.handleCitationClick :1077-1088 |
| D | **Dictionary entry** (Lexicon) | **Nothing** on the live site (VERIFIED 2026-10-06; the code path to "like A" exists but is not wired in multi-panel) | LexiconBox.jsx:285-297 |
| D′ | Citation inside a dictionary entry | Like C: new panel after; the sidebar stays — **VERIFIED**: `…&with=Lexicon&lang2=bi&p3=Genesis.1.1&lang3=bi&aliyot3=0` | LexiconBox.jsx:285-297 |
| E | **Version "Open Text" / "Open"** (Translations, Versions list) | Like A, but the panel opens *in that version* | VersionBlockWithPreview.jsx:11-45, VersionsTextList.jsx:59-88 |
| F | **"Compare Text"** tool | **The sidebar becomes a library browser in compare mode**: compact header with search and back, then categories, then a book's contents. Choosing a section turns it into a text panel. Closing it (×/Esc) puts the sidebar back (Resources). URL `p2=texts`. **VERIFIED live** (URL, 979+461). Desktop only. | ConnectionsPanel.jsx:336,693 → ReaderApp.openComparePanel :1830-1839; convertToTextList :1990-2006; TextsPage.jsx:69-74; ComparePanelHeader.jsx |
| F′ | Search inside the compare panel | Results in the panel; a result replaces the compare panel with the text (commentary → base + sidebar) | ReaderPanel.jsx:463-468; ReaderApp :1102-1105 |
| G | "Add Connection" with one text open | Opens the compare panel (then connect mode) | ReaderPanel.jsx:554-556 |
| H | Version **"Select"** | The source panel switches version (no new panel) | ReaderApp.selectVersion :1639-1662 |
| I | Table of contents / Search in this Text result | The source panel goes there (no new panel) | navigatePanel :1663-1686; handleSidebarSearchClick :1106-1116 |
| J | Sheets, topics, web pages | New browser tab (sheet items inside a TextList turn the sidebar into a sheet panel: deferred with Voices) | ConnectionsPanel.jsx:662-672,883 |

In the text panel itself:

| # | Action | Legacy result |
|---|---|---|
| K | Citation in the text | Closes panel n+1 (any kind), then opens the cited text at n+1; a commentary ref opens as base text plus its commentary sidebar (:1077-1088, 1762-1767) |
| L | Close (×) / Esc | The panel's sidebar closes with it, panels to the right shift left, and closing the last panel goes to the library (:1955-1989) |
| M | Segment click | Opens or updates its sidebar at n+1, keeping its mode and filter; the sidebar follows scrolling (:1052-1065, 1876-1886) |
| N | Language toggle | Each panel has its own language; new panels inherit the last language set (cookie) (ReaderPanel.jsx:530-549) |
| O | Back / forward | Restores the whole layout of that history entry (:316-354) |

On phones (single panel): A, D and E replace the one panel; K replaces it (history is replaced, a quirk); Compare Text is hidden.

## 2. Where this client is (survey, file:line in sefaria-reader)

Already in place:
- **Model and URL codec:** `src/lib/workspace` has ops `openNextTo`, `replace`, `close`, `openAside`, `closeAside` and `move`, a layout tree, legacy widths (68/32, 37/26/37, 360px minimum with scrolling), and `p/w/lang/ven/vhe/vside/lookup/sbsq/namedEntity{n}` read and written. Unit-tested.
- **K (citation in text)**, L (close), M (segment), I (TOC, search in text) and H (Select) are built.
- **e2e:** `e2e/panels.spec.ts` covers widths, a citation opening `p2`, close, six panels and the phone fallback. `history.spec.ts` covers single-panel back and forward.

Gaps:

| Legacy | This client today | Gap |
|---|---|---|
| A "Open" | `openTextHere`: **this panel goes there** (TextPanel.tsx:245-248). The atlas (CON-033) and e2e `history.spec.ts:50-65` assert the wrong behaviour. | Wrong behaviour; atlas wrong |
| TextList title link | A bare router link (TextList.tsx:73-76): leaves the workspace and drops the other panels | Wrong |
| C citation in sidebar text | Not wired: `<TextList>` gets no `onRefClick` (ConnectionsPane.tsx:536-552) | Missing (CON-038) |
| D dictionary entry | Opens a new panel *beside* and keeps the sidebar (onOpenRef = onRefClick) | Wrong |
| E version "Open Text" | `onOpenTranslation` moves *this* panel (TextPanel.tsx:373-376) | Wrong |
| F/F′/G Compare Text | Not built: `showCompare` is never passed, and "Add Connection" is sign-up gated. Panel kinds are text only (types.ts:48). | Missing (SHL-037/038, CON-066, LIB-003/018, BOK-004, SRC-025/026) |
| N inheritance | A new panel uses stored settings, not the source panel's `lang` | Missing (SHL-010) |
| O multi-panel back/forward | Untested | Tests missing |
| Panel identity | `decodeWorkspace` renumbers by position, but `openNextTo` takes the lowest free id. After opening from a non-last panel, the URL round-trip renames panels, so the `{nav:"go", panel}` target and React identity point at the wrong panel (ops.ts:22,39; url.ts:64-67) | Bug, foundation |

## 3. Decisions (recommended; owner to confirm the starred ones)

1. **Reproduce:** A, C, D, D′, E, F, F′, G, K, L, N and O as on sefaria.org, including URLs that legacy can load.
2. **OWNER DECISION 2026-10-06: exact sefaria.org behaviour for citations (K).** A citation in panel n closes whatever panel is at n+1
   (its sidebar, or a text panel the reader opened) and opens the citation there (ReaderApp:1080-1083).
3. **OWNER DECISION 2026-10-06: legacy URLs are kept, read and written exactly.** The old site numbers panels by position in its
   panel list, where a sidebar takes a slot but is written into its own panel (`with`/`w{n}`):
   `[A+sidebar]` → `?with=all&lang2=en`; `[A, B]` → `?p2=B&lang2=bi`; `[A, B+sidebar]` → `?p2=B&w2=all`;
   `[A+sidebar, B]` → `?with=all&p3=B` (2 is skipped: the sidebar's slot). This client reads every form (old links and bookmarks
   open the same layout) and writes byte-for-byte what sefaria.org writes, including the skipped number. (The old server drops
   `p3` on reload, ReaderApp:869-883 vs views.py:859-864; once this client serves those URLs that no longer matters.)
   Enforced by tests: the parity script compares the URL after every step with sefaria.org's, and every URL it records becomes a
   unit test (decode → encode gives the same string).
4. Commentary opened by "Open" stays itself (not converted), as on the live site. A citation still converts (K).
5. Not reproduced: mobile citations replacing history (pushed instead), the misplaced companion sidebar (ReaderApp:1801-1803), and the `navigatePanel` / `selectVersion` crashes and bugs (§8 of the legacy spec).
6. Out of scope here: sheets in panels (Voices), drag/reorder and stacking (the model supports them; no UI).

## 4. Steps (each: tests first, then code, then atlas)

**Step 0: Parity harness and live facts (no product code).**
- `scripts/parity-panels.mjs` runs one scenario on sefaria.org and on this client. After every step it records the URL, the number of panels, the left offset and width of each, its title, and which panel has a sidebar. Scenarios cover A to G, K, L and O at 1440×900, plus a phone User-Agent.
- Probe the live URL forms we have not seen: [A+sidebar, B], [A, B+sidebar], compare panel browsing (`p2=texts/Tanakh`?), a version opened with E (`ven2`?), and a dictionary entry with D. Record them as atlas VERIFIED facts.

**Step 0 progress (2026-10-06).** Live facts recorded (scripts/probes/multipanel-probe2.mjs), all VERIFIED on sefaria.org:
`[A+sidebar, B]` → `/Genesis.1.1?lang=bi&with=all&lang2=en&p3=Exodus.1&lang3=bi&aliyot3=0`; `[A, B+sidebar]` →
`…&p2=Exodus.1.1&lang2=bi&aliyot2=0&w2=all&lang3=en` (the sidebar's language takes the next number); a citation in A replaces B,
and a second citation replaces the first; Compare Text → `p2=texts` → `p2=texts/Tanakh` → `p2=Exodus&tab2=contents` → chapter
`p2=Exodus.2` (68/32 → 50/50); a translation's "Open Text" → `p2=Genesis.1.1&ven2=english|<title>&lang2=bi&aliyot2=0`; `aliyot=0`
is written for Torah panels except panel 1 while its sidebar is open. A dictionary entry click does nothing; a
citation inside an entry opens after the sidebar (p3). The compare library page has no close/back control (search and display
options only). Corpus: `src/lib/workspace/legacy-urls.ts`; `legacy-urls.test.ts` round-trips each URL —
11 exact today, 5 expected failures, each tagged with the step that fixes it. `scripts/parity-panels.mjs` compares sefaria.org and this client step by step (URL, boxes and widths,
sidebars) for 8 scenarios.

**Step 1a done (2026-10-06).** The URL is written as sefaria.org writes it: encodeWorkspace is a port of makeHistoryState's
URL assembly (a sidebar takes a number slot; lang<k+1> for a later panel's sidebar; panel 1's aliyot dropped while its sidebar
is open), defaults filled from the reader's settings (`lang`, `aliyot` for the Torah, the sidebar's language — `en`/`he` when the
reader opens it, `bi` for an old link without `lang2`). The address is rewritten on arrival with `history.replaceState` (same entry
and state, no re-render), after TanStack's deferred pushState. Server redirects keep the request's query (VERIFIED: /Gen.1.1?lang=en
→ /Genesis.1.1?lang=en). parity-panels: every arrival and sidebar step equals sefaria.org; what differs is the behaviour of
Steps 1b–4.

**Step 1 done (2026-10-06):** URLs exact (1a), ids follow position (`renumber`, `openNextToWithId`), new panels take the reader's
default language (SHL-010, verified), and citations behave exactly as sefaria.org (1b; parity-panels equal for both citation
scenarios). Full suites green except `scroll.spec.ts:124` at 1280px, which already failed before this work.

**Step 1: Foundation.**
- Panel ids follow position, as the URL does: ops renumber, and the `go` target names the new panel's final id. Unit tests: the round trip is identical after opening from p1 of [p1, p2], after closing p1, and after replacing.
- Codec: write exactly the legacy numbering (a sidebar takes a slot; `p3` after `[A+sidebar]`), read every legacy form. Unit tests
  from the URL corpus recorded in Step 0 (decode → encode round-trips byte for byte).
- New-panel settings inheritance (N, SHL-010): a new panel takes the source panel's language. Unit test plus e2e.

**Step 1b: Citation in the text (K) exactly as legacy:** close panel n+1 whatever it is, open the citation there. e2e for [A, B]
(B is closed), [A+sidebar, B] (sidebar replaced, B kept), [A] (inserted).

**Step 2: "Open" from the sidebar (A, D, E, title link; corrects CON-033).**
- One op, `replaceAsideWithPanel(ws, p, newPanel)`, closes p's sidebar and inserts the new text panel right after p. It carries the language rule (bilingual if p is bilingual) and, for E, the version.
- e2e: Genesis 1:1 → Rashi → Open gives `p2=Rashi_on_Genesis.1.1.1`, 50/50 widths, p1 highlighted with no sidebar, then Back restores. Same for the dictionary entry and a translation's Open Text (with `ven2`). The title link behaves like Open. Phone: the panel is replaced.
- Fix `history.spec.ts:50-65` and the atlas entries CON-033 and SHL-056.

**Step 3: Citations inside the sidebar (C, D′; CON-038).**
- `TextList` and Lexicon entries get `onRefClick` and open the citation after the source panel, keeping the sidebar ([A+sidebar, Cit], 37/26/37 rule). e2e on a commentary with a citation (to be found in Step 0).

**Step 4: Compare Text (F, F′, G).**
- A new panel kind `compare` (SHL-029, partial now) with menu pages that reuse the library home, category and book contents components in compact compare mode: ComparePanelHeader with search and back (LIB-003, LIB-018, BOK-004, SHL-037).
- Opening replaces p's sidebar with the compare panel (URL `p2=texts`, 68/32). Choosing a section makes it a text panel. Close/Esc gives the sidebar back (Resources).
- Search inside it (SRC-025/026): a result replaces the compare panel, and a commentary result becomes base text plus sidebar.
- "Add Connection" with one text open goes to compare; the sign-up gate stays for signed-out readers if legacy does so. Check in Step 0.
- Show the Compare Text row on desktop only (`showCompare`), and send `compareOpened` analytics (ANL-009).
- e2e for each, plus the parity scenario.

**Step 5: History, keyboard, focus (O, L).**
- e2e: back and forward across open, compare, choose and close sequences restore every panel, its sidebar and scroll. Esc in a compare panel restores the sidebar. A new panel takes focus and is scrolled into view.

**Step 6: Close-out.**
- `parity-panels.mjs` equal to sefaria.org for every scenario, desktop and phone.
- Atlas entries updated and verified (CON-033 corrected, CON-038, CON-066, SHL-010, SHL-029, SHL-037, SHL-038, SHL-050, LIB-003, LIB-018, BOK-004, SRC-025, SRC-026).
- `docs/WORKSPACE.md` brought back in line with the code (survey found drift: `openAfter`, `legacySizes`, a registry that does not exist). CHANGELOG, artifact republished.

## 5. Tests that exist in the legacy repo (to mirror)

Legacy Playwright (Sefaria-Project `e2e-tests/`): DW-006b ("Open" gives 2 columns and `p2=`), DW-007 (sidebar follows scroll), DW-018 (closing
the sidebar keeps the place), RP-001–006, RP-021–022 (TOC), RP-041–044 (versions), RP-050–058 (Lexicon), RP-060–063, RP-071
("Open" changes the URL), RP-180/181, MW-008/009/018 (phone). Legacy has **no** tests for Compare Text, citation-opens-panel, three or
more panels, closing a middle panel, `p3`/`w{i}` URLs, or multi-panel back/forward — ours will.
