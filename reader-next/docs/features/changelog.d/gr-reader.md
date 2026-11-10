## 2026-11-10 — wave 2, lane GR (reader, sidebar, versions, text types)

### Built

- **TXD-026** Inline images in text: full-segment images with their caption, inline images, the bilingual one-image rule (the vendored sanitiser keeps http(s) and base64 image sources: a marked local change).
- **TXD-023** Category mentions link to `/texts/<path>`; **TXD-020** plain links in stored text are kept (http(s) and site paths only).
- **CON-037** Sidebar scroll memory: book lists and Web Pages keep their place, a text list opens at the top, Resources forgets. _Verified._
- **CON-028** Recent filters above the list on desktop, newest first; a recent one's link keeps the order. _Verified._ (Phone header placement, CON-002, not built.)
- **CON-056 / CON-034** Add to Sheet refuses a verse that is only an image (every way in); it adds whole verses whatever is selected (owner decision: legacy's trimming not ported); **CON-057 / PRM-009** the Google Docs promotion under it.
- **SHL-055 / VER-021 / RTE-047** Extended notes deferred (owner; no live version uses them).
- **CON-014** Signed in, the Sheets count includes the reader's own (private) sheets.
- **VER-010** Translation previews cut at five lines with the clickable "…". _Verified._ **VER-013** Add to Sheet beside Open.
- **USL-008** Each Saved and History item has its Save button.

### Fixed

- **TXD-010** Zohar's paragraph numbers ran from 1 in every section (`index_offsets_by_depth` ignored): `/Zohar,_Bereshit.2` now opens at 2:3 as on sefaria.org. _Verified._
- **TXD-045** Hebrew verse numerals are set in Heebo (preloaded), as on sefaria.org; 12px kept (owner decision); weight 400 kept on purpose. _Verified._
- **TXD-020** Plain links: a backslash or %5C (`/\evil.org`) is refused; site paths go through libraryHref. **TXD-026** images keep their stored size, so their box is reserved before they load.
- **TXD-022** Topic links in the text and sidebar are this client's `/topics/<slug>`.

### Corrected

- **CON-028**: the old loop bug only affects an empty list; recent filters accumulate (Rashi, then "Ramban Rashi"). _Verified._
- **CON-002**: the phone header's category border is 0px wide (invisible); Resources' title is centred; recent filters move into the header after in-app navigation. _Verified._
- **USL-004**: "Add to Sheet on a note" is unreachable on sefaria.org (NoteListing.jsx renders no button; MyNotesPanel.jsx is imported nowhere).
