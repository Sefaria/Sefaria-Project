"""The ports' open major review gaps, fixed on reader-next-ports (2026-11-04). Idempotent."""
import json, os, pathlib
T = pathlib.Path(os.environ.get("ATLAS_DIR") or pathlib.Path(__file__).resolve().parents[1])
atlas = json.load(open(T / "features.json")); by = {f["id"]: f for f in atlas}
status = json.load(open(T / "rebuild-status.json"))

def add(fid, lines):
    for l in lines:
        if l not in by[fid]["details"]: by[fid]["details"].append(l)

add("CAL-001", [
    "Once the page loads, the old app replaced the address and set the tab title (ReaderApp.jsx:630, hist.url 'calendars'): '/calendars/' and any query become '/calendars' (the hash stays), and the title becomes 'Learning Schedules | The Sefaria Library' / 'לוח לימוד יומי | האוסף של ספריא'. The server HTML keeps 'Learning Schedules | Sefaria Library' and its own canonical. VERIFIED 2026-11-04.",
    "BUILT 2026-11-04 (review fix): CalendarsRoute replaces the address once on arrival through the router's history and sets the title in the interface language. Tests: e2e/calendars.spec.ts ('once loaded, the address becomes /calendars').",
])
add("CAL-002", [
    "BUILT 2026-11-04 (review fix): the cards' links follow inside the app (VerbatimRouterLink: the href exactly as the old page wrote it, a plain click through the router); the card, Back and Forward stay in one document, as live. Tests: e2e/calendars.spec.ts.",
])
add("LIB-033", [
    "The Hebrew interface's button goes to the Hebrew campaign, give/468442 (Misc.jsx DonateLink), as the footer's Donate; English give/451346. BUILT 2026-11-04 (src/lib/shell/links.ts DONATE_HE). Tests: e2e/calendars.spec.ts.",
])
add("LIB-021", [
    "BUILT 2026-11-04 (review fix): the head is sefaria.org's tag for tag (VERIFIED for de, en, he): og:title and twitter:title, description, og:description and twitter:description, og:type website, og:image and twitter:image (api/img-gen/translations/<lang>, facebook / twitter), og:image type and size, og:url, twitter:card summary_large_image, twitter:site @sefariaproject, hreflang alternates for www.sefaria.org and www.sefaria.org.il; no canonical, as live. Tests: e2e/translations.spec.ts ('the head').",
])
add("TOP-001", [
    "The address the old ReaderApp wrote: '&sort=' only when the panel had a sort — the server's 'Relevance' on a full page load, or one the reader chose. Arriving inside the app (a related topic, a card, Featured) it wrote '?tab=<tab>' alone, and after the topic search's Enter or click the bare '/topics/<slug>'. VERIFIED 2026-11-04.",
    "BUILT 2026-11-04 (review fix): src/lib/routing/load-entry.ts tells the history entry the document was loaded at (by the router's history index, which a replace keeps); TopicPageRoute writes the sort only there or once chosen, and leaves the address alone after the landing search (navigation state 'bareAddress'). Tests: e2e/topic-page.spec.ts ('a related topic opens in the app'), e2e/topics-landing.spec.ts.",
])
add("TOP-036", [
    "BUILT 2026-11-04 (review fix): src/server/topics-owner.ts decides before rendering, in the cluster's pass-through: /topics/<slug> and /topics/b/<slug> are this client's only for the A–Z list's slugs, /topics/category/<slug> only for the TOC's categories; ?editor=1 and everything else go to Django without the topic being fetched (curl with pass-through: /topics/aarons-staff 200 django 1.6s, /topics/category/moses 0.3s, /topics/moses?editor=1 1.0s). In the app, readTopicPage hands a slug outside the A–Z list to Django without fetching it, so the backend 'pools' field is no longer needed to decide. Tests: src/server/topics-owner.test.ts.",
])

status["LIB-021"] = {"status": "done", "note": "Head tags as live, tag for tag (review fix 2026-11-04)", "by": "src/routes/translations.$slug.tsx, src/lib/translations/translations-page.ts"}
status["TOP-036"] = {"status": "done", "note": "Decided on the server before rendering: A–Z slugs and TOC categories are the client's, the rest Django's (src/server/topics-owner.ts)", "by": "src/server/topics-owner.ts, src/lib/topics/topic-page-source.ts (readTopicPage), src/features/topics/DjangoHandoff.tsx"}

json.dump(atlas, open(T / "features.json", "w"), ensure_ascii=False, indent=1)
json.dump(status, open(T / "rebuild-status.json", "w"), ensure_ascii=False, indent=1)
