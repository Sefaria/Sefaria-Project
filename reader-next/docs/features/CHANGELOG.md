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

## 2026-10-29 — the three-dots source note (old ToolTipped)
- **Found**: the three dots beside a topic (**CON-046**) and a named entity (**CON-045**) used the browser's `title` tooltip (a grey system box) and outline stroke dots. sefaria.org draws a white CSS card (`.tooltip-toggle::before` printing `aria-label`: 13px Roboto, #6f6f6f, 180px, beside the button) on a 22px #ededec circle with solid dots (`three-dots.svg`). Code reading of Misc.jsx:1458 / s2.css plus the owner's screenshot (Genesis 1:2, "Depths").
- **Built**: `ui/Tooltip` (the planned `Tooltip` from COMPONENT_AUDIT C, replacing `ToolTipped`) and `ui/Tooltip/SourceNote` (the dots button). TopicsView and NamedEntityView use it. It is a real button named by its tooltip, shows on keyboard focus too, and Escape hides it. Stories `Primitives/Tooltip`; `e2e/topics.spec.ts` checks the card on hover.
- **Not ported**: the `onclick_ToolTipped` gtag click event (ask the owner).

## 2026-10-29 — sidebar parity: the category book list (Mishnah Peah 4:1, `with=Commentary ConnectionsList`)
Compared side by side with sefaria.org at 1280px, `lang2=en` and `lang2=he`, by screenshots and computed styles. *Verified.*
- **CON-025 Found**: the rebuild drew the category list like the Resources rows (a book icon per row, 9px rows, no rules, the EN tag beside the whole row) and lost most descriptions. sefaria.org: no icons, 19px rows with a #E5E5E5 rule, a 4px rule in the category's colour atop each group (Commentary, Quoting Commentary), a description under every book, the EN tag at the end of the title line. Most commentaries' indexes have no description; the old `linkSummary` falls back to `getDescriptionDict`, the description of the TOC category named after the book — now ported (`tocDescription`).
- **CON-025 / CON-021 Found**: the list must follow the sidebar's language (`lang2`), not the interface: Hebrew names and descriptions only (no fallback), right-to-left, no EN tags, the Hebrew sort, and "כל הקישורים ל…" for the All row.
- **CON-020 Corrected**: zero-count commentators show no "(0)". Noted a legacy quirk not ported: on a deep link the old client caches the summary before the section's links arrive, so those rows are missing there.
- **CON-026 Corrected**: the upper-casing is the text list's title for a whole-category filter ("COMMENTARY"); a book's title keeps its case ("Bartenura"). The rebuild upper-cased every title.
- **CON-032 Found**: beside its text the old sidebar hides the commentary's verse numbers (`.multiPanel .textRange .numberLabel`); the rebuild showed them. Now phone-only.
- **CON-070 / CON-012**: the back link's light #666 type, and the Resources home's heading spacing (the rebuild drifted up to 30px by the Tools section) and colours, re-measured and matched within 1–4px.

## 2026-10-29 — the moderators' topic search (Topics view)
- **CON-047 Found** (owner's screenshot, Genesis 1:11 `with=Topics`): a moderator sees "Search for a Topic" above the Topics list on sefaria.org; the rebuild had nothing. It shows for `is_staff` only, the same check the server makes.
- **CON-047 Added detail**: the placeholder is English in every language (no Hebrew string exists), every topic is searched (no `topic_pool`), a multi-verse selection posts its range, and the POST answer is already annotated like `/api/related`'s topics.
- **Built** (`ui/TopicsView/TopicSearch`, `lib/user/topic-links.ts`): suggestions, choose, Add Topic/Enter, the "select from the dropdown" rule, the new topic joining the list and the Resources count at once. The old `alert()`s are status lines. **Not built**: the inline TopicEditor behind "Create a new topic: …" — the row links to the same view on sefaria.org. Not exercised against production (it writes); unit tests and the Storybook story cover it.

## 2026-10-29 — /texts and the site header at pixel parity (desktop 1280, phone User-Agent)
- **LIB-001 Added**: `/` answers 302 → /texts on sefaria.org; the rebuild showed a developer sample list there. Desktop geometry of the grid and the inner scroller recorded. *Verified.*
- **LIB-002 / GUI-001 Found**: on a phone the content-language toggle moves from the page into the mobile header's right slot (and the bar has no interface-language control); the rebuild had a translate icon there and the toggle in the page. *Verified.*
- **LIB-004 / LIB-023 / LIB-028 / LIB-030 / LIB-031 / LIB-037 Added detail**: sidebar spacing (34px modules, 20px under titles on desktop but 10px on a phone, 120px grey under the footer), image icons, serif language list with bullets, Taamey Frank for Hebrew inside the English serif stack, the phone's About blurb without a gap or underline before "Learn More ›". *Verified.*
- **GUI-002 / GUI-003 / GUI-009 / GUI-010 / GUI-011 Added detail**: the header's measured geometry (translateY nudge of the links, search box internals, 18px image icons 20px apart), the 843–1086px variant, and the legacy drop-downs and phone menu (card, item spacing, globe tick, module dots on the baseline, full-width phone rows). *Verified.*
- **PRM-014 / AI-001 Added detail**: the Library Assistant promo's show conditions (remote config switch, wide screens, signed out / not in the experiment, excluded auth paths) and geometry. *Verified.*
- **Built**: all of the above (`ui/LibraryHome`, `ui/NavSidebar`, `ui/NavPage`, `ui/SiteHeader` incl. `HeaderDropdown`/`MobileNav`, `ui/ContentLanguage`, `features/shell/SiteWideBanner`, `lib/shell/promo-backoff.ts`). Pixel diff against the live site ≤0.03% for /texts (desktop top/middle/bottom, phone full page), the header, its focus state, the three drop-downs and the phone menu (`scripts/parity-page.mjs`, `scripts/parity-header-states.mjs`, `scripts/parity-diff-page.py`). Not built: Recently Viewed (shows only with reading history), signed-in "Try It", the Strapi sidebar promo.
- **Deliberate difference (jump-free rule)**: the old banner mounted after the page was up and pushed everything (a linked verse included) down 104px; the rebuild renders it in the server's page (remote config read by the root loader) and an inline script applies the back-off before the first paint, so it never moves the page. Also fixed on the way: closing the last panel now goes to `/texts` (a mid-navigation canonicalize had turned it into `/texts?lang=bi`).

## 2026-10-29 — category pages at pixel parity (desktop 1280, phone User-Agent)
- **LIB-008 Added detail**: the measured grid, and the two grid kinds — inside a section (no item padding) and outside one (the old `.gridBoxItem`'s 5px top/bottom padding, rows 16px apart). The phone shows the category description under the title as plain text: live does not render its Markdown (`*masekhtot*` on /texts/Mishnah) — reproduced, flagged as a live bug. *Verified.*
- **LIB-011 / LIB-012 Added detail**: the edition toggles are block flow (their `flex-direction` never applied); section headings 18px uppercase, 20px over the contents, 40px between sections. *Verified.*
- **LIB-019 Found**: the category line stays under the header while a wide page scrolls (it sits outside the scroller); on a phone it lies over the page top. The rebuild drew it as a border that scrolled away. *Verified.*
- **LIB-026 Found**: the Promo module is always rendered, empty when the CMS has nothing, and its margin pushes the first sidebar title 34px down when it comes first (phone home, phone categories without a custom module). *Verified.*
- **LIB-033 / LIB-035 Added detail**: "Make a Donation" is the small button with the heart; the About module is multi-panel only. *Verified.*
- **Fixed on the way**: Roboto italic is no longer loaded — sefaria.org loads none, so its italics are the browser's slanted regular face; the main column's bottom padding is the old 70px; the sticky sidebar footer stops 60px down, as the old scroller's padding made it.
- **Built**: `ui/CategoryPage` (styles rewritten from the old CSS, phone description, loose/section grids), `ui/NavPage` (sticky colour line), `ui/NavSidebar` (`PromoSlot`, small donation button). Pixel diff ≤0.01% against the live site on 18 library pages (all top-level categories plus Torah, Yerushalmi, Mishneh Torah), desktop top/middle/bottom and phone full page.

## 2026-10-29 — text direction (owner's screenshot: Hebrew Rashi laid out left-to-right in the sidebar)
- **I18-013 Found**: the sidebar's connected texts tagged only the inline text span with `dir`, so in an English block a Hebrew comment's lines started at the left and its last short line sat on the left. The old client puts the direction on the block (`.segment.heOnly`: rtl, justify). *Verified* on sefaria.org Exodus 18:1 `with=Rashi&lang2=he`.
- **Built**: `ui/LangText` — LangText (lang and dir always together) and ContentText (the content-language side of `{en, he}`, strict like the old ContentText), `lib/i18n/content-lang` (the sidebar provides lang2), `lib/i18n/direction`. InterfaceText sets `dir`. Every element that set `lang` without `dir` now sets both, except five files under another session's edits, held in the baseline of the new architecture rule `lang-with-dir` (**I18-010**, **GUI-012**, **CON-032** detail added).

## 2026-11-04 — Sentry retired

- **ANL-017** Browser error reporting (Sentry): tier `retire`. Owner decision: Sentry is no longer used, so the new reader does not port it. `src/lib/analytics/sentry.ts`, `@sentry/react` and `@sentry/replay` are removed, and the reader pods no longer get `CLIENT_SENTRY_DSN`. This also removes the browser's `/api/remote-config` request on every page, which existed only to read Sentry's sample rates.

## 2026-11-04 — translations

- **LIB-020 Added detail** (*Verified* on www.sefaria.org /translations/de, en, ar, yi, he at 1280px, with a phone User-Agent and in the Hebrew interface): the list is fetched after load, corpora follow the catalog's order and sub-categories the corpus's contents (unknown ones dropped); a corpus's "Uncategorized" texts that the catalog lists at its top come first as a bare row, the rest in an untranslated "Uncategorized" block; the English page starts with every block closed. Measured layout (60px top, a 22px grey sans h1 line holding the 30px serif title, the 22px tab with its 4px underline, 24px corpus headings, 18px uppercase summaries, wrapping 18px rows with "•").
- **LIB-020 Found**: in the Hebrew interface the names come from the terms dictionary before the catalog, so Exodus is "ספר שמות" and Jonah "יונה הנביא", not the index titles. The page language's title stays as it is (German in Heebo).
- **LIB-021 Found**: `/api/texts/translations/he` answers 500 after ~16 s, so /translations/he is a title, an empty tab and the About module. Unknown slugs (ro, tr — both linked from the library sidebar —, xx, DE) are Django 404s. Title/description/og/twitter per language recorded.
- **LIB-029 Added detail**: the About module's title follows the interface font, its body is a bare Roboto text node; English and Hebrew fall back to "A Living Library of Torah" without Learn More or the video.
- **LIB-070 New**: the texts' links open the reader at the first section with `ven=<family>|<versionTitle>&lang=bi`; English/Hebrew commentaries bundled under their category page.
- **RTE-065 New**: pages the new reader renders for the Library stay Django's on the Voices host (`LIBRARY_HOST_ONLY`), until Q-E1 is decided.
- **Built**: `src/routes/translations.$slug.tsx`, `features/library/TranslationsRoute.tsx`, `ui/TranslationsPage`, `ui/NavSidebar/AboutTranslatedText.tsx`, `lib/translations` (languages, model built on the server from the shared catalog + API + the terms of `/data.js`, so the browser never downloads either), `features/shared/RouterLink.tsx` `VerbatimRouterLink` (hrefs byte for byte as the API writes them, in-app navigation). `translations` left `DJANGO_PREFIXES`; the library sidebar's language links are in-app. Tests: `e2e/translations.spec.ts`, `src/lib/translations/translations-page.test.ts`, pass-through/route-manifest/paths tests, story `Pages/TranslationsPage`.
- **Parity** (`scripts/parity-page.mjs`, `scripts/parity-diff-page.py`; `INTERFACE_LANG=hebrew` added to parity-page): English interface, all 14 languages: de, en, eo, es, fi, fr, he, it, pl, pt, ru 0.00–0.01% at 1280 (top/middle/bottom) and on a phone (full page) — only the header's search box; ar 0.10% / phone 0.12–0.14%, fa 0.09% / 0.02%, yi 0.10% / 0.19%: the right-to-left About text, whose span now carries lang and dir (Chromium then picks another fallback face for Arabic script, and the final period sits at the sentence's end instead of the old wrong side) — deliberate. Hebrew interface /translations/de: phone full page 0.05% (the header's icon, outside the page); desktop main column 0.00% once aligned — the site-wide Library Assistant banner is 9px taller in the Hebrew interface on our side and the Hebrew header labels differ (shell, not this lane), and the About body's final period sits at the end of its line (deliberate: the old page showed it at the start).

## 2026-11-04 — translations (review fixes)

- **LIB-037 Corrected**: the earlier line "ro and tr still 404, as on sefaria.org" was wrong for in-app navigation. *Verified*: a click on Türkçe or Română in the library sidebar opens a translations page inside the app on sefaria.org (openURL → openTranslationsPage; ISOMap title, `/api/texts/translations/tr|ro`); only a direct load or reload is Django's 404. Built the same: `IN_APP_TRANSLATION_LANGUAGES` (ro, tr, lad, jrb) open only when the route loads in the browser.
- **LIB-021 Corrected**: the server's page waited for `/api/texts/translations/he` (a 500 after ~16 s) up to the API deadline — TTFB 7.2 s against live's 1.1 s. It now waits at most 1.5 s (`prefetchTranslationsPage`) and the server shares a page's model (10 min) and a failure (60 s) between requests (`sharedTranslationsModel`): /translations/he TTFB 0.3 s once the failure is known. *Verified*: a trailing slash (`/translations/de/`, `/translations/`) is a 404 on sefaria.org; it is now Django's here too (a Library-only path with a trailing slash), not a 308.
- **RTE-065 Corrected**: the Voices host is also the Hebrew one, chiburim.sefaria.org.il (staging chiburim.sef-stage-il.org): `isVoicesHost` matches `voices.*` and `chiburim.*`; `isDjangoRequest` reads X-Forwarded-Host. Unit-tested for both hosts.
- **LIB-070 Added detail** (*verified*): after the click sefaria.org writes `…German_[de]&lang=bi&aliyot=0`; ours wrote `%5Bde%5D` on every reader address. `lib/reader/search-serializer` now keeps `[` and `]` readable; the e2e test checks the whole address.
- **LIB-020 / SHL-036 Added detail**: the old page's panel carries `data-anl-batch {"panel_number":1,"content_lang":"english"}`; ours now has it on the page's frame (`NavPage anlBatch`; "hebrew" in the Hebrew interface). Not carried: content_lang "hebrew" for a reader whose content language is Hebrew-only. The module switcher's item attributes before it opens are shell debt (also /texts).
- **LIB-029 / LIB-020 parity**: re-measured — de, en, he 0.00–0.01% (1280 and phone User-Agent); ar 0.10% / 0.12–0.14%, yi 0.10% / 0.19%: the deliberate lang/dir on the right-to-left About text (its final period at the end of the sentence). Hebrew interface: phone 0.01–0.05%; desktop 4.7–7.1% from the shell (Library Assistant banner 9px taller, header labels, search box) — main column 0.000% once shifted 9px.
- **Tests strengthened** (`e2e/translations.spec.ts`): the server's page holds the rendered list (not only its data) and no list request follows; the he test no longer relies on a dead browser route and has a positive control plus a TTFB bound; the Hebrew-interface test checks the terms' names (ספר שמות, ספר ויקרא, ספר דברים, יונה הנביא) and the computed direction; the link test checks the whole address written and the German text shown; Türkçe/Română in-app and their direct-load 404s; data-anl-batch in both interfaces; the phone test runs with a phone User-Agent in both projects and checks the 16px gutter and no sideways scroll.

## 2026-11-04 — calendars

- **CAL-001 Added detail** (*verified*): `/calendars/` is a page of its own on sefaria.org (200, canonical with the slash); the page's items are today's for the request's country and the reader's textual custom (signed out "ashkenazi"; the server's time zone decides the day); sections keep the API's order; the measured layout on desktop and phone, where the About module opens the page. Stale line refs corrected.
- **CAL-002 Added detail** (*verified*): no subtitle in the Hebrew interface (empty Hebrew strings, brackets drawn only in English); the API's description wins; Yerushalmi Yomi has none; Chok LeYisrael's url is a Hebrew collection path written unencoded; the card geometry and the Hebrew 122% sizes.
- **CAL-003 / RTE-010 Added detail** (*verified*): the shortcuts are 302s with an empty text/html body and `Location: iri_to_uri("/" + url)` of today's default items (diaspora, no custom) — `?diaspora=0` is ignored; the slashed forms are 404s, and both paths are 404s on voices.sefaria.org. **Decision**: the new reader's server answers the two redirects itself from `/api/calendars?diaspora=1` (Django's status, headers and Location), falling back to Django when the API fails; on the Voices host they stay Django's.
- **PRM-016 Found**: the sidebar's sign-up sends its event as "Subscribe from undefined" (the module passes `context`, the form reads `contextName`); errors show the API's string untranslated. Kept as is (analytics parity).
- **LIB-050 / LIB-054 / LIB-026 Added detail** (*verified*): Stay Connected and About Learning Schedules geometry; the Promo slot's place on /calendars.
- **New**: **CAL-004** Learning Schedules follow the reader's location and custom; **CAL-005** Calendars refresh after a settings change.
- **Built**: `routes/calendars.tsx`, `features/calendars`, `ui/CalendarsPage`, `ui/NewsletterSignUp`, `ui/NavSidebar` (AboutLearningSchedules, StayConnected), `lib/library/calendars.ts` (listings, sections, shortcuts, `iri_to_uri`), `lib/user/textual-custom.ts`, `lib/user/newsletter.ts`, `server/calendar-shortcuts.ts`. `calendars`, `parashat-hashavua` and `todays-daf-yomi` leave `DJANGO_PREFIXES` (Library host only); the router keeps a trailing slash the server lets through. Pixel diff against the live page 0.00% (1280 and phone, English); Hebrew ≤0.2% once the shared header's taller Hebrew banner is discounted.
- **Review fixes (same day)**:
  - **CAL-001 / LIB-038 / GUI-011**: the ways in now lead to the new page. The phone menu's "Learning Schedules" and /texts' "All Learning Schedules ›" write the relative `/calendars`, as sefaria.org does. Before this fix they pointed at www.sefaria.org.
  - **CAL-001 head** (*verified*): the og:\*, twitter:\* and hreflang alternate tags from sefaria.org's head are added.
  - **ANL-015** (*verified*): the old panel's `data-anl-batch` (`{"panel_number":1,"content_lang":"bilingual"|"hebrew"}`) is kept on the page frame.
  - **Voices host**: `/calendars` and the shortcuts answer 404, as voices.sefaria.org does, when there is no Django to pass them to. On the Voices host the browser loads them in full instead of routing to the Library page (`leavesClient` now takes the host).
  - **CAL-004**: the browser asks for the textual custom through the server function, so it works where `/api` is not on the page's origin.
  - **CAL-005**: now covered by a unit test.
  - **RTE-010**: now `partial`, because `/dayoflearningcalendar` stays Django's.
  - **LIB-033 / PRM-016**: the old alt texts are restored ("donation icon", "Submit").
  - **Shared banner**: the site-wide Library Assistant banner keeps its Roboto stack in Hebrew, as live does. Before, it computed Heebo and was 9px taller, which pushed every Hebrew page down. With that fixed, Hebrew /calendars differs from live by 0.15% at 1280 and 0.20% on a phone. What remains is the shared Hebrew header.
  - **Known differences**: `/calendars//` answers 307 where live answers 200. `/Calendars` answers 200 where live answers 404 (the router ignores case). The UA page type is not sent.

## 2026-11-04 — compare

- **Correction (mislabel)**: the `/compare` URL is not the in-reader compare panel. It is the staff **version-diff tool** (templates/compare.html, `diffPage.js` from static/js/diff_page.jsx): two versions of a section diffed segment by segment. SHL-037/038, CON-066, LIB-003/018, BOK-004 and SRC-025 describe the compare *panel* (a second text opened from the sidebar's Compare Text tool); each now says so. The panel is not ported.
- **LEG-010 Added detail / corrected**: the change dialog is client-gated to moderators and editors (the page itself is public), the form's live version lists (language buckets by a trailing `[xx]`), the old texts API parameters and its 2 + 2N requests per table, diff quirks kept (diff-match-patch's 1 s limit decides how equal-cost diffs are cut; insertions before the last character are red; entities shown literally), filters act on Update only, two bugs (an end-of-text insertion is written in front of the text; a failed post blocks the row). *Verified.*
- **RTE-019 Added detail**: Django's pattern on the decoded path — `/compare/Genesis.1` (no slash) makes the ref the second version and shows an empty form, `/compare/Genesis.1/` is the ref. *Verified* (JSON_PROPS on www.sefaria.org).
- **LEG-031 New**: the page's frame — a standalone document (no header, browser default styles, GTM only, no viewport meta, English and left-to-right in the Hebrew interface). *Verified.*
- **LEG-032 New**: which sections a ref shows (book → first section, segment → its section and no table, above section level → one table per section below), with two live bugs: a segment range answers 500, a section range shows rows that never load. *Verified.*
- **Built** (`routes/compare.$.tsx`, `routes/compare.index.tsx`, `features/compare`, `ui/VersionDiff`, `lib/compare`, `lib/routing/standalone.ts`): pixel diff 0.00% against www.sefaria.org at 1280 and with a phone User-Agent, English and Hebrew interface (empty form, ref only, Hebrew and English diffs, Talmud, book level). `compare` left `DJANGO_PREFIXES` for the Library host only (Voices still passes through). The router now keeps trailing slashes (`trailingSlash: "preserve"`): the server already 308s reader and library addresses, and `/compare/<ref>/` depends on its slash. Deliberate differences: one texts request per section and version, a section range shown as one table per section, a segment range as the form without a table, an end-of-text insertion applied at the end, a failed post can be retried, the dialog follows `is_staff` (the Editors group is not visible to the client).

## 2026-11-04 — compare (review fixes)

- **LEG-032 Corrected (mislabel)**: "Load Next Chapter" with no language writes `/compare/Genesis_2//`, and sefaria.org does **not** 404 on it: nginx merges the slashes, Django answers 200 with Genesis 2's form, the address bar keeps `//`. *Verified* (curl and a Playwright walk). `parseComparePath` now merges repeated slashes the same way; this client's router shows the page at `/compare/Genesis_2/` (one slash less in the address, same page).
- **RTE-019 Added detail**: the repeated-slash rule; `trailingSlash: "preserve"` is router-wide (auth pages such as `/login/` render at the slash URL, as live answers 200 there too).
- **LEG-031 Built further**: a standalone page no longer gets the site's viewport meta (the route's `width=980` stand-in is gone: no meta at all, as compare.html), Typekit, font preloads or `fonts.css`; `<body data-standalone>` takes the browser's own font, colours and 8px margin, so the body is Times in the Hebrew interface too (live: Times) and a 404 rendered outside the page's wrapper looks as there. An unmatchable address reached from the form is loaded as a document (the old page's `location.assign`), so the server (Django in production) answers it.
- **LEG-010 Tests strengthened**: insertion and deletion texts of every changed Genesis 1 row compared with a capture of the live page (`e2e/fixtures/compare-genesis-1-marks.json`); filters checked span by span (only the chosen character, restored on a second Update); a signed-in non-staff gate; Apply Change checked for the exact raw position (tag-mapped) of the replacement, the reload of both versions and the new text in the row; back/forward, the no-language Next Chapter, the 404 (typed and from the form), the Hebrew interface's geometry and cell directions, and the phone in the Hebrew interface. The Voices pass-through is unit-tested over the whole request (`passesToDjango`, used by `src/start.ts`).
- Still **partial**: LEG-010's editor gate (the Editors group is not visible to this client) and Apply Change against a real Django write (never run: it would write to production).

## 2026-11-04 — topics
The topics navigation pages (/topics, /topics/category/<slug>, /topics/all/<letter>) ported to the new reader on the Library host, surveyed against the legacy code (TopicsLandingPage/*, TopicPage.jsx TopicCategory, TopicPageAll, NavSidebar, s2.css) and www.sefaria.org at 1280px, with a phone User-Agent and in the Hebrew interface (`tools/apply_2026_11_04_topics.py`).
- **TOP-001 / RTE-030 Added detail**: the three pages' titles in both interface languages; unknown categories and `/topics/category` are Django 404s; the legacy redirects (/people, /people/Talmud, /person/<name>) and where they land. *Verified.*
- **TOP-003 … TOP-010, TOP-012 Added detail**: measured geometry of every landing section (843px column, 60px between sections, the search pill, the five-line cloud in the zero-width-ellipsis font with serif bullets, the featured picture on its serif text line, the newsletter's 16px gaps, the 361px cards, the two calendar columns 67px from their divider) and the phone variants. *Verified.*
- **TOP-007 Found**: the newsletter's failure text is the server's `{error}`, "Error posting to API" for a failed status, else "Sorry, there was an error."; the Hebrew interface subscribes to no list.
- **TOP-012 Found**: TOC cards carry `data-anl-event="navto_topic:click:click"` (TopicTOCCard passes the type and Card appends it again); `analyticsLinkType` is never rendered. Card text takes the interface language's face and size whatever its language (an English description in the Hebrew interface is Heebo at 122%, left-to-right).
- **TOP-013 Found**: the card grid's column rules (two columns at ≥900px and 600–700px, one at 700–900px and below 600px); the title row's 15px; the Study Companion only on Torah Portions in English; panel_category is the parents' slugs or "Topic Landing". *Verified.*
- **TOP-014 Found**: `/topics/all/A` lists nothing (the letter is used as written); the Hebrew bar shows final mem ם (only ך ן ף ץ are excluded); the Hebrew interface's empty list reads "טוען מידע...". *Verified.*
- **TOP-033 New**: the topics TOC came from every page's 9.4 MB data.js; the new reader keeps it on the server (`/api/topics-toc`, or `topic_toc` out of `/data.js` where the endpoint 404s) and sends each page its slice.
- **TOP-034 New**: the landing search's count is `numLibraryTopics` from base_props (5,768, the library pool — not the A–Z list's 4,402); `GET /api/topics/library-count` added on this branch, with the old page's props as the fallback.
- **TOP-035 New**: each topics page's sidebar modules and their order.
- **Built**: `src/lib/topics` (topics-api, toc-source, topic-model), `src/ui/TopicsNav`, `src/ui/NavSidebar/TopicModules`, `src/features/topics`, `src/routes/topics.*`; the Voices host keeps every /topics page on Django (Q-E1). Pixel diff against the live site: category and A–Z pages 0.00–0.01% (desktop top/middle/bottom, phone full page); the landing page 0.00–0.03% with the random samples frozen (`FREEZE_RANDOM=1 scripts/parity-page.mjs`); Hebrew interface (`PARITY_LANG=hebrew`) content lines up, the page 9px lower under the new shell's taller Hebrew banner. **Not built**: the moderators' buttons on topic categories, the Voices TopicsPage (TOP-011), the single topic page (next).

## 2026-11-04 — topics (the single topic page)
The topic page (/topics/<slug>, /topics/b/<slug>) ported to the new reader on the Library host, surveyed against the legacy code (TopicPage.jsx, Story.jsx, sefaria.js getTopic / processTopicsTabsData, Misc.jsx TabView / FilterableList / LangSelectInterface, reader/views.py topic_page, s2.css) and www.sefaria.org at 1280px, with a phone User-Agent and in the Hebrew interface (`tools/apply_2026_11_04_topic_page.py`).
- **TOP-001 / RTE-030 Found**: the address is `?sort=<sort>&tab=<tab>` (sort always, tab once the tabs mount, the entry replaced); a `?tab=` on load is ignored and the parameters reordered; tab and sort clicks push history; the Hebrew page's meta description stays English (obsolete msgstr). *Verified.* **Changed**: the new reader honours a `?tab=` that names one of the page's tabs.
- **TOP-015 Added detail**: every request the page makes (an author under Authors asks only for `popular-writing-of`; 17 bulk-text requests for Moses); the topic answer is 683 KB and sorted by the request's interface language. *Verified.*
- **TOP-016 … TOP-023, TOP-025, TOP-026, TOP-029 Added detail**: measured geometry and type of the header, dedication, buttons, tabs and pseudo-tabs, filter bar, cards, works list, side column and readings, desktop, phone and Hebrew. *Verified.*
- **TOP-022 Found**: the sort applies to Notable Sources too; the filter resets with the tab, the bar's open state does not.
- **TOP-023 Found**: a source missing the chosen language is hidden on Notable Sources and Sources (its analytics wrapper stays), shown in the language it has on Top Citations; only the first curated source opens.
- **TOP-025 Found**: groups are sorted by their singular title ("Parents" after "Opposed", before "Parent-in-Law"); with no displayable group the fallback section is titled but empty (the old filter drops its own links); in the Hebrew interface sefaria.org shows "undefined" for the Learn More links (the new reader shows their Hebrew names).
- **TOP-027 Found**: inside the topic panel the portal modules' titles are 40px serif (the page's h1 rules); the footer is sticky.
- **TOP-028**: Admin tab, review states, Generate and Publish built (CSRF writes, never run against production); the old editors open the old page (`?editor=1` is handed to Django).
- **TOP-024**: no Sheets tab on the Library; Voices topic pages stay Django's.
- **TOP-036 New**: the Library pool check (reader/views.py topic_page's 404): the A–Z list, else the v2 topic's `pools` (added to get_topic on this branch), else Django answers.
- **Built**: `src/lib/topics/topic-page.ts` (rules), `topic-page-source.ts` (server-side assembly, texts, readings, portal, moderator writes), `src/ui/TopicPage` (SourceCard, TopicHeader, TopicTabs, SourceFilterBar, AuthorWorks, TopicSideColumn, PortalModules), `src/features/topics/TopicPageRoute.tsx`, `src/routes/topics.$.tsx`, `topics.b.$.tsx`; topic links on the topics pages are routed. Pixel diff against the live site (English, `scripts/parity-page.mjs` + `parity-diff-page.py`): Moses, Rashi, Rosh Hashanah, Jonathan Sacks 0.00–0.01% at 1280 (top/middle/bottom/full) and on a phone (first screen and full page, Sacks 0.04%); Parashat Bereshit 0.01–0.05% (desktop) and 0.08% (phone full page: the book and newsletter icons' baseline). Hebrew interface: content lines up element by element; whole-page diffs (2–14%) come from the new shell's 9px taller Hebrew banner and the live Learn More "undefined".

## 2026-11-04 — topics (review fixes)
After an independent review of the topics lane, measured element by element against sefaria.org / sefaria.org.il (computed styles and `CSS.getPlatformFontsForNode`, desktop 1280 and phone User-Agent; `tools/apply_2026_11_04_topics_review.py`).
- **TOP-003 / TOP-004 / TOP-006 / TOP-007 / TOP-014 Found (Hebrew interface)**: the landing search is Heebo at 1280 but the English sans on a phone; "Explore all Topics ›" and a Hebrew featured description are the Hebrew serif (Heebo made the description a line longer and the phone page 43px taller); the Sign Up button stays Roboto; the portion/calendar links keep serif lines; the A–Z filter is Heebo; the magnifier is `search_mdl.svg` everywhere. Heebo 600 is now loaded (a 600 title drew the 700 face). *Verified.*
- **TOP-005 Found**: sefaria.org places the cloud's bullets once, when the sample arrives (often before the web fonts): 1–2 of ~40 can end a line. The same-line rule on the final lines stays (closest to live, reproducible). *Verified over four loads.*
- **TOP-018 / TOP-020 / TOP-023 / TOP-025 / TOP-026 Found (Hebrew interface)**: the source body keeps the old left-to-right HACK (287px column, x=51 on a phone); small print is `smaller` of the text; the citation row, readings, dedication link and side picture sit on serif lines; work titles are 122% and keep their 20px on a phone; the phone's "א" sits 3px lower. *Verified.* **Known difference**: sefaria.org never loads Taamey Frank Bold on topic pages (synthetic bold, ~4px narrower per word); the new reader's real Bold can move a line break.
- **PRM-014 Found**: the site-wide banner stays in the English sans in the Hebrew interface; Heebo made it 9px taller, which was the whole-page Hebrew desktop offset on every topics page. Fixed in the shell's banner.
- **TOP-028 Changed**: the AI notice's box and its Learn More / Feedback links are always in the page (hidden), as AiInfoTooltip; box, position and links ported (hovered diff 0.000%).
- **TOP-029 Added detail**: the GA4 events the page fires and their parameters (filter, sort_by from/to, search, lang_toggle_click/select), now covered by e2e.
- **TOP-036 Changed**: a 404 reached by an in-app navigation (topic, category, `?editor=1`) loads the address again from the server so pass-through hands it to Django; the server's own 404 shows "Page not found." and never loops (`src/features/topics/DjangoHandoff.tsx`, `src/lib/routing/django-handoff.ts`). The backend `pools` change is still untested.
- **Tests**: the topics e2e specs (49) now pin what sefaria.org shows (related order, Top Citations order, next-reading dates, portal modules, every filtered source, the day's featured topic, every category description), check GA4 events, the 404 hand-off and Hebrew typography; phone tests send a phone User-Agent.
- **Parity** (`scripts/parity-page.mjs` + `parity-diff-page.py`, `FREEZE_RANDOM=1`; landing, authors category, A–Z, Moses, Rashi, Bereshit, Jonathan Sacks, Love): English 0.00–0.05% at 1280 and 0.00–0.08% on a phone (full pages). Hebrew interface, before → after: desktop whole pages 2–11% → 0.12–1.2% (the 1.79% header strip is the shell header's Hebrew link row); phone landing 4.13% / 13.1% full → 0.01% / 0.21%; Moses phone 0.50% / 3.55% full → 0.01% / 0.82%; Rashi phone full 7.7% → 0.21%. Left: synthetic vs real bold (TOP-023), the live "undefined" Learn More links, cloud bullets by timing, 2px per multi-line Hebrew text block (sefaria.org's first Hebrew face is the typekit "EnglishInHebrew Serif Font", not loaded here), and Bereshit's phone full-page shot (14%: a capture-time shift above y≈744 — element by element the page lines up at offset 0).
