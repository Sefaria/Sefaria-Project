# Inventory 07 — Source Sheets ("Voices"), Collections, User / Profile / Social

Repo: `/Users/akiva/Sefaria/dev/Sefaria-Project` (branch `master`, HEAD `bb47dd77a`). All paths relative to repo root.
Citations are `file:line`. "JSX" = React client; "legacy" = jQuery/CKEditor code still shipped.

---

## 0. Surprising findings / things a rebuild must decide on (read first)

1. **The React sheet *viewer* ignores most sheet display options.** `options.numbered`, `options.boxed`, `options.layout`, `options.language`, `options.langLayout`, `options.divineNames`, `options.bsd`, `options.highlightMode` are written by `new_sheet` (`sourcesheets/views.py:76-92`) and honored by the legacy template/`sheets.js`, but the React viewer only reads `options.indented`, `options.sourcePrefix`, `options.PrependRefWithHe/En`, `options.refDisplayPosition` (`static/js/sheets/SheetContentSegments.jsx:10,18,34-36,45`). Language/layout come from the reader panel's display-settings menu instead (`static/js/ReaderDisplayOptionsMenu.jsx:23-46`).
2. **No "Like" UI in React.** Likes API exists (`sourcesheets/views.py:837-868`, `sefaria/sheets.py:1263-1288`) and like notifications render (`NotificationsPanel.jsx:209-231`), but nothing in `static/js/**/*.jsx` calls `/like`. Only legacy `sheets.js` (`static/js/sheets.js:879` likers list) uses it.
3. **No Print / Embed / Assignment / "via" attribution UI in React.** `SheetContent` renders a hidden `#printFooter` ("Created with Sefaria" logo) for print CSS only (`sheets/SheetContent.jsx:173-176`); there is no print button. Embed and assignments exist only in legacy `templates/sheets.html` (`:70`, `:101-104`, `:981-1013`, `:1140-1150`) + `static/js/sheets.js` (`:286-288` print, `showEmebed` `:3564`). `/sheets/new` no longer processes `?assignment=` (`sourcesheets/views.py:73-95`). `assignerName`/`viaOwnerName` are computed server-side (`sefaria/sheets.py:121-126`, `reader/views.py:676-684`) but never rendered in JSX.
4. **Legacy CKEditor sheet editor is still reachable** via `/sheets/<id>?embed=1` → `view_sheet` renders `templates/sheets.html` + `static/js/sheets.js` with `can_edit`/`can_add` flags (`sourcesheets/views.py:170-233`, `templates/sheets.html:1512`). So an owner hitting `?embed=1` gets the old editor.
5. **Collaboration ("anyone-can-edit" / "anyone-can-add") has backend support but no React UI.** `can_edit`/`can_add` (`sourcesheets/views.py:97-128`) are enforced in `save_sheet_api` (`:599-605`); `ShareBox` keeps a `shareValue` state and re-posts the sheet when it changes (`ConnectionsPanel.jsx:1168-1192`), but its render has no control that calls `updateShareOptions` (`:1209-1249`). React editor is only used when `Sefaria._uid === owner` (`sefaria/sheetsUtils.js:127-130`), so collaborators can't edit in React.
6. **No in-app "Delete account" UI.** `DELETE /api/account/delete` exists (`reader/views.py:4443-4471`, `sefaria/urls_shared.py:253`) but nothing in `static/js` or `templates` calls it (likely mobile-only).
7. **Dead / orphaned code**: `MyNotesPanel.jsx` (not imported anywhere; notes live in `UserHistoryPanel` + `NoteListing.jsx`); `EditorToggleHeader` in `UserProfile.jsx:370-477` (not exported/used; old/new editor toggle with `/enable_new_editor` `/disable_new_editor`); `Story.jsx` is a remnant ("Much of Stories was removed November 2022", `Story.jsx:19-20`); `SheetAccessIcon` references undefined `msg` (`Misc.jsx:2649-2656`); `/my/notes` redirects to `/my/profile?tab=notes` (`reader/views.py:1147-1149`) but the profile has no `notes` tab.
8. **Bugs worth not porting**: `CollectionMemberListingActions.handleClickOutside` uses `ReactDOM.findDOMNode` but `CollectionPage.jsx` never imports `ReactDOM` (`CollectionPage.jsx:1-24, 570-575`); `like_sheet_api` / `visual_sheet_api` return a bare dict (not `jsonResponse`) for anonymous users (`sourcesheets/views.py:826-827, 841-842`); `add_source_to_sheet_api`/`copy_source_to_sheet_api` reference undefined `id` on missing sheet (`:747, :788`); PublishMenu allows `allowNew` tags without slug which the backend has a "TEMPORARY FIX" for (`sefaria/sheets.py:1162-1178`, `sheets/PublishMenu.jsx:198`) — though `onTagValidate` actually rejects non-suggestions (`PublishMenu.jsx:137-142`); `collections_post_api` error formats `collection["slug"]` on a `None` (`sourcesheets/views.py:373-374`); `EditCollectionPage` uses jQuery `fail:` option (ignored) so upload/delete network failures are silent (`EditCollectionPage.jsx:61, 105`); mailto typo `hello@sefari.org` (`EditCollectionPage.jsx:241-242`).
9. **History/Saved are module-scoped**: `UserHistory.get_user_history` sets `query["is_sheet"] = sheets_only` (`sefaria/model/user_profile.py:248`), so the Library module's Saved/History shows only non-sheet items and Voices shows only sheets. Notifications are similarly scoped: Voices shows `collection add`, `follow`, `sheet like`, `sheet publish`; Library shows everything else (`sefaria/model/notification.py:173-178, 363`).
10. Views are counted on **every panel load** (`reader/views.py:669`) and on legacy `view_sheet` (`sourcesheets/views.py:192`), not deduped.

---

## 1. Routing & entry points (Voices module = sheets subdomain)

Voices URLconf `sefaria/urls_sheets.py`:
| Path | View | Notes |
|---|---|---|
| `/` | `sheets_views.sheets_home_page` (`sourcesheets/views.py:67-71`) | `menu_page(page="voices")` → `SheetsHomePage` |
| `/sheets-with-ref/<tref>` | `sheets_with_ref` (`sourcesheets/views.py:983-999`) | props `sheetsWithRef:{en,he}`, initial search filters/sort from GET |
| `/collections` | `reader_views.public_collections` (`reader/views.py:1137-1144`) | `collectionsPublic` menu |
| `/collections/new` | `edit_collection_page` (`reader/views.py:1218-1239`) | login_required, noindex |
| `/collections/<slug>/settings` | `edit_collection_page` | 404 if missing |
| `/collections/<slug>` | `collection_page` (`reader/views.py:1185-1215`) | accepts old `privateSlug` and redirects to current slug; `?tag=`, `?tab=`; `noindex` if not listed |
| `/getstarted` | static page `sheets` | |
| `/sheets` | redirect → `/getstarted/` (permanent) (`reader/views.py:1176-1180`) | |
| `/sheets/new` | `new_sheet` (`sourcesheets/views.py:73-95`) | login_required; creates empty unlisted sheet with default options then renders it via `catchall` |
| `/sheets/<int>` | `view_sheet` (`sourcesheets/views.py:170-233`) | help-center redirect for configured ids (`sefaria/utils/util.py:642+`); non-embed → `catchall(..., sheet=True)` (React); `?embed=1` → legacy `sheets.html` |
| `/sheets/visual/<int>` | `view_visual_sheet` (`sourcesheets/views.py:244-278`) | legacy `sheets_visual.html` + `static/js/sheets-visual.js` |
| `/sheets/<id>.<node>` | `catchall(sheet=True)` | highlighted node deep link |
| `/my/profile`, `/profile` | `my_profile` (`reader/views.py:4531-4540`) | redirect to `/profile/<slug>` preserving `?tab=` |
| `/profile/<username>` | `user_profile` (`reader/views.py:4112-4136`) | 404 if no user / inactive; default tab `sheets`; full profile dict only for owner |
| `/settings/profile` | `edit_profile` (`reader/views.py:4542-4555`) | legacy Django template `edit_profile.html` |

Shared (both modules) `sefaria/urls_shared.py`: `/saved` (`:35`), `/history` (`:36`), `/notifications` (`:39`), `/account` → my_profile (`:60`), `/my/notes` (`:61`), legacy redirects `/sheets/tags[/<tag>]` → topics (`:62-63`), `/sheets/public|private` (`:64`), `/groups/<g>` → collections (`:65`, `reader/views.py:1241-1253`), `/contributors/<uid>` → profile (`:66`), `/gauth`, `/gauth/callback`, `/unlink-gauth` (`:256-258`).
Library-only `sefaria/urls_library.py`: `/texts/notes` (`:20`), `/torahtracker` user stats (`:32`), `/settings/account` (`:46`), `/settings/account/user` (`:47`), `/settings/profile` → redirect to voices (`:48`), `/community` → voices redirect (`:50`), `/garden/sheets/<key>` (`:79`). Library `/sheets*` and `/profile*` redirect to Voices (`reader/views.py:5287-5310`).

Page-level SSR for a sheet (`reader/views.py:658-707, 855, 946-951`): increments `views`; 404 on error or `spam_sheet_quarantine` (`sefaria/sheets.py:117-118`); page title from sheet title; desc = summary or default; **`noindex` if `sheet.noindex` or status != public**; breadcrumb JSON-LD (`sheet_crumbs`); if `referer == /sheets/new` sets `sheet.editor = True`; `?lang=` sets panel language; `?with=` filter is dropped on Voices (`reader/views.py:824-825`).

Client routing: panel `mode: "Sheet"` with `sheetID`, `highlightedNode` (`ReaderApp.jsx:151,167, 1750-1754`); URL `sheets/<id>[.<node>]` for first panel, `sheet&s=<id>` for later panels (`ReaderApp.jsx:752-761`); page title "<sheet title> | ..." (`:755`); clicking a `/sheets/<n>` link opens `"Sheet <n>"` panel (`:1420`); history item `ref: "Sheet <id>[:<node>]"`, `sheet_owner`, `sheet_title` (`:2120-2140`); closing panel 0 with unsaved editor state prompts confirm (`ReaderApp.jsx:1947-1960`).

---

## 2. Sheet viewing (React reader, non-owner)

Container `static/js/sheets/Sheet.jsx`:
- Loads sheet from `Sefaria.sheets.loadSheetByID` cache or API `/api/sheets/<id>?more_data=1` (`Sheet.jsx:30-45`, `sefaria/sefaria.js:3359-3377`); on load re-opens state so history gets the title (`Sheet.jsx:36-40`).
- GA event `select_content` {content_type:"Sheet"} on mount (`Sheet.jsx:23-27`).
- **Owner → editor, everyone else → reader** via `shouldUseEditor` (`Sheet.jsx:147-148`, `sheetsUtils.js:127-130`).
- Link-click handling inside sheet (`Sheet.jsx:46-74`): cmd/ctrl/shift-click → browser default; links to any Sefaria hostname `/sheets/<n>` or the Voices domain navigate in same tab (full reload); all other links open in a new tab; `data-target-module` respected via `Sefaria.util.fullURL`.
- Layout = content + `SheetSidebar` (`Sheet.jsx:103-138`).

`SheetContent.jsx` (reader):
- Header `SheetMetaDataBox`: title, summary, author pic/name (mobile only), display-settings dropdown (language/layout/font-size), Guide button (if provided), `SheetOptions` "…" menu (`SheetContent.jsx:155-168`, `Misc.jsx:3047-3082`).
- Renders each source by type (`SheetContent.jsx:110-152`): `ref` → `SheetSource`; `comment` → `SheetComment`; `outsideText` starting with `<h1>` → `SheetHeader`, else `SheetOutsideText`; `outsideBiText` → `SheetOutsideBiText`; `media` → `SheetMedia`; malformed node (e.g. `null`) → empty fragment.
- Highlighting: `highlightedNode` highlights a node; if none, `highlightedRefsInSheet` highlights all ref sources contained in those refs (used when a sheet is opened in the ConnectionsPanel next to a text) (`:121-128`).
- "+ Add to Sheet" button appears on the highlighted node (images only for media) → `AddToSourceSheetModal` (copy node into one of my sheets via `/api/sheets/<target>/copy_source`), or sign-up modal (`SignUpModalKind.AddToSheet`) if logged out (`SheetContent.jsx:116-120, 182-201`, `AddToSourceSheet.jsx:130-138`).
- Scroll tracking: debounced scroll picks the segment below threshold (200px multipanel / 70px mobile), clicks it to update highlight only when sidebar open / `SheetAndConnections` mode; supports keyboard focus users ("user-is-tabbing") (`SheetContent.jsx:23-92`). `scrollToHighlighted` on mount and node change, focuses highlighted segment if last panel (`:93-109`).
- Text selection → `setSelectedWords` (`:51-57`).
- Print footer hidden div (`:173-176`).

`SheetContentSegments.jsx` per-type rendering:
- **SheetSource** (`:6-61`): left border color by ref category (`Sefaria.palette.refColor`); `heOnly`/`enOnly` class when one side empty or `"..."`; optional custom `title` heading (`:28-31`); `options.sourcePrefix` superscript; `PrependRefWithHe/En` prefix; ref link (he: `heRef`, en: `ref`) to library module; HTML text cleaned via `Sefaria.util.cleanHTML`; `options.refDisplayPosition` → class `ref-display-<pos>`; `options.indented` class; "Added by <userLink>" when `addedBy` (collaborator attribution); aria-label, tabIndex, Enter/Space keyboard click.
- **SheetComment** (`:62-96`): auto-detect lang via Hebrew detection; indented class; addedBy.
- **SheetHeader** (`:97-115`): `<h1>` text stripped of HTML.
- **SheetOutsideText** (`:116-164`): converts `<p>` to `<br/>`; clicks on `<a>` are not treated as segment clicks; sourcePrefix; addedBy.
- **SheetOutsideBiText** (`:165-200`): he + en columns, heOnly/enOnly.
- **SheetMedia** (`:201-289`): image (`jpeg|jpg|gif|png`); YouTube `/embed/` iframe; Vimeo player iframe; SoundCloud `w.soundcloud.com/player` iframe (166px); **Spotify** (episode 152px / track 80px fixed heights, "DO NOT change", `:230-246`); `.mp3` `<audio controls>`; otherwise "Error loading media..."; bilingual `caption {en,he}`; Add-to-sheet only for images. (Bandcamp is supported in the editor but not in this reader renderer.)

`SheetSidebar.jsx` (both reader & editor):
- Editor save-state indicator (multipanel only, editor only) (`:21`).
- Author ProfilePic (100px), author name link, profile fetched by `Sefaria.profileAPI(slug)` (note: effect has no dep array → re-fetches every render; cached) (`:9-16`).
- Followers count, `UserBackground` (bio, position @ organization), **Follow button** unless self (`:34-48`).
- "Topics" list → `/topics/<slug>` (Voices), "Part of Collections" list → `/collections/<slug>` (only `listed` collections; `sefaria/sheets.py:63-64`) (`:50-76`).

Display settings for sheets (`ReaderDisplayOptionsMenu.jsx`): language toggle (Hebrew/English/Bilingual); layout buttons hidden for sheets unless bilingual (`:44-46`); font size; vowels/cantillation toggles if text samples contain them; aliyot/punctuation never for sheets (`:52-54`). Layout options map `constants.js:1-13`.

SEO/sharing on server: `noindex` unless public (see §1).

---

## 3. Sheet options menu ("…") — `static/js/sheets/SheetOptions.jsx`

Props: `editable` (owner), `status`, `postSheet`, `historyObject`. History object ref is truncated to the sheet (`"Sheet 3"` not `"Sheet 3:4"`) (`:17-24`).
- **Publish** button shown inline only when `editable && status==='unlisted'` (`:104,107`).
- Menu items (`:108-140`): **Save / Remove** (bookmark; `SaveButtonWithText`), **Copy**, **Add to Collection** (non-owner label) / **Edit Collections** (owner label) (`:157-160`), **Export to Google Docs**, **Share**; owner & public → separator + **Unpublish**; owner → separator + **Delete Sheet** (confirm dialog `common.are_you_sure_you_want_to_delete_this_sheet_there`).
- Logged-out user choosing Save / Collections / Copy / Export → sign-up modal of kind Save / AddToSheet / AddToSheet / Default and resets mode (`:46-75`).
- Export is auto-opened when URL hash contains `afterLoading=exportToDrive` (post-OAuth return) (`:26-33, 41`).

Modals (`static/js/sheets/SheetModals.jsx`):
- **ShareModal** → `ShareBox` (`:13-20`; `ConnectionsPanel.jsx:1165-1256`): copy-link input + copy button (clipboard API with `execCommand` fallback), Share on Facebook / X (twitter.com/share) / Email (mailto). (Dormant collaboration-setting re-post logic; see §0.5.)
- **CollectionsModal** → `CollectionsWidget` (§9.4).
- **CopyModal** (`:35-107`): clones the cached sheet, forces `status: "unlisted"`, title + " (Copy)", if copier ≠ owner sets `via=<orig id>`, `viaOwner=<orig owner>`, `owner=me`; strips id, owner image/url/org/name, views, dates, displayedCollection, collection name/image, likes, promptedToPublish, `_id`; POSTs `/api/sheets/`; shows "Copying…" (non-closable while copying) then "View your Copy" link (new tab) or error. Backend duplicates GCS-hosted images for new sheets (`sefaria/sheets.py:540-547`).
- **SaveModal** (`:116-140`): toggles saved item, shows "Saved sheet." / "Sheet no longer saved."; non-closable while saving.
- **GoogleDocExportModal** (`:142-225`): reads `gauth_error` from hash (`access_denied`, `invalid_grant`, `scope_mismatch` messages) and strips it; else POST `/api/sheets/<id>/export_to_drive?language=&layout=` (current panel language/layout); 401 → redirect `/gauth?next=<current url>#afterLoading=exportToDrive`; success shows "View in Google Docs" link (`webViewLink`); network error message; non-closable while exporting.
- **DeleteModal** (`:227-234`): calls `deleteSheetById` then navigates to author profile; non-closable.
- **PublishModal** — §5.

Backend export (`sourcesheets/views.py:1026-1094`): `@gauth_required` scopes drive.file + userinfo.email; renders `gdocs_sheet.html` with options merged (`language`, `layout`), uploads HTML as Google Doc named by stripped title, stores `gauth_email` on profile (shown/disconnectable in account settings §12).

---

## 4. Sheet editing — `static/js/Editor.jsx` (Slate; owner only)

### 4.1 Document model
- Sheet JSON → Slate: root `Sheet` element carrying metadata (`status`, views, tags, includedRefs, owner, summary, id, dates, `promptedToPublish`, options, `nextNode`, author info, title, displayedCollection, collection name/image, likes) with child `SheetContent` (`Editor.jsx:560-647`).
- Source-type → element map: `ref→SheetSource`, `comment→SheetOutsideText`, `outsideText→SheetOutsideText`, `outsideBiText→SheetOutsideBiText`, `media→SheetMedia` (`:25-32`). Headers are stored as `outsideText` beginning with `<h1>` and become `header` elements; a source's custom `title` becomes a preceding `header` node (`:576-596`).
- **Spacers** inserted between non-outside-text items (and between consecutive non-header outside texts) and at bottom so there's always somewhere to type (`:567-612`).
- Void elements: ProfilePic, SheetMedia, SheetSource, SheetOutsideBiText, horizontal-line (`:34-40`).
- HTML parsing for item text (`parseSheetItemHTML`, `:513-533`): NBSP→space; if no lists, `<div>`→`<br>`; `<br>`→newline; **nested lists flattened to one level** (`:484-503`); drop trailing newline; DOM → Slate via `deserialize` (`:206-291`) supporting A (url, data-ref, target), BLOCKQUOTE, H1–H6, IMG, LI/OL/UL, P/DIV, PRE, TABLE/TR/TD, HR; marks EM/I/STRONG/B/U/SUP/BIG/SMALL; inline `style` `background-color`, `color`, `text-align` preserved as marks/attrs.
- Serialization (`serialize`, `:294-394`): marks → `<em><strong><u><sup><big><small>`, style marks → `<span style=...>`, newlines → `<br>`; link → `<a href>` (with `class="refLink" data-ref` if ref link); paragraph → `<p>` (or `<div>` if contains list markup); lists, table (`<table><tbody>`), tr/td, `<hr>`.
- Save mapping (`saveSheetContent`, `:2878-2988`): SheetSource → `{ref, heRef, text:{en,he} ("..." if empty), options?, node}`; OutsideBiText similarly; SheetComment → `comment`; SheetOutsideText → `outsideText` (empty → `"<p> </p>"` to preserve old-sheet spacing); SheetMedia → `media`; header → `outsideText: "<h1>...</h1>"`; spacers dropped. Sheet payload: `status, id, promptedToPublish, lastModified, summary, options, tags, displayedCollection, title, sources, nextNode`.

### 4.2 Block/inline element rendering (`Element`, `:1129-1316`)
spacer (shows Add interface when selected & caret collapsed), SheetSource & SheetOutsideBiText (boxed, `BoxedSheetElement`), SheetComment, SheetOutsideText (lang class auto-detected), SheetMedia (image; YouTube embed with `rel=0&showinfo=0`; Vimeo 315px; Spotify embed 380px; SoundCloud 120px; **Bandcamp** 120px; mp3 audio; else empty), he/en, SheetContent, TextRef, SourceContentText, paragraph (with "add new line" ::before button, centered if `text-align:center`, loading spinner while a source loads), bulleted/numbered list, list-item, header (`h1.serif`), link, table/tr/td, horizontal-line. Highlight class when `editor.highlightedNode` matches.

### 4.3 Boxed source editing (`BoxedSheetElement`, `:657-870`)
- Each SheetSource/OutsideBiText has two nested Slate editors (he and en, both `withLinks(withHistory(withReact))`) synced back into parent node (`:660-686`).
- Click activates the box; clicking the he/en text area makes that language editable (read-only otherwise); blur deactivates; Chrome hack toggles parent `contenteditable` so Ctrl+A / Alt+Up work inside (`:715-747`).
- English editable always rendered `dir=ltr` (`:813-820`).
- Bold/italic/underline hotkeys inside source (`:749-758`); basic hover menu (B/I/U/highlight) (`:841, 854`).
- Ref link at top of each language column → library (`:838, 851`).
- **Drag & drop of whole sources**: draggable box; custom drag image showing the ref (he/en per interface lang) with category color; sets slate fragment + html + text on dataTransfer; `dragging` flag; drop handled in `insertData` (`:771-812, 1535-1542`).
- Mouse-down anti-jump hack positions children container (`:701-712`).

### 4.4 Adding content (`AddInterface` / `AddInterfaceInput`, `:872-1127`)
On an empty selected spacer a "+" button opens: **Add Source**, **Add Image**, **Add Media**.
- **Add Source**: `Autocompleter` over `Sefaria.getName(input, 5, ['ref'])`; shows suggestions with category border color, book address examples helper text (`d.addressExamples[0]`), live preview of section/segment text; "Add Source" button / Enter when the input is a section/segment ref (`:938-1011`, `Misc.jsx:3084-3330`). Insertion (`insertSource`, `:1973-2014`): sets paragraph `loading`; resolves normal en/he refs (`sheetsUtils.getNormalRef`), fetches segments (`getSegmentObjs`) and builds HTML (`segmentsToSourceText`): segment numbers `<small>(n)</small>` (Hebrew numerals in he) except Talmud / Pesach Haggadah; each segment its own `<p>` except Tanakh/Talmud (`sheetsUtils.js:24-69`); adds trailing spacer when needed; fixes duplicate node numbers; deletes the empty line above.
- **Add Image**: file picker (jpg/jpeg/png/gif only else alert "not an image"); base64 POST to `/api/sheets/upload-image` → inserts SheetMedia with returned URL (`:1058-1105`). Backend: login required; GIFs stored as-is, other images thumbnailed to max 1024×1024, uploaded to GCS UGC bucket as `<uid>-<uuid>.<fmt>` (`sourcesheets/views.py:1096-1125`). Deleted media (GCS-hosted) is removed from storage on save (`sefaria/sheets.py:489-497`).
- **Add Media**: URL input; "Add Media" button appears only when URL is recognized (`isMediaLink`, `:877-918`): YouTube (any watch/short/youtu.be form → `/embed/<id>?rel=0&showinfo=0`), Vimeo (→ player URL), direct image URLs, `.mp3`, SoundCloud (→ widget URL with color/auto_play/hide_related params), Spotify (`open.spotify.com/<type>/<id>` → `/embed/...`), Bandcamp EmbeddedPlayer (forces `artwork=small`). Tooltip: "We can process YouTube and SoundCloud links, and hosted mp3's and images".
- **Typed-citation auto-conversion**: while typing in an outside text, each line ≤50 chars is checked with `Sefaria.getName`; if it's a ref it's styled `isRef` (`inlineTextRef`); pressing **Enter** on a line that is a section/segment ref replaces it with a SheetSource (`getRefInText`, `:1348-1396`; triggered on space / when caret on isRef text `:3122-3125`; Enter path `:1523-1531`).
- **Paste** (`insertData`, `:1535-1588`): if pasting a URL whose host starts with `www.sefaria.org`, fetches the page and inserts a link titled with the page `<title>`; other URLs pasted as-is; drag data into spacer handled with insert/delete "dance"; always de-dupes node numbers afterwards. HTML paste uses Slate default + `deserialize` rules.

### 4.5 Formatting toolbar (hover menu, `HoverMenu`, `:2385-2439`)
Appears above a non-empty, non-collapsed, non-link selection while focused (portal into `#s2`). Buttons: **Bold**, **Italic**, **Underline**, **Highlight** (5 colors `#E6DABC #EAC4B6 #D5A7B3 #AECAB7 #ADCCDB` + "ban"/clear; click outside closes; `:2484-2540`); full menu also **Link** (`AddLinkButton`, `:2441-2463`), **Header** (h1), **Numbered list**, **Bulleted list** (`BlockButton`/`toggleBlock`, `:2318-2347, 2542-2559`). Leaf marks also render `big`, `small`, `superscript`, `color`, `text-align` (`Leaf`, `:2350-2383`) though no buttons for them (preserved from imported HTML).
- **Links** (`Link`, `withLinks`, `:2090-2258`): hover 500ms shows URL popover input; editing URL normalizes (`new URL`, email → `mailto:`, else prepends `http://`); empty URL on blur removes link; ✕ removes link; new link inserted as "New Link" or wraps selection; links inside list items get a trailing space on Enter to stop link continuation.
- **Keyboard shortcuts**: `mod+b`, `mod+i`, `mod+u` (`:43-47, 3114-3120`); native `formatBold/Italic/Underline` beforeinput events (`:3043-3052`); manual Backspace/Delete handling (`:3129-3133`).

### 4.6 Structural/normalization rules (`withSefariaSheet`, `:1399-1931`)
- Enter in middle of an outside text → soft break; Enter in a header → new line becomes outside text; Enter on empty list item exits list (inserts spacer); Enter otherwise inserts a spacer (new block) (`:1476-1532`).
- Backspace: never past document start; if selection is a SheetSource it deletes the source; avoids accidentally deleting a source when backspacing from a spacer (selects instead); special end-of-doc spacer handling (`:1418-1464`).
- Cut/copy of a source selects surrounding characters so the void is cut (`:3081-3091`, `:1466-1474`).
- Tables: no backspace/delete across cell boundaries; Enter disabled inside tables (`withTables`, `:2017-2088`).
- Normalizers (`:1594-1928`): no nested Sheet/SheetContent; outside-text language auto-set (RTL/LTR); wrap raw text in paragraphs; **merge adjacent outside texts**; empty paragraph/outside text → spacer; raw text/paragraph at top level → SheetOutsideText; lists wrapped in paragraph; ensure editable spacer at top and bottom; spacer with text → outside text; lift misplaced spacers/sheet elements/headers; **ensure every sheet item has a `node` id** (increments `nextNode`); spacers before/after boxed sources; at most one spacer between boxed sources; only TextRef+SourceContentText inside he/en; placeholder `"..."` text when a language is empty.
- Node-number integrity: `incrementNextSheetNode`, `checkAndFixDuplicateSheetNodeNumbers` (`:1933-1958`).
- Scroll-into-view of caret when typing near viewport bottom (`ensureInView`, `:3054-3079`).

### 4.7 Title & summary
Editable inline `contentEditable` title and summary in `SheetMetaDataBox` (save on blur; empty content cleared) (`Misc.jsx:2876-2896, 3047-3064`, `Editor.jsx:3187-3196`). Summary box shown when editable even if empty.

### 4.8 Autosave & save-state machine
- Debounced save 500ms after any change to content, title, or summary (`Editor.jsx:2782-2802`); POST `/api/sheets/` form field `json` (`:3021-3032`); response updates status/title/summary and cache.
- Optimistic concurrency: payload includes `lastModified` = cached `dateModified`; server rejects if it differs (`"Sheet updated."`, `rebuild:true`) (`sefaria/sheets.py:476-481`).
- States (`sheetsUtils.js:71-78`): `saved`, `saving`, `unsaved`, `connectionLost` (HTTP 0), `userUnauthenticated` (401), `unknownError` (other errors, or still "saving" after 20s) (`Editor.jsx:3009-3019, 2611-2639`).
- On non-saved error states **the editor and title are input-blocked** (all mouse/keyboard/clipboard/drag/focus events captured) (`sheetsUtils.js:79-126`, `Editor.jsx:2640-2691`); connection lost → re-save polling every 2s (`:2692-2716, 2805-2819`); unauthenticated shows "Log in" link with `next` (`:2582`).
- `beforeunload` warning when not saved (`:2654-2665`); closing panel warns too (§1).
- Indicator `EditorSaveStateIndicator` with icon/tooltip/message per state, aria-live (`:2561-2610`), shown in sidebar (multipanel only). **The whole save-state management only runs when `Sefaria.multiPanel`** (`:2769`) — on mobile, autosave still runs but without the state machine.
- Debug flag `Sefaria.testUnknownNewEditorSaveError` simulates failure (`:3002-3005`, `sefaria.js:3537`).
- Hotjar `using_new_editor` event (`:2833`).

### 4.9 Cross-tab refresh ("collaborative" sync)
There is **no edit locking**. Only: `BroadcastChannel('refresh-editor')` — when a source is added to a sheet from another tab/panel via AddToSourceSheet (`AddToSourceSheet.jsx:299`), open editors reload the sheet from DB (`Editor.jsx:2827-2830, 3164-3169`). Legacy `sheets.js` polled `/api/sheets/modified/<id>/<ts>` every 3s and replayed last edit (`static/js/sheets.js:3239-3369`; API `sourcesheets/views.py:677-697`).

### 4.10 Editor guide
`GuideButton` (bulb) in metadata box when guide available; guide type "editor" shown only on multipanel, panel 0, `mode === "Sheet"` and user is owner (`ReaderPanel.jsx:477-520`); content from `/api/guides/editor` (`sefaria.js` `getGuide`), `GuideOverlay.jsx`.

### 4.11 Highlighted node
On load scrolls `.sheetsInPanel` so the `data-sheet-node` element is 200px (multipanel) / 70px from top (`Editor.jsx:2865-2876`).

---

## 5. Publishing — `static/js/sheets/PublishMenu.jsx`
- Unlisted → modal with **Title** (prefilled, "Untitled" placeholder), **Description** textarea (max 140 chars, live validation message), **Topics** tag input (`react-tag-autocomplete`, suggestions from `Sefaria.getName(input, 5, ["Topic"])`, delimiters Enter/comma, only suggestion topics accepted, no duplicates) (`:66-215`).
- Validation: requires description AND ≥1 topic (messages for both/either) with red highlighting (`:83-114`).
- Publish → sets title/summary/topics on cached sheet and posts with `status:"public"`; Public → "Unpublish" immediately posts `status:"unlisted"` (`:9-64`). Modal non-closable while posting; error text shown.
- Backend on first publish (`sefaria/sheets.py:551-571, 598-620`): set `datePublished`, record publication in history, **notify all followers** (`sheet publish` notifications), run **LLM sheet scoring** (Celery helper `generate_and_save_sheet_scoring`), create topic links (RefTopicLink `about` links "Sheet <id>" ↔ topic, `dataSource: sefaria-users`) for public sheets only; queue ES search sync. Unpublish: delete publication history, delete `sheet publish` notifications, remove topic links, queue search removal.
- Topics normalization (`sefaria/sheets.py:1035-1147`): `#` stripped (except `#MeToo`), titlecased, `|`→`-`; missing slug → best existing topic (prefer primary title then numSources) or **create new topic**.
- `sheetLanguage` inferred from title (all-Hebrew → hebrew) (`:662-668`); `includedRefs`/`expandedRefs` recomputed on every save (`:573-575`).
- Server sanitization (`sefaria/sheets.py:631-659`, `sourcesheets/views.py:609-617`): bleach with allowed tags (blockquote, p, a, ul, ol, li, b, i, strong, em, small, big, span, strike, hr, br, div, table…, sup, u, h1), attrs (`a[href,name,target,data-ref]`, styles color/background-color/text-align, `class`), title & summary bleached; `displayedCollection` cleared if user isn't a member.
- Protected fields on update: views, owner, likes, dateCreated, datePublished, noindex (`sefaria/sheets.py:499-507`).
- Legacy publish prompt (`promptToPublish`, `static/js/sheets.js:3681`) and `promptedToPublish` field still carried.

Permissions on save (`sourcesheets/views.py:564-631`): logged in or `apikey`; owner, or collaboration `anyone-can-edit`, or `anyone-can-add`/assigner (`can_add`). 401 + `errorAction: loginRedirect` if anonymous.

---

## 6. Likes, views, sheet topics
- Like/unlike: `POST /api/sheets/<id>/like|unlike` (`sourcesheets/views.py:837-860`); `$addToSet`/`$pull` likes; like creates `sheet like` notification for owner (`sefaria/sheets.py:1263-1280`); `GET /api/sheets/<id>/likers` returns annotated user list (`:863-868`). No React UI (§0.2).
- Views: `$inc` on each load (§0.10); displayed in `SheetListing` (eye icon/count or lock for private) and profile/collection lists (`Misc.jsx:1747-1754`).
- Sheet topics: `POST /api/sheets/<id>/topics` owner-only update (`sourcesheets/views.py:809-819`); tag lists: `/api/sheets/tag-list[/<sort>]` (alpha, count, alpha-hebrew; cached 1h) (`:871-878`, `sefaria/sheets.py:1212-1236`), `/api/sheets/tag-list/user/<uid>` (`:881-892`), `/api/sheets/trending-tags?n=` (last 30 days, public, excluding copies/assignments, ≥2 authors; 6h cache) (`:894-906`, `sefaria/sheets.py:356-394`); `/api/sheets/tag/<tag>` and `/api/v2/sheets/tag/<tag>` (story form) (`:948-970`).
- Admin categorization: `/api/sheets/next-untagged|next-uncategorized` (staff PUT) (`:1128-1147`), UI `static/js/categorize_sheets.jsx` at `/admin/categorize-sheets`.

---

## 7. Sheets home page (Voices `/`) — `static/js/sheets/SheetsHomePage.jsx`
- Hero video banner (webm/mp4, poster, autoplay loop muted) with title "Community-powered Jewish learning" + message (`:8-24, 50-53`).
- H1 "Explore user-created content by topic".
- **Calendar cards**: "This week's Torah portion" (`Sefaria.getUpcomingDay('parasha')` → TopicTOCCard with description) and "On the Jewish Calendar" (`getUpcomingDay('holiday')`) (`SheetsHomePageTopicsTOC.jsx:24-57`); click → topic page.
- **Browse topic categories** TOC cards from `Sefaria.topic_toc` (`:5-15`) → nav topic; on mobile rendered below sidebar.
- Sidebar modules: `WhatIsSefariaVoices`, `CreateASheet`, `VoicesNewsletterSignUp`; footer in sidebar on desktop, in content on mobile (`SheetsHomePage.jsx:33-40, 71-77`).

## 8. Sheets-with-ref page (`/sheets-with-ref/<tref>`) — `static/js/sheets/SheetsWithRefPage.jsx`
- Data: `Sefaria.sheets.getSheetsByRef` → `/api/sheets/ref/<ref>?include_collections=1`, de-duplicated by sheet id (`:259-269`, `sefaria.js:3309-3316`). Backend `get_sheets_for_ref` (`sefaria/sheets.py:925-1019`): public sheets whose `expandedRefs` include any segment; returns one row per anchor ref; owner/assigner/via names & URLs, collection TOC, topics, likes, summary, attribution, `combined_score` (LLM title interest 0.3 + percentile-normalized ref score 0.3 + creativity 0.4).
- Frozen copy of search layout (`:9-98`): title "Sheets with “<ref>”" (Hebrew quote marks), result count, **AI badge tooltip** when sorted by relevance (`:284-285`), sort box (desktop) / filter button (mobile), filters sidebar/mobile overlay.
- Filters: client-side by **topics** (`topics_en`) and **collections**, doc counts recomputed, empty filters hidden, original filter list preserved (`:105-206`; filter nodes `sefaria.js` `sheetsWithRefFilterNodes`).
- Sorts: relevance (default, combined_score), views, dateCreated (`:207-220`); then **current user's sheets first**, then by title language matching interface language (`:221-236`).
- Result click opens sheet in panel with connected refs (`:280-283`); search state reset on unmount.

---

## 9. Collections

### 9.1 Collection page — `static/js/CollectionPage.jsx` (`/collections/<slug>`)
- Data from SSR props / `Sefaria.getCollection(slug)` (`/api/collections/<slug>`), resets on slug change (`:42-66`).
- Header (`CollectionAbout`, `:316-348`): TOC-backed collections show bilingual `toc.title/heTitle` + language toggle (multipanel, non-Hebrew UI); otherwise name; **Edit** button for admins → `/collections/<slug>/settings`; "Collection" label → `/collections`; description (TOC bilingual HTML or raw HTML); website link (protocol stripped).
- Sidebar: collection image module; "Editors" block with **invite box** (admins only) and member list (`:204-224`).
- Tabs (`:226-240`): **Contents** (only when `pinnedTags`), **Sheets**, **Filter** toggle (arrow icon shows/hides filter header). `?tag=` preselects sheets tab and filter.
- Contents tab (`:359-399`): pinned tags grouped under label objects; each tag click filters sheets **exactly** (vs. partial match for typed filter, `:119-133`); special case: collection "גיליונות נחמה" gets an extra "English" tag in English UI.
- Sheets list: `FilterableList` page size 20, infinite scroll, remembers rendered count (`_sheetsDisplayed`) (`:267-281`); sort **Recent / Alphabetical / Views** with **pinned sheets always first** in pin order (`:103-118`); filter over title + topic en/he/asTyped.
- Each `SheetListing` (`:134-153`): no author header, info underneath (unpublished marker, author, views, created date, collections), summary shown, **pin button** (pinnable for any member; shows pinned state for others), editable if mine, **saveable if not mine and not member**, collectable (collections modal).
- Empty states: filter no match; member → "You can add sheets to this collection on your profile" + Open Profile; non-member → "no sheets yet" (`:154-179`).
- Footer link "Search the full text of this collection for <filter>" only for listed collections (`:180-191`) → search with collection filter.
- Pin: `POST /api/collections/<slug>/pin-sheet/<id>` toggles; members only; re-entrancy guarded; alerts on error (`:87-102`; backend `sourcesheets/views.py:543-557`, `collection.py:322-331` pins to front).
- Member list (`:476-552`): Owner ("admin") / Editor ("member") roles, invitations (email, mail icon) visible to admins only. Actions gear menu (`:555-681`): admins can set Owner / Editor role; admins remove others; anyone can **Leave Collection** (self); confirm on demoting self; invitations: **Resend** (once → "Invitation resent") and **Remove**.
- Invite (`:402-473`): email regex validation, "Inviting…" state, 5s flash message; `POST /api/collections/<slug>/invite/<email>`.
- Backend rules (`sourcesheets/views.py:474-540`): role API admins only except self-removal; roles `member|publisher|admin|remove`; **sole owner can't leave/demote** (error message); invite: existing user → added immediately as editor + `collection add` notification; unknown email → invitation record + email (`email/collection_signup_invitation_email.html`, register link `?next=<collection>`); on registration invited users auto-join (`user_profile.py:629-636`).
- Collection visibility: listed collections show only public sheets to non-members; members/private show unlisted+public (`collection.py:202-209`); invitations only returned to members.

### 9.2 Create / edit collection — `static/js/EditCollectionPage.jsx`
Fields: Name, Website, Description (textarea), **Collection Image** upload (≤2MB, `accept=image/*`, `POST /api/collections/upload`, loading gif placeholder, recommended 350×350), legacy **Default Sheet Header** image (only shown if already set), **List on Sefaria** toggle (only when editing; replaced by moderator-rejection message if `moderationStatus === "nolist"`), **Delete Collection** (confirm; `DELETE /api/collections/<slug>` → `/my/profile`). Save → `POST /api/collections` json → navigate to Voices `/collections/<slug>`; Cancel → collection or `/my/profile`; `beforeunload` warning on unsaved changes (`:22-28`).
Backend model rules (`sefaria/model/collection.py:63-131`): website forced to https; private collections get random 6-char URL-safe slug, publishing assigns name-based slug and saves `privateSlug` (old links redirect), unpublishing restores it; **publishing requires unique public name, an image, and ≥3 public sheets**; old GCS images deleted on change; TOC description bleached; deleting collection clears `displayedCollection` on sheets; slug change updates sheets (`:364-381`). Create via API: creator becomes admin (`sourcesheets/views.py:381-384`); only admins can edit/delete.

### 9.3 Public collections — `static/js/PublicCollectionsPage.jsx` (`/collections`)
`/api/collections` → `{private, public}` (public = listed and not `nolist`, sorted) (`collection.py:355-361`). Sorted ignoring punctuation, numbers last, interface-language collections first; split into English and Hebrew grids (order by UI lang); each card: image, name, 5-line clamped description (`:13-114`). Sidebar "AboutCollections" (in-content on mobile) + "StayConnected". (Effect has no deps → refetch each render; cached.)

### 9.4 Collections widget (sheet ↔ my collections) — `static/js/CollectionsWidget.jsx`
- Loads my collections (`/api/collections/user-collections/<uid>`) and this sheet's collections for me (`/api/collections/for-sheet/<id>`); initial sort: checked first then most recently modified (no reshuffle while open) (`:25-59`).
- Checkbox add/remove → `POST /api/collections/<slug>/add|remove/<sheetId>`; updates caches (collection, user collections order, sheet, user sheets list) (`:61-91`).
- Inline **Create new collection** (name input; Create button appears when non-empty) → creates and auto-adds sheet (`:93-109`).
- Empty message; Close (×) and Done; `handleCollectionsChange` only if changed.
- Backend: only members can change contents; owner adding a sheet sets `displayedCollection` if none; removing the displayed one clears it (`sourcesheets/views.py:414-459`).

---

## 10. User profile — `static/js/UserProfile.jsx` (`/profile/<slug>`)
- `ProfileSummary` (`:527-607`): full name; `UserBackground` (position "at" organization; info list on multipanel: location, Jewish education lines, Website link, social icons Facebook/Twitter(handle → twitter.com)/YouTube(→youtube.com/)/LinkedIn) (`:480-524`); followers • following counts (click opens hidden tabs); owner: **Create Sheet** (`/sheets/new`) & **Create Collection** (`/collections/new`) buttons (multipanel), **Edit Profile** (`/settings/profile`); others: **Follow** button; profile pic 175px with **upload/crop** for owner (§10.2), hidden default initials for others' default pic.
- Tabs (`:29-44`): **Sheets**, **Collections**, hidden **Followers**/**Following**, **About** (only if bio; renders bio HTML).
- Sheets tab (`:97-172, 283-295`): `/api/sheets/user/<uid>/date/0/0` (owner gets private sheets + their collections; others get public only with displayed collection name, `sefaria/sheets.py:143-164`); filter by title/topics/collections; sort Recent (server order) / Views; listing: editable/deletable (owner; delete confirm → refresh sheets & collections caches), saveable (others), collectable, info underneath.
- Collections tab (`:339-364`): `/api/collections/user-collections/<uid>` (others only see listed, `sourcesheets/views.py:404-411`); `CollectionListing` (name, unlisted marker, sheet count, editors count if >1) (`Misc.jsx:1875-1919`). (Note: sort/filter helpers `filterCollection`/`sortCollection` exist but the tab doesn't use FilterableList.)
- Followers / Following tabs (`:173-229`): `/api/profile/<slug>/followers|following`, filter by name/position, `ProfileListing` with follow button (unfollow disabled in listings), empty "0 followers/following".
- Empty states differ for owner vs. visitor (`:74-147`).
- SSR: owner gets full profile dict (pinned_sheets, is_sustainer, experiments), visitors basic (`reader/views.py:4126-4129`, `user_profile.py:730-764`).

### 10.1 Edit profile (legacy Django page `templates/edit_profile.html`, Voices `/settings/profile`)
Fields: first/last name, position, organization, website, location, Jewish education (multi-line list: Enter adds line, empty line removed on blur, ✕ remove, "Add a line"), **About me (bio) via CKEditor** (rich text: bold/italic/underline/strike/sub/sup, justify, bidi, lists, font, size, colors, links, image, table, HR), public email, **Profile URL (slug)**, Twitter, LinkedIn, Facebook, YouTube (`edit_profile.html:27-142, 151-232`). Client normalization: strip full URL from YouTube/Twitter → handle; prepend `http://` to facebook/linkedin/website. Save → `POST /api/profile` → redirect to Voices profile. Server validation (`user_profile.py:571-603`): slug `[a-z0-9-]` and unique; facebook/linkedin/website URL valid; email valid. Name change triggers cascades (`_name_updated`).

### 10.2 Profile picture — `ProfilePic.jsx` + `ImageCropper.jsx`
- Default avatar = initials (first+last word) in a circle sized `len`; gravatar/default URLs start as default and swap to image if it loads; `profile-default.png` forced to 404 to show initials (`ProfilePic.jsx:9-35, 68-97`).
- Owner buttons "Add Picture" / "Upload New"; non-image file error; read as data URL → crop modal (`react-image-crop`, square 1:1, initial centered square, keepSelection, aspect-ratio sanity error) → Save uploads JPEG blob to `/api/profile/upload-photo` → full reload to profile; error message with hello@sefaria.org (`ProfilePic.jsx:36-66`, `ImageCropper.jsx:7-138`).
- Server: resize to 250×250 and 80×80 PNG, upload to GCS profiles bucket, delete old, update `profile_pic_url[_small]`, bust public user cache (`reader/views.py:4325-4344`).

### 10.3 Follow / unfollow / block
- `FollowButton` (`Misc.jsx:1550-1622`): states Follow / Following / hover "Unfollow" / "Follow Back" (notification), optional icon; logged out → sign-up modal (Follow); `POST /api/follow|unfollow/<uid>`; keeps `Sefaria.following` in sync; analytics events. `disableUnfollow` prop in listings.
- Follow creates `follow` notification (FollowRelationship); lists: `/api/followers|followees/<uid>` (`reader/views.py:3396-3425`).
- Block/unblock API `/api/block|unblock/<uid>` (`reader/views.py:3428-3445`) — no web UI found.

---

## 11. Notifications — `static/js/NotificationsPanel.jsx` (`/notifications`)
- SSR initial notifications scoped to active module (`reader/views.py:1386-1394`); infinite scroll (600px margin) `GET /api/notifications?page=&scope=<module>` (page_size 10; stop when count < page_size), de-dup by `_id` (`:33-80`).
- **Mark as read** automatically for all loaded notifications on mount, scroll, and load (`POST /api/notifications/read` with ids JSON + scope) and update header unread count (`:43-61`). API also accepts `notifications=all` (`reader/views.py:3358-3393`); only own notifications are marked.
- Logged out → `LoginPrompt` (Log In / Sign Up with `?next=`) (`:99`, `Misc.jsx:1964-1987`). Empty state message suggests following sheet creators (`:133-146`).
- Types (`:117-131`): **sheet publish** (user published new sheet + title link + summary), **sheet like**, **follow** (with Follow Back unless already following), **collection add**, **index** (new text; global), **version** (new English/Hebrew version; global), **general** (global HTML message). Each shows image (user pic / Sefaria icon), linked name, relative time "X ago"/"לפני X". Unknown types (e.g. legacy `discuss`, `message`) render nothing.
- Global notifications: admin-posted `GlobalNotification`s copied into per-user notifications on read (`notification.py:340-350`); `/api/updates` GET/POST/DELETE (staff) (`reader/views.py:3271-3333`), shown in `UpdatesPanel.jsx`.
- **Email digest** (`sefaria/model/user_profile.py:815-863`, cron `scripts/scheduled/send_email_notifications.py`): per user with unread personal (non-global, non-spam) notifications and `settings.email_notifications` matching `daily|weekly` (or `all`); localized by interface language; subject from actors ("X, Y and 2 others have new activity on Sefaria") or like count; template `templates/email/notifications_email.html`; marks read `via: email`. Spam detection for `message` notifications deactivates heavy senders (`:770-812`).
- Sheet deletion deletes its notifications (`notification.py:429-436`).

## 12. Account settings (Library `/settings/account`, Django template `templates/account_settings.html`)
- **Notification Frequency (email)**: Daily / Weekly / Never (`:24-43`).
- **Site Language** English/עברית (Torah-specific sites) (`:44-58`); reload on change.
- **Preferred Translation Language** (from `SUPPORTED_TRANSLATION_LANGUAGES`) (`:59-72`); also stored in cookies.
- **Reading History** On/Off with warning "Turning this feature off will permanently delete your reading history" (`:74-90, 249-255`; server deletes non-saved history `user_profile.py:475-478, 565-567`).
- **Preferred Custom (Haftarot)** Sephardi/Ashkenazi (`:91-106`); dispatches `sefaria:settings-updated` event to refetch calendars.
- **Library Assistant** On/Off (only sent if changed; reload) (`:108-126, 281-304`).
- Experiments toggle (commented out) (`:128-150`).
- **Login method / change email**: non-social users: New Email + Confirm + Password → `POST /settings/account/user` (email match + password check, CRM update) (`:151-174, 344-361`; `reader/views.py:4242-4284`); social users see "Google/Apple Sign-In with <email>".
- **Google Drive (sheet export)** connected email + Disconnect (`/unlink-gauth?redirect=0`) or "not connected" text (`:187-210, 333-342`).
- Save → `POST /api/profile {settings}` → alert "Settings Saved"; Cancel → history back or `/texts`; arrow-key radio navigation.
- Profile sync API `/api/profile/sync` handles timestamped settings + history (max 3000 items) (`reader/views.py:4346-4440`).
- Delete account: API only (§0.6); deletes user and emails hello@sefaria.org.

## 13. Saved items, reading history, notes — `static/js/UserHistoryPanel.jsx` (`/saved`, `/history`, `/texts/notes`)
- Header tabs: Saved (bookmark), History (clock), Notes (library only) with module-aware links (`:44-70`); language toggle on multipanel (Torah sites).
- Saved/History lists via `useScrollToLoad` `/api/profile/user_history?saved=&sheets_only=<voices>&secondary=0&annotate=1` (`:137-164`); SSR first 20 (`reader/views.py:1335-1371`).
- History **de-dupes consecutive items** of same book (library) or same sheet (voices) (`:117-134`); Saved isn't deduped and has no timestamps; history shows relative time.
- Items: sheets → `SheetBlock` (title link, save button, author `ProfileListing` with follow) (`Story.jsx:320-358`); texts → `TextPassage` (ref title link with version params, save button, he/en content) (`Story.jsx:283-313`).
- History disabled → message linking to account settings (`:173-179`); empty states for history/saved.
- `/history` requires login; anonymous history lives in `user_history` cookie (trimmed to 3000 encoded bytes, newest first) (`sefaria.js:2880-2950`, `reader/views.py:4497-4499`).
- **Save/unsave** (`Sefaria.toggleSavedItem`, `sefaria.js:2795-2821`): POST `/api/profile/sync?no_return=1` `{action:add_saved|delete_saved, ref, versions, sheet_owner, sheet_title}`; logged out → reject `notSignedIn` → sign-up modal (Save). Saved matching uses version equality across old/new version formats (`sefaria.js:2769-2794`). `SaveButton` UI with tooltip & bookmark icons (`Misc.jsx:1342-1395`). Saving works even when history disabled; unsave deletes item (`user_profile.py:655-663`).
- **History logging** (`Sefaria.saveUserHistory`, `sefaria.js:2902-2950`): only if `is_history_enabled`; logged in → `/api/profile/sync?no_return=1&annotate=1`; anonymous → cookie with heRef lookup. `api/user_history/saved?tref=` returns saved items for a ref (`reader/views.py:4483-4494`).
- **Notes** tab (library): `Sefaria.allPrivateNotes` → `/api/notes/all?private=1`; `NotesList`/`NoteListing` shows ref link (sheet refs link to Voices `/sheets/<id>.<node>`, text refs `?with=Notes`), note text (linkified, newlines), **delete** (confirm, `DELETE /api/notes/<id>`) (`NoteListing.jsx:9-93`). (An Add-to-Sheet modal path exists in NoteListing state but no button triggers it.)

## 14. User stats ("Torah Tracker", `/torahtracker`) — `static/js/UserStats.jsx`
- Modes Previous Year / All Time (`:21-27, 69-88`); `/api/site_stats` (login required) and `/api/user_stats/<uid>` (self or staff) (`:31-41`, `reader/views.py:3253-3267`).
- **Moderators** get a User ID chooser (debounced 500ms) to view others (`:59, 90-98`).
- Active users (textsRead > 2): Overall Activity stat card (texts read), donut charts "Your Reading" vs "Average Sefaria User" by category (categories <4% grouped into "Etc"), top-5 category bar chart user vs site (RTL-aware), "Your Favorite Texts" (top refs, 3-column `TextBlockLink`) (`:136-363`, d3).
- Inactive users: "Looks like we haven't seen you in a while" + site-wide donut and bars (`:100-135`).

## 15. Legacy `static/js/sheets.js` (3,896 lines) — what it still serves
Loaded only by `templates/sheets.html` (`:1512`) → `/sheets/<id>?embed=1` (and the dormant `editorMode`). Features present there but absent in React:
CKEditor rich-text with continuous autosave (`:633-800`); drag-sort of sources (`:918-1000`); add source/comment/outside text (mono & bilingual)/media/connections (`:1026-1340, 1941-2000` "Add all connections from…"); per-source language/layout overrides and "reset to sheet defaults" (`:1352`, `sheets.html` `sourceLayoutLanguageMenuItems`, `resetSourceTogglesToSheetGroup`); sheet-level layout (stacked/side-by-side, heRight/heLeft), language, **numbered sources**, **boxed sources**, **BS"D header**, **divine-name substitution** (YHVH/Adonai/Elokim variants → ה'/ד'/etc., `:3610-3680`, options `yy`/`ykvk`/`h`); **highlighter mode** with named, colored tags and segment splitting (`:1707-1925, 3524-3870`); tag editor with suggestions (`sjs.sheetTagger`, `:2103-2215`); assignments (make assignable, assignment link `/sheets/new?assignment=<id>`, view students' copies, stop collecting) (`sheets.html:101-104, 981-1013`); **embed code modal** `<iframe src=...?embed=1>` (`sheets.html:1140-1150`, `showEmebed` `:3564`); **print** (`:286-288`); copy sheet (`:3469`), export to Drive (`:3495`), delete (`:3586`), likes + likers list (`:879`), publish prompt (`:3681`), polling for concurrent edits every 3s with rebuild/replay (`:3239-3369`), parasha-to-sheet modal (`addParashaToSheetModal`; API `/api/sheets/<parasha>/get_aliyot` `sourcesheets/views.py:1001-1013`), "via"/assignment attribution, Hebrew nikkud removal (`removeNikkudot`).
Also legacy: `/sheets/visual/<id>` (`sheets-visual.js`, `/api/sheets/<id>/visualize` saves node positions & zoom, `sefaria/sheets.py:1255-1260`); `gdocs_sheet.html` (Drive export rendering).

## 16. Sheet & collection-related API surface (for parity)
`POST /api/sheets` (save/create; also apikey), `GET /api/sheets/<id>[?more_data=1]`, `GET /api/sheets/<id>.<node>`, `POST /api/sheets/<id>/delete` (owner or owner's apikey; also removes from collections, notifications, ES) (`sourcesheets/views.py:280-322`), `POST /api/sheets/<id>/add` (add formatted source: `ref|refs|outsideText|outsideBiText|comment|media`, optional versions/text override, footnotes stripped, optional `note` appended as indented outside text; owner only) (`:700-774`, `sefaria/sheets.py:681-706`), `POST /api/sheets/<id>/add_ref` (`:798-806`), `POST /api/sheets/<id>/copy_source` (`sheetID`,`nodeID`) (`:776-795`), `/api/sheets/<id>/topics`, like/unlike/likers, visualize, `/api/sheets/user/<uid>[/<sort>/<limit>/<offset>]` (`:643-649`), `/api/sheets/modified/<id>/<ts>`, `/api/sheets/create/<ref>[/<sources>]` (make sheet from text, redirects) (`:1016-1023`, `sefaria/sheets.py:1303-1336`), tag APIs, `/api/v2/sheets/bulk/<id|id>` (story metadata, `?public=`) (`:634-640`; `Sefaria.getBulkSheets`), `/api/sheets/ref/<ref>`, `/api/sheets/all-sheets/<limit>/<offset>?lang=&filtered=` (`:909-916`), `/api/sheets/<id>/export_to_drive`, `/api/sheets/upload-image`.
Collections: `GET /api/collections` (listing), `GET/POST/DELETE /api/collections[/<slug>]`, `/api/collections/user-collections/<uid>`, `/api/collections/for-sheet/<id>`, `/api/collections/upload`, `set-role`, `invite[/uninvite]`, `add|remove`, `pin-sheet` (`sefaria/urls_shared.py:180-189`).
Profile/social: `/api/profile[/<slug>]` GET/POST, `/api/profile/<slug>/followers|following`, `/api/profile/upload-photo`, `/api/profile/sync`, `/api/profile/user_history`, `/api/user_history/saved`, `/api/follow|unfollow/<uid>`, `/api/followers|followees/<uid>`, `/api/block|unblock/<uid>`, `/api/notifications`, `/api/notifications/read`, `/api/updates`, `/api/user_stats/<uid>`, `/api/site_stats`, `/api/account/delete`, `/settings/account/user`.

## 17. Client caches / singleton functions (`static/js/sefaria/sefaria.js`)
`sheets.loadSheetByID/_loadSheetByID` (`:3359-3377`), `deleteSheetById`, `userSheets` (keyed `uid|sort offset count`), `updateUserSheets`, `clearUserSheets`, `publicSheets`, `sheetsByRef`/`userSheetsByRef`/`sheetsTotalCount` (sidebar counts), `getSheetsByRef`, `sheetsWithRefFilterNodes`, `getSheetTitle` (strip HTML, "Untitled") (`:3308-3536`); `getCollection`, `getCollectionsList`, `getUserCollections`, `getUserCollectionsForSheet` (+FromCache variants) (`:3544-3585`); `getTrendingSheetsTopics` (`:3214-3221`); `getBulkSheets` (`:848-856`); `saved`, `getSavedItem/removeSavedItem/toggleSavedItem`, `userHistory`, `loadUserHistory`, `saveUserHistory`, `profileAPI`, `followAPI`, `editProfileAPI`, `uploadProfilePhoto`, `getRefSavedHistory`, `messageAPI`/`chatMessageAPI` (no UI found), `experimentsOptInAPI` (no callers) (`:2769-2981`); notes `privateNotes`/`allPrivateNotes`/`deleteNote` (`:2027-2160`); `following`, `notifications`, `is_history_enabled`, `is_moderator`, `slug`, `_uid` globals.

## 18. Shared sheet-list components (`static/js/Misc.jsx`)
`SheetListing` (`:1698-1873`): author pic/name (unless hidden), title link (analytics), summary, info row (unpublished, author, views, created date, collections incl. displayed collection) or topics row, right-side actions collect/delete/save/pin, collections modal; `CollectionListing` (`:1875-1919`); `ProfileListing` (`:1649-1696`); `FilterableList` (`:234-389`: text filter, sort dropdown (old design) or "Sort by" pills (new design), paginated infinite scroll, header/footer/empty renderers, analytics attrs); `SheetMetaDataBox`, `SheetTitle`, `CollectionStatement`, `SheetAuthorStatement` (`:2860-2926, 3047-3082`); `LoginPrompt`; `SignUpModal` kinds AddToSheet / Save / Follow / Default etc. (`:1989-2004`).
