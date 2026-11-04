"""The translations-by-language pages, /translations/<lang>, ported to the new reader (lane: translations). Idempotent."""
import json, os, pathlib
T = pathlib.Path(os.environ.get("ATLAS_DIR") or pathlib.Path(__file__).resolve().parents[1])
atlas = json.load(open(T / "features.json")); by = {f["id"]: f for f in atlas}
IDS = ["LIB-020", "LIB-021", "LIB-029", "LIB-037", "RTE-011"]
for i in IDS: print(i, by[i]["name"])
def add(fid, lines):
    for l in lines:
        if l not in by[fid]["details"]: by[fid]["details"].append(l)
def new(f):
    if f["id"] not in by:
        atlas.append(f); by[f["id"]] = f
    print(f["id"], by[f["id"]]["name"])

add("LIB-020", [
    "VERIFIED 2026-11-04 (/translations/de, en, ar, yi, he; 1280px, phone User-Agent, Hebrew interface): no list in the server's HTML — it is fetched after load (/api/texts/translations/<lang>); corpora in Sefaria.toc order (de: Tanakh, Mishnah, Talmud, Midrash, Halakhah, Jewish Thought), sub-categories in the catalog's order of the corpus's contents (an API category the catalog does not have is dropped, as is a corpus the catalog does not have).",
    "Prioritized: the corpus's 'Uncategorized' texts that the catalog lists directly under the corpus (Halakhah: Kitzur Shulchan Arukh), as a bare <ul> before the <details>; when the corpus has an 'Uncategorized' key but none qualifies, an empty <ul> still renders. The rest go into a last 'Uncategorized' / 'לא מסווג' block whose titles are NOT translated (plain {y.title}).",
    "Sorting: sortFx compares order[0] only when both texts have order, else 0 (a stable sort keeps the API's order, which is index.order then version priority).",
    "Hebrew interface: names go through Sefaria._ → hebrewTerm, so the terms dictionary (Sefaria.terms from /data.js) wins over the index title: Exodus 'ספר שמות', Leviticus 'ספר ויקרא', Deuteronomy 'ספר דברים', Jonah 'יונה הנביא' (not the catalog's heTitle). The h1 keeps the page language's title (a German title in the Hebrew interface, in Heebo 30px); the tab reads 'מקורות'.",
    "Layout (1280): .content padding-top 60 (not the library home's 56); h1 = a 22px/500 grey Roboto line holding a 30px black adobe-garamond-pro span (Heebo in the Hebrew interface), 30px under it; tab list 1px #ccc rule, 18px under; the tab 22px Roboto, 10px padding, 4px #ccc underline, 30px inline-end margin; h2 24px black serif, margin-top 40 (collapses with the tab list's 18); summary 18px uppercase #666 serif, 30px over; <ul> flex-wrap, 20px over and under; li 18px serif, '•' with 0 5px margins. No category colour line. Phone (singlePanel): h1 10px over the tabs, tab 16px with 18px bottom padding, sidebar under the list.",
    "BUILT 2026-11-04 (src/routes/translations.$slug.tsx, src/features/library/TranslationsRoute.tsx, src/ui/TranslationsPage, src/lib/translations): the model is built on the server (createServerFn) from the shared catalog, the API answer and the terms dictionary (server copy of /data.js's terms) and put in the server's page; the browser never downloads the catalog or terms for it. Links keep the API's href byte for byte (ven=german%7CDie+f%C3%BCnf…) and open the reader in the app (VerbatimRouterLink). Pixel diff vs www.sefaria.org: see CHANGELOG 2026-11-04 — translations.",
    "Fixed on the way (not reproduced): getTranslation called on every render; the dead filter code referencing showFilterHeader.",
])
add("LIB-021", [
    "VERIFIED 2026-11-04: /api/texts/translations/he answers HTTP 500 after ~16 s on www.sefaria.org, so /translations/he shows only its title ('ספריה בעברית'), the Texts tab and the About module — kept: the new page shows the same and its server render waits at most the API deadline (8 s).",
    "VERIFIED 2026-11-04: an unknown slug (/translations/ro, /tr, /xx, /DE — the lookup is case-sensitive) is Django's 404 'Page Not Found | Sefaria'. Head: <title> and og:title / twitter:title = the language's title; description / og:description / twitter:description = its description; og:url, hreflang alternates and the img-gen og:image are the site-wide head (not per page in the new reader yet).",
    "BUILT 2026-11-04: src/lib/translations/translations-page.ts holds the 14 languages (title, description, direction) and the route answers 404 for any other slug (passed to Django in the cluster). The page's title, description, og:title/description and twitter:title/description are written per language.",
])
add("LIB-029", [
    "VERIFIED 2026-11-04: the title is an InterfaceText (Roboto 22px/500 in English, Heebo in the Hebrew interface) whatever its language; the body is a bare text node directly in the module (Roboto 16px #666, no <p>, no Learn More, no video button). English and Hebrew pages have no entry and show 'A Living Library of Torah' with the library's blurb in the interface language. Sidebar order: this module, the empty Promo slot, then the footer.",
    "BUILT 2026-11-04 (src/ui/NavSidebar/AboutTranslatedText.tsx). Deliberate difference: in the Hebrew interface the old bare German text inherited rtl and its final period showed at the line's start ('.der Entwicklung…'); the new module keeps the text's own lang/dir, so the period stays at the end.",
])
add("LIB-037", [
    "BUILT 2026-11-04: the language links are this client's own pages now (relative /translations/<code>, in-app navigation); ro and tr still 404 (passed to Django), as on sefaria.org.",
])
add("RTE-011", [
    "BUILT 2026-11-04: 'translations' removed from DJANGO_PREFIXES on the Library host; /translations/ is a client prefix in the route manifest and an app page (not a ref) in lib/reader/paths. On the Voices host it stays Django's (RTE-065).",
])
new({"id": "RTE-065", "area": "routing", "group": "Library page URLs", "name": "Library-only pages stay Django's on the Voices host",
     "summary": "A page the new reader renders for the Library (sefaria.org) is still passed to Django when it is requested on the Voices host, until the Library/Voices host model is decided.",
     "details": ["src/lib/routing/django-paths.ts LIBRARY_HOST_ONLY (first segment 'translations') + isVoicesHost (a host starting 'voices.'); isDjangoPath(pathname, method, host) in the request middleware (host from X-Forwarded-Host, else the request URL) and in the trailing-slash redirect.",
                 "Open question Q-E1 (TARGET_ARCHITECTURE): which pages each module serves. Added 2026-11-04 by the translations port."],
     "audience": "all", "platform": "all", "status": "live", "tier": "standard", "refs": ["sefaria/urls_library.py:24"], "src": "lane translations 2026-11-04"})
new({"id": "LIB-070", "area": "library-nav", "group": "Translations", "name": "Translations page link targets open the reader in that version",
     "summary": "Each text on a translations page opens the reader at its first section in that language's translation, side by side with the Hebrew.",
     "details": ["Old ReaderApp.openURL: a click inside .translationsPage opens the ref with ven from the link and takes the content language from its ?lang (bi). English/Hebrew commentaries bundled by collective title link to their category page /texts/<cats>/<collective> (spaces unescaped).",
                 "VERIFIED 2026-11-04: /Genesis.1?ven=german%7CDie+f%C3%BCnf+B%C3%BCcher+Moses…&lang=bi opens Genesis 1 with the Wohlgemuth German translation beside the Hebrew.",
                 "BUILT 2026-11-04: VerbatimRouterLink keeps the API's href byte for byte and navigates through the router on a plain click (modified clicks are the browser's)."],
     "audience": "all", "platform": "all", "status": "live", "tier": "standard", "refs": ["static/js/ReaderApp.jsx:1242", "reader/views.py:4907-4910"], "src": "lane translations 2026-11-04"})
json.dump(atlas, open(T / "features.json", "w"), ensure_ascii=False, indent=1)
S2 = T / "rebuild-status.json"; st = json.load(open(S2))
st["LIB-020"] = {"status": "done", "by": "src/ui/TranslationsPage, src/features/library/TranslationsRoute.tsx, src/lib/translations/translations-page.ts"}
st["LIB-021"] = {"status": "partial", "note": "Pages, 404s, title and description per language done; og:url, hreflang alternates and og:image are the site-wide head (platform-seo)", "by": "src/routes/translations.$slug.tsx, src/lib/translations/translations-page.ts"}
st["LIB-029"] = {"status": "done", "by": "src/ui/NavSidebar/AboutTranslatedText.tsx"}
st["LIB-037"] = {"status": "done", "by": "src/ui/NavSidebar/NavSidebar.tsx"}
st["LIB-070"] = {"status": "done", "by": "src/features/shared/RouterLink.tsx (VerbatimRouterLink), src/features/library/TranslationsRoute.tsx"}
st["RTE-011"] = {"status": "done", "by": "src/routes/translations.$slug.tsx, src/lib/routing/django-paths.ts"}
st["RTE-065"] = {"status": "done", "by": "src/lib/routing/django-paths.ts, src/server/pass-through.ts, src/start.ts"}
json.dump(st, open(S2, "w"), ensure_ascii=False, indent=1)
