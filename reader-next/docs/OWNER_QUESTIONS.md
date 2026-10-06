# Questions for the owner

Collected while building; each blocks something that would send data to Sefaria or a third party, or needs a product decision.
Status as of 2026-10-05 (end of Phase 6).

## Decisions needed

> 2026-10-06: items 2, 3, 4 and 8 are now laid out with options and recommendations in `docs/PHASE7_PLAN.md` (decisions 7-0 … 7-3).

1. ~~**Hebrew search merges Dicta (SRC-082).**~~ DECIDED 2026-10-06: merge as on sefaria.org — built. On sefaria.org a Hebrew "All Results" search also sends the query to
   `sefaria.loadbalancer.dicta.org.il` and replaces Sefaria's own Tanakh hits with Dicta's (that is why live shows Genesis 1:14 first
   and "10,182+" for אור, where Sefaria's API alone gives Genesis 1:3 and "10,000+"). The rebuild does **not** do this. Build it?
   (It sends the reader's Hebrew query to a third party.)
2. **Analytics (SRC-104…108, and the same pattern elsewhere).** The old client sends GA4 events for search (focus, funnel, clicks).
   The rebuild sends none. Which events, to what, if any?
3. **Sign-in design.** Sign Up / Log in links go to sefaria.org's pages; signed-out tools open a sign-up modal. Real sign-in in this client?
4. **Feedback endpoint.** The Feedback form builds the request but it has never been sent to production (CORS unverified). OK to test once?
5. ~~**English text face.**~~ DECIDED 2026-10-06: the legacy fonts (Adobe Garamond Pro from Sefaria's Adobe Fonts kit) — built; add the deployed host to the kit's allowed domains. Cardo vs the Adobe Garamond Pro / EB Garamond the live site uses.
6. **Topic table of contents.** Topic and Author cards on sefaria.org show a parent-topic crumb ("Nature", "Authors"). The topic TOC is
   only embedded in the site's HTML (`topic_toc`), there is no public API. Needed for topics pages too — decide with Phase 7.
7. **Browser-level search integration** (SRC-028…030: OpenSearch descriptor, Google sitelinks box, legacy s1 hand-off) need server/deploy
   decisions; not built.
8. **Phase 7 scope** (topics pages, Voices/sheets, collections, profiles, accounts, calendars): counts per area are in the atlas
   (`node scripts/feature-coverage.mjs --status`). Voices and accounts depend on 3.

## Known differences from sefaria.org (deliberate or pending)

- Show Results button on the phone filter panel is pinned to the bottom (live puts it 4,700px down).
- Count pills and the sort button text are darker (AA contrast).
- Highlight of matched words is a box-shadow, not padding (no re-wrap when cleared).
- Hebrew keyboard: Hebrew layout only (the live menu has ~90 layouts).
- A failed search says so with Try again (live shows "No sources found").
- Compare-panel search (needs Compare Text, not built).
