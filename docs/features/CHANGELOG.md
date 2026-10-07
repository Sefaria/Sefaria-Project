# Feature Atlas changelog

The atlas (`features.json`) is the source of truth for the rebuild. Whenever building or testing the new reader shows an entry is wrong, incomplete or missing, the fix goes into the atlas and is logged here, newest first. Claims marked *verified* were checked against www.sefaria.org with Playwright on the date given.

Statuses added for the rebuild: `rebuild-only` marks behaviour the new reader has that the old client did not, so the atlas also describes what we ship.

## 2026-10-04 — scrolling, highlight and URL tracking

### Corrected
- **TXD-050** Highlighting of selected segment(s): the blue highlight is visible **only while the connections sidebar is open**. A verse or range link alone scrolls to the verse without a highlight. The `highlightedRefs.length > 1` branch never shows a whole range in practice, because the range URL collapses first. *Verified.*
- **TXD-055** Visible-ref tracking: the URL follows the reader **to segment level** (`/Genesis.1.3` → `/Genesis.1.8`) whether or not the sidebar is open; a section URL stays section-level until the reader scrolls; a range URL is replaced by its first segment about 1s after load. Summary rewritten; the focus rule's measurement origin documented. *Verified.*
- **TXD-053 / TXD-054**: noted that the old client paints the chapter top first and then jumps to the linked verse after hydration, and that it let native scroll anchoring run alongside its own correction. *Verified.*

### Added
- **TXD-067** Current-segment highlight follows the reader (core). With the sidebar open, the highlight and the sidebar's content move with the reading position. It was previously one clause inside TXD-055, which is how the first rebuild pass missed it. *Verified.*
- **RTE-064** Query parameters rewritten on load (`aliyot=0` on Torah pages, `lang2` with the sidebar). Tier `retire`: documented, deliberately not ported. *Verified.*
- **TXD-068** (`rebuild-only`) Jump-free reading: place keeping through prepends, reflows, the sidebar opening and font changes; linked verse in place from the first visible frame; focus moves only with the reader.
- **TXD-069** (`rebuild-only`) Neighbouring sections preloaded with the page.

### Test tags fixed (mislabelled in the rebuild, not atlas errors)
Early tests and components were tagged with IDs written from memory; most pointed at different features. All tags were re-checked against the atlas by name. Examples of what was wrong, so the pattern is not repeated:
- URL canonicalisation tagged `RTE-010` → is **RTE-027** (Ref URL normalization) and **TXD-014**.
- Link filtering tagged `CON-004` / `CON-025` "filter semantics" → is **CON-027** (filter matching), **CON-029** (filter mirrored to link dots), **CON-071** (related data API and caching).
- Connections summary tags re-pointed to the precise entries: **CON-019** categories, **CON-020** zero-count commentators, **CON-021** ordering, **CON-023** Quoting Commentary merge and collapse to 4, **CON-024** essays.
- Rule since then: look an ID up by name in `features.json` before tagging; `npm run features:coverage -- --unknown` catches IDs that do not exist (not IDs that point at the wrong feature).

## 2026-10-04 — multi-panel URLs (verified)
- **SHL-066** BUG added: the old client numbers `p{i}` by the flat panel array (sidebars included), so `[Text+Connections, Text]` becomes `?with=all&p3=…`, and the server stops at the first missing `p{i}` — reloading drops the third panel. `lang2` is also overloaded (panel 2's language and the first sidebar's language). The rebuild writes sequential numbers the old server can read and accepts gaps when reading.
- **SHL-039** widths verified at 1600px: 37/26/37 for Text·Connections·Text, even 400px for four panels.

## 2026-10-05 — panels and phone sidebar
- **RTE-044 / SHL-061** (verified on sefaria.org, iPhone 13): on phones the sidebar is a sheet over the bottom 54% of the screen (old `.singlePanel .textList { position: fixed; height: 54vh }`), with the text still scrolling behind it and the selected verse readable above. The rebuild had shown it full screen; fixed.
- **RTE-044** query encoding: the old server (Django) reads `+` in a query as a space, so `with=Commentary+ConnectionsList` means "Commentary ConnectionsList". The rebuild briefly treated `+` as a literal separator; fixed (spaces are written as `+`, a literal plus as `%2B`).
- **SHL-039** widths verified end to end in the rebuild (37/26/37 at 1600px).

## 2026-10-05 — commentary links (verified)
- **RTE-063 / TXT-015 / SHL-045** corrected: the commentary → base text conversion happens only when a commentary ref is opened from inside the app (citation, link, search). A direct page load (`/Rashi_on_Genesis.1.1.4`) reads the commentary as its own text. Section-level refs (`Rashi on Genesis 1:1`) and non-commentaries never convert. Summary rewritten; verified examples added.

## 2026-10-05 — Resources home (verified)
- **CON-071**: connection counts include sheets from library-listed collections (`with_sheet_links=1`); without them the rebuild showed Commentary (957) where sefaria.org shows 958. Fixed and documented.
- **CON-015**: the live Tools list on a single-text page has no Compare Text; recorded.
- **CON-013 / CON-014**: verified counts and rows for Genesis 1:1 recorded; the rebuild now matches them row for row.

## 2026-10-05 — Translations sidebar (verified)
- **VER-009**: language buckets come from the "[xx]" title suffix else `language`; the API's `actualLanguage` yields different groups (18 English instead of 14). Recorded so the rule is not "simplified" later.
- **VER-011**: the old Select link sits inside the disclosure's `<summary>` (nested interactive controls); the rebuild moves it beside the disclosure. Noted as an intentional difference.
- **VER-012**: BUG recorded — the old Select href repeats `ven` and drops the language family.

## 2026-10-05 — back/forward (verified)
- **RTE-054**: BUG recorded — on sefaria.org selecting a verse pushes two history entries (the second only appends `lang2`), so one Back does not close the sidebar. The rebuild pushes one.
- **RTE-055 / SHL-064 / SHL-065**: verified that the text column's scroll position is restored on Back/Forward; the rebuild's mechanism (segment + offset per panel per entry) documented.
- **SHL-064**: a rebuild bug (column stayed on the replacing text after Back) found and fixed with a test.

## 2026-10-05 — version preferences (verified)
- **VER-014**: resolution order verified with cookies on the live site; the unknown-version behaviour of the v3 API (200 + warning, translation silently dropped) recorded, since it forces validation.
- **VER-002**: corpus = `corpora[0]`; session cookie; preference stored under `en` even for non-English translations. Rebuild's cookie lasts a year (intentional difference).
- **VER-003**: corrected — choosing a translation always makes the panel bilingual (the rebuild had only switched Hebrew-only panels).

## 2026-10-05 — reader header (verified, 16 texts × 3 languages)
- **TXD-013 / VER-005 / TXT-009**: title language follows the version on screen (so Zohar in English has a Hebrew title); the version line is hidden in Hebrew-only mode; the William Davidson attribution shows in every mode, unlinked, with the version in parentheses. The rebuild's earlier header (interface-language title, always-on version) differed on all of these; now 16/16 identical.

## 2026-10-05 — Translation Open (verified)
- **VER-013 / VER-010 / SHL-052**: preview anchors and the rewritten `vside=<title>|<lang>` form documented (both are read); the view's contents and request recorded. The rebuild adds no request (it reuses the list).

## 2026-10-05 — About this Text (verified)
- **CON-039 / VER-006**: layout, strings and data sources verified for a Tanakh book, a Talmud tractate and a commentary. Corrected the picture of "current version": it only exists once `vhe` is set; selecting a source version always switches to bilingual and is not remembered (no cookie), unlike translations.
- **VER-006**: the source list is `isPrimary` versions, and the same-titled English edition stays in it for Rashi (language slot differs) — a rule that is easy to "simplify" wrongly.
- **VER-006**: the Select Version control has no href on the old site; the rebuild uses a real link.
- **BOK-022 / VER-008 / VER-016**: details recorded.

## 2026-10-05 — dictionary lookup (verified)
- **CON-042**: BUG recorded — after the first selection the live URL keeps the first word's `lookup=`. Also: one history entry for the first lookup, none for later ones; 4+ words and a closed sidebar do nothing. "Clearing the selection returns to Resources" could not be confirmed.
- **CON-043**: the exact request, the category filter and a quirk not ported (any selection with a space was looked up).
- **CON-044**: text identical to the live site for three words; two old-markup bugs and the BDB citation-class inconsistency recorded.
- **TXD-057**: the click at the end of a selection is ignored; selection text excludes numbers, dots and footnotes.

## 2026-10-05 — Topics, Manuscripts, Torah Readings, Web Pages (verified)
- **CON-013 (correction)**: the Translations count is per VERSE, not per section (Berakhot 2a:1: 5, not 6). My earlier "46 = 46" check on Genesis 1:1 hid it. The rebuild had the wrong number until compared on a Talmud verse.
- **CON-014**: the Web Pages row has no number until its pages are loaded; recorded and matched.
- **CON-046 / CON-060 / CON-059 / CON-052 / CON-053 / CON-054**: lists, orders and strings verified; old bugs in the audio view (endless 'Loading…', Hebrew label typo, relative icon path) recorded and not copied.
- **Vendored toolkit**: the websites contract rejected the real response (null authors/articleSource); fixed and documented.

## 2026-10-05 — Table of contents in the sidebar (verified)
- **BOK-017 (correction)**: the structure toggles carry `tab=<Struct>` in their href but a click does not change the URL — the atlas said it did.
- **BOK-008**: a TOC click keeps the sidebar on the contents (the `close()` in the code does not close the sidebar). **BOK-009**: Genesis 2:3 marks two places (chapter 2 and aliyah 1).
- **BOK-010**: aria-hidden focusable headings recorded as an old bug; the Haggadah's depth-1 nodes are plain title links; top level is never collapsed.
- **BOK-015 / BOK-018**: Berakhot (chapters with shared dafs), Genesis (isTorah by title), Zohar Essay verified text-for-text.
- **BOK-012 / BOK-013**: ported with synthetic tests only (no recorded book exercises them).

## 2026-10-05 — Search in this text (verified)
- **SRC-094**: three POSTs per query on the live site (two throwaway ones) recorded; 'Dicta-merged Hebrew queries' claim corrected (no such merge); exact strings recorded; live's stale '0 results.' flash noted.
- **SRC-094 (rebuild fact)**: the search API's CORS preflight rejects application/json — a cross-origin client must POST text/plain. Found when the first e2e showed no results.
- **SRC-095 / SRC-096 / SRC-097**: sbsq per panel, result grouping by version_priority, click behaviour, path-filter response shape verified; text identical to the rebuild for two queries.
- **PRM-001 / RTE-059**: probe notes (the interrupting overlay blocks clicks; geo redirect to .org.il with a Hebrew interface).

## 2026-10-05 — Share and Feedback (verified, nothing sent)
- **CON-061**: Share/Feedback do not touch the address on the old site and cannot be deep-linked (`with=Share` is read as a filter); the rebuild makes them deep-linkable. Old a11y bug: copy button named 'Copy Link to Sheet'.
- **CON-067**: all strings in both languages recorded; the old failure path leaves 'Feedback sent!' up; production CORS for the feedback endpoint unverified on purpose.
- **SRC-094**: the Hebrew strings for searching / loading more corrected from the interface file (had been guessed).

## 2026-10-05 — signed-out tools and the sign-up modal (verified)
- **GUI-004 / CON-011**: the modal's words for Notes and Add to Sheet, the two-row Advanced list, the unchanged address bar; Hebrew strings; the old modal's a11y gaps. Rebuild links to the old account pages until the owner decides on sign-in.
- **CON-048 / CON-055 / CON-062 / CON-065**: marked partial (modal only).

## 2026-10-05 — text parity run (36 texts x bi/he/en, `scripts/parity-text.mjs`)
- First run: 74 of 108 identical; after fixing and fixing the harness: all 108.
- **TXD-045 (correction)**: Hebrew segment numbers have no geresh (Psalms 119: טו, טז); a Hebrew *translation* alone (Zohar, English mode) is numbered in Hebrew; the old "heOnly shows English numeral" holds only for a Hebrew primary beside a translation.
- **TXT-025**: Philo / Teshuvot in Hebrew mode become bilingual (English text, English numerals); Peri Megadim in English mode behaves as Hebrew; Arukh HaShulchan: empty translation entry → blank row, past the end → Hebrew.
- **TXD-025**: mis-nested markup in stored text (Ramban) is repaired like the browser does, or a footnote's tail leaks. The atlas did not know the data contains such markup.
- **TXD-028**: page markers differ in DOM, equal visually.

## 2026-10-05 — pixel parity of the text (17 texts x desktop/phone)
- **TXD-060**: the live Hebrew face is Taamey Frank CLM (the library theme puts it before Cardo); the rebuild had Heebo because a `:lang(he)` rule overrode the text face on nested elements. Citation link style recorded.
- **TXD-061**: panel < 730px gets 26px extra padding each side (text x=56…334 at 390px); the rebuild had none. Computed sizes recorded.
- English face: Cardo vs Adobe Garamond Pro (licensed) — owner decision.

## 2026-10-05 — copy, translations banner, continuous numbers
- **TXD-001 / TXD-058**: live clipboard output captured (copy listener) and reproduced: clean text per version, no numbers/dots/markers/links, no citation.
- **TXD-064**: the "Want to change the translation?" strip verified (strings, cookie, destination URL incl. a stray `aliyot=0`) and built. **TXD-063** deferred (needs country header + accounts).
- **TXD-046**: gutter geometry for continuous Talmud verified; the old collision fix puts numbers over the text — the rebuild steps them outward instead.

## 2026-10-05 — a rebuild bug found through the parity work
- Scrolling fast to the top of a text restarted the column at its first page (a visible jump). Cause: the panel reset its record of the sections the column holds on EVERY render of a history entry that carries no `nav` state (the first one), not once per entry; it only showed when Taamey Frank made the page scroll fast enough to reach the top before another render. Now decided once per history entry (`TextPanel`), and the column reports its sections in a layout effect. The Talmud smoothness test that had flaked for a day was this bug.

## 2026-10-05 — Phase 4 shell: header, mobile menu, skip link, cookie notice, interface language
- **GUI-002/003/009/010/011**: live header and mobile menu structure read off the DOM (labels, links, aria names, breakpoint 842/900px); the desktop header is hidden while reading on a phone.
- **RTE-034**: the language switch route, with an open-redirect guard the old route lacks. **GUI-007**, **I18-002**, **SHL-071** verified/built.
- The e2e suite needed a taller desktop viewport (900px): header + header strips take ~180px of 720.

## 2026-10-05 — named entities, panel errors, focus
- **CON-045 / TXD-022**: click on a highlighted name → Lexicon sidebar with the topic (request, params, ambiguous names, strings verified). Entity links in text now point at the library's topic page (this client has none) — before, a plain link to /topics/… was a 404.
- **SHL-035**: the old error words recorded; **SHL-040**, **I18-003** built; Escape (SHL-071) done earlier.

## 2026-10-05 — book pages (verified, 12 books)
- **BOK-001 / TXT-023**: a bare book name is the book page (`Ref.is_book_level`); the rebuild had wrongly opened it as a text. Main-column text identical to sefaria.org for 12 books (`scripts/parity-book.mjs`), including the Davidson credit. Notes on layout, tabs, portions recorded.

## 2026-10-05 — library home and category pages (verified, 25 pages)
- **LIB-001 / LIB-008 / LIB-009 / LIB-011 / LIB-012 / LIB-015 / LIB-016 / LIB-017**: main-column and sidebar text of 25 pages identical (`scripts/parity-library.mjs`), including nested sections, short descriptions, shortened titles, toggles, About / Visualizations / Weekly portion / Daf Yomi modules and the footer. Geometry (665px column, 420px sidebar) recorded.
- **LIB-011**: the About module follows the ORIGINAL path (Tosefta alone vs Tosefta/Lieberman) — the source and the live site agree once that is read carefully; the toggle labels render upper-case.
- The CMS promo slot and the "Live Webinar" module are marketing content (Strapi) and are not rebuilt.

## 2026-10-05 — search results page and header autocomplete
- **SRC-001…016 / SRC-039…066 / SRC-085**: the header autocomplete (name API, groups, smart submit) and the Sources results page (tabs with counts, All/Exact, sort, folded versions, filter tree, Books/Authors/Topics tabs, infinite scroll) built from the live requests and bodies; recorded in the atlas. Mobile layout, Hebrew keyboard, dictionary box and term highlighting after a result click are still open.

## 2026-10-05 — search bookkeeping
- Search entries that describe the server API, dead code or old-site bugs are marked n/a / replaced; Compare, Phase 7 and analytics items deferred with reasons. **SRC-087**: the old Hebrew-filter bug is not ported, but our box does not yet match Hebrew titles (open).

## 2026-10-05 — matched words highlighted after a search click
- **SRC-058 / TXT-027**: built for the search page and the sidebar search; terms in history state, never in the URL (the `qh` parameter is dead). Highlight uses a box-shadow instead of the old padding so clearing it never reflows the line.

## 2026-10-05 — Books / Authors / Topics tabs
- **SRC-068 / 069 / 070 / 071 / 072**: the entity cards (icon, crumbs, date · author, description), the sort dropdown per tab and the Books category filter built from live requests. Sort and filter are not in the URL on sefaria.org either; the Books badge follows the filter. I had earlier tagged SRC-070…072 as done on the strength of a bare list — they are only done now. Topic crumb (needs the topic TOC) is open.

## 2026-10-05 — search on a phone
- **SRC-049 / 062 / 063 / 024**: tab strip, one Sort & filter button and the full-screen panel per tab, probed live at 390px. Show Results is pinned to the bottom of the panel (live puts it after the last filter, 4,700px down).

## 2026-10-05 — scripts/parity-search.mjs
- New script compares the live search page with the rebuild (tabs, cards, filters; desktop and phone). It found, and the rebuild now matches: the commentary/Targum roots in the filter tree order (**SRC-083**), the no-results states per tab (**SRC-064**), no footer under the filters (**SRC-043**), whole-card links, description clamp/hidden on phones and collapsing crumbs (**SRC-072**).
- **SRC-082 (new finding)**: Hebrew "All Results" on sefaria.org merges Dicta's Tanakh index — the Hebrew query is sent to a third party. Not built; owner decision. Known remaining differences: parent-topic crumb on Author/Topic cards (needs the topic TOC, which exists only embedded in the site's pages).

## 2026-10-05 — Hebrew on-screen keyboard
- **SRC-017**: verified live (header box only, English interface; the results-page box has none) and built with the old Hebrew layout. The 90-layout menu is out of scope.

## 2026-10-05 — dictionary boxes; commas in addresses
- **SRC-020 / 021 / 022**: the dictionary word box (completions from /api/words/completion, Hebrew keyboard, invalid-entry message) on dictionary book pages, in the sidebar's contents and search views, and in the Lexicon sidebar. Verified live: Enter/choose sends the vowelled *form*.
- **RTE-026 (found while testing)**: client navigation encoded commas in titles as %2C; the old site keeps them. Fixed in the router config.

## 2026-10-05 — search: loading, errors, Hebrew filter box
- **SRC-050 / 065 / 087 / 060 / 044 / 109**: skeleton while the first query runs, errors said out loud with Try again (the old client shows "No sources found" for a failure), the filter box matches Hebrew titles, touch pressed state, cache behaviour tested.

## 2026-10-05 — Phase 6 closed
- Search area: 67 done, 21 deferred (Compare Text, Phase 7, analytics, Dicta, browser integration), 19 n/a (server/dead), 1 replaced, 2 partial (topic crumb; SRC-094 closed afterwards). `scripts/parity-search.mjs`: all tabs equal to sefaria.org except the Author/Topic parent crumb. `docs/PHASE7_PROPOSAL.md` and `docs/OWNER_QUESTIONS.md` written.

## 2026-10-05 — hardening: phone UA, Save, banner
- Re-probing the reader with a **phone User-Agent** (all earlier phone checks used a desktop UA at 390px, which sefaria.org treats as a narrow desktop): text column padding is 34px (we had 56), the panel header has a menu button instead of Close (**SHL-062**), and both phones and desktop have a **Save** bookmark that opens the sign-up modal (**SHL-074**, was missing). The translation banner's colours, sizes and position were off (**VER-004**) and are now measured values.
- Tags added to existing tests for items that were built but counted as todo (TXT-001/014/016/019/020, RTE-009/029/045/048, BOK-019, TXD-029).
- **Book pages (found by comparing screenshots, not text — text parity had hidden all of this)**: the edition credit, Start Reading, group titles and chevron were off; the sidebar lacked Author/Composed (**BOK-006 / LIB-036**); the aleph language button was missing on home, category and book pages (**LIB-002**); on a phone the site header was wrongly hidden on book pages and the About text belongs under Start Reading (**BOK-002**), the home page carries the About blurb (**LIB-004**). Category pages on a phone use a longer description (**LIB-008**, open).
- **Site header (GUI-003)**: positions and sizes measured on sefaria.org and matched; its dropdown menus were opening *behind* the reader's sticky panel header (found when the new Save button put a control under the language menu) — fixed.
- **Sidebar (CON-003 / 070 / 016)**: marked done but visibly off: no language button (aleph/ayin → `lang2`), header grey/size, tool rows serif instead of sans with letter-spacing, 44px instead of 41px row pitch. Measured and rebuilt; the lesson again: a text diff does not see any of this — screenshots and computed styles do.
- **Display menu (TXD-041 / 031)**: rebuilt to the live structure (radio rows, icon tiles, circled font-size buttons, 46px switches, new order); 'Both' became 'Source with Translation'. The unused Stepper was deleted.
- **Sidebar views (BOK-009, VER-009/010)**: Table of Contents tiles and the Translations list restyled to measured values (white serif tiles with the place filled; one-line version meta).

## 2026-10-06 — legacy fonts (owner decision)
- **TXD-060**: English text is now Adobe Garamond Pro from Sefaria's own Adobe Fonts kit, as on sefaria.org. The cause of the old difference was not the stack (it already matched) but Cardo's range: legacy declares Cardo for Greek only; the rebuild gave it all of Latin. **TXD-061**: a translation alone is black and justified, beside the source #666 left — found while checking the fonts.

## 2026-10-06 — Dicta merge (owner decision)
- **SRC-082** built as on sefaria.org (a faithful port, including the old scoring quirk so the order matches); parity script identical for relevance, chronological and filtered Hebrew searches.

## 2026-10-06 — served in the cluster (owner decision)
- **PLT-003**: the client replaces the legacy Node server in the node pods; nginx sends page requests to it first, it reads the API through Varnish and passes Django's pages, writes and its own 404s on (Sefaria-Project branch `reader-next`, `nodejs.mode`, `docs/DEPLOYMENT.md`). **PLT-002**: `/healthz-reader` with rollout probes. Verified with the rendered nginx config and containers locally; cauldron pending a push.
- **SRC-070**: the topic TOC now has a public endpoint (`/api/topics-toc`, Sefaria-Project branch `reader-next`); Author and Topic search cards show their parent category crumb from it.

## 2026-10-06 — analytics (owner decision)
- One module, `src/lib/analytics`, with the old event names and parameters; nothing calls a vendor directly. VERIFIED what sefaria.org sends on a reader page by recording its dataLayer (`scripts/probes/anl-probe.mjs`). FOUND: GTM loads a `ga` shim, so the old `Sefaria.track.event` calls still reach GA4 — ported as `uaEvent`; "Display Option Click" is dead on the old site (not ported).
- Built: GTM / gtag / Simple Analytics / Sentry from env (off in development and tests) (**ANL-014/016/017**), declarative `data-anl-*` tracking (**ANL-015**), session and impression events (**ANL-003/004/005/006/008**), reader and sidebar events (**ANL-009/011/012**), header search (**ANL-007, SRC-107**), the search page funnel (**SRC-104/105/106/108**). Not ported pending the owner: VWO, Hotjar, Unbounce. Tests assert on an in-memory event log; `e2e/analytics.spec.ts` checks nothing is sent to Google.
## 2026-10-06 — sign-in: the SSO AuthPage ported (owner decision 7-1)
- **Built**: the login / register / password-reset page (**ACC-001, 007–012**), Google One Tap (**ACC-002 / 013**), the sign-up funnel with the old event names and parameters (**ANL-013**, through a local `trackAuthEvent` → gtag seam until the shared analytics module) and its source attribution (**ANL-002**), the signed-in header and phone menu (**GUI-010 / 011 / 003**), sign-up modal links to the client's own pages (**GUI-004 / ACC-006**). `/login`, `/register` and `/password/…` left the pass-through list (**RTE-032**); the emailed reset link is handed to Django first.
- **Added**: **ACC-016** (rebuild-only) — who is signed in, known at first paint (allauth session + `/api/user_stats/<id>?quick=1`, cookie forwarded during SSR).
- **Corrected**: **API-012** — `GET /api/profile` without a slug is a 404 for everyone (verified live anonymous; code for signed-in), not "self". **ACC-008** — the card heading is Roboto 40px/400 (30px on phones), not serif (verified live).
- **Verified 2026-10-06** on www.sefaria.org at 1280×900 and Pixel 7: the auth page's colours, sizes and every control's position (the rebuild matches to the pixel; asserted in `e2e/auth.spec.ts`); page titles (English and the Hebrew site); allauth's anonymous session answer and its csrftoken cookie; Django's answer to an invalid reset token (a page, not a redirect).
- **Bugs recorded**: **ACC-011** — "Request New Link" for a link with no account lands on the choice instead of Forgot Password (code reading; not reproducible without a real reset link). Fixed in the rebuild.
- **Rebuild differences**: CSRF from the last `csrftoken` cookie (no meta tag) with an allauth bootstrap GET; reset-link validity asked by a side-effect-free probe; visible focus ring on inputs; the phone page scrolls instead of an inner box.

## 2026-10-06 — multi-panel parity, Steps 0–1 (docs/MULTIPANEL_PLAN.md)
- `scripts/parity-panels.mjs` runs the same clicks on sefaria.org and here and compares the address, the panels and their widths after every step.
- **SHL-066 / RTE-049 / RTE-043**: URLs are now read and written exactly as sefaria.org (owner decision), including its numbering (a sidebar takes a number slot: `?with=all&lang2=en&p3=…`), the defaults it writes on arrival (`lang`, `aliyot` for the Torah, `lang2`) and its quirks. A recorded corpus round-trips byte for byte. **RTE-027**: canonical redirects keep the request's query.
- **SHL-049**: a citation closes whatever is next to its panel (even a text the reader opened) and opens there, exactly as sefaria.org (owner decision). **SHL-010**: new panels take the reader's default language.
- Panel ids now follow position, as the URL does (a navigation aimed at a panel reached the wrong one after opening from a non-last panel).
- **CON-033 corrected**: "Open" replaces the sidebar with a new panel; it does not move the main panel (fixed in Step 2).
- Parity: every arrival, sidebar and citation step equals sefaria.org; left: Open / Open Text (Step 2), dictionary citations (Step 3), Compare Text (Step 4).

## 2026-10-07 — sub-pixel place keeping, useMemo dependency warning
- **TXD-068** FOUND and fixed: `e2e/scroll.spec.ts` "a linked verse is in place from the first visible frame: /Genesis.2.3?lang=en at 1280px" saw the verse move once (326 → 327). It was not the header, banner, analytics probe or fonts: Genesis 1 (3074.36px) was added above, and the compensating scroll can only move whole pixels, so the verse sat 0.36px lower and was painted a pixel down when the rounding crossed .5 (the 390px and Berakhot variants passed by the luck of their fractions). The engine now scrolls the whole pixels and puts the remaining fraction in a sub-pixel padding above the content (`use-reading-scroll.ts`, `restoreAnchor`). The verse's position is now identical to the layout unit through the prepend.
- Not an atlas change: React's "The final argument passed to useMemo changed size between renders" (seen on `/Jastrow,_אוֹר.1?lang=he&with=SidebarSearch`, and on any page that loads more sections) came from the link-count memo in `TextColumn.tsx`, which spread one dependency per loaded section. Its dependencies are now one joined key.

## 2026-10-07 — signed in: Save and reading history; "Open" opens a new panel
- **Found**: the header's Save button always opened the sign-up modal, even for a signed-in reader, and no reading history was recorded. **USL-001/009/011**: Save now saves and removes on the server (`/api/profile/sync`, as `toggleSavedItem`) and shows the saved state. **USL-002/010/012**: history is recorded as the old `saveLastPlace` (on open, on the sidebar opening, after 3 s on a new place); signed out in the `user_history` cookie. Sidebar history (CON-036) still to do.
- **CON-033 (multi-panel Step 2)**: "Open" on a connected text, and a translation's or version's "Open Text" (**VER-011**), replace the sidebar with a new panel after the reader's, exactly as sefaria.org (parity equal). A connected text's title is no longer a link (on sefaria.org it does nothing).
- **Signed-in sidebar tools** (found: every one opened the sign-up modal even when signed in): **CON-049 / USL-005 / USL-007** Notes (add, edit, delete, counted in Tools); **CON-034** Add to Sheet (your sheets, a new sheet, confirmation); **CON-065** Add Connection between the two open texts; **CON-062** Add Translation → Django's translate page. **CON-036** sidebar (secondary) reading history after 3 s on a connected text. **CON-038** a citation inside a connected text opens it beside the reader's panel, the sidebar staying. **CON-067** feedback from a signed-in reader no longer asks for an email and carries the uid.
- The Voices origin is runtime config (`PUBLIC_VOICES_ORIGIN`), so a deployment links to its own Voices (sheets made on a cauldron live there).
- Found (legacy security, not changed here): `DELETE /api/notes/<id>` has no ownership check and no CSRF; `/api/user_history/saved` returns every user's saves for a ref.
