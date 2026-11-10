"""The translations-by-language pages, /translations/<lang>, ported to the new reader (lane: translations). Idempotent."""

import json
import os
import pathlib

T = pathlib.Path(os.environ.get("ATLAS_DIR") or pathlib.Path(__file__).resolve().parents[1])
atlas = json.load(open(T / "features.json"))
by = {f["id"]: f for f in atlas}
IDS = ["LIB-020", "LIB-021", "LIB-029", "LIB-037", "RTE-011", "SHL-036"]
for i in IDS:
    print(i, by[i]["name"])


def add(fid, lines):
    for l in lines:
        if l not in by[fid]["details"]:
            by[fid]["details"].append(l)


def fix(fid, old, new_line):
    """Replace a detail line this script wrote earlier that turned out wrong (idempotent: no-op once replaced)."""
    d = by[fid]["details"]
    if old in d:
        d[d.index(old)] = new_line
    elif new_line not in d:
        d.append(new_line)


def new(f):
    if f["id"] not in by:
        atlas.append(f)
        by[f["id"]] = f
    print(f["id"], by[f["id"]]["name"])


add(
    "LIB-020",
    [
        "VERIFIED 2026-11-04 (/translations/de, en, ar, yi, he; 1280px, phone User-Agent, Hebrew interface): no list in the server's HTML — it is fetched after load (/api/texts/translations/<lang>); corpora in Sefaria.toc order (de: Tanakh, Mishnah, Talmud, Midrash, Halakhah, Jewish Thought), sub-categories in the catalog's order of the corpus's contents (an API category the catalog does not have is dropped, as is a corpus the catalog does not have).",
        "Prioritized: the corpus's 'Uncategorized' texts that the catalog lists directly under the corpus (Halakhah: Kitzur Shulchan Arukh), as a bare <ul> before the <details>; when the corpus has an 'Uncategorized' key but none qualifies, an empty <ul> still renders. The rest go into a last 'Uncategorized' / 'לא מסווג' block whose titles are NOT translated (plain {y.title}).",
        "Sorting: sortFx compares order[0] only when both texts have order, else 0 (a stable sort keeps the API's order, which is index.order then version priority).",
        "Hebrew interface: names go through Sefaria._ → hebrewTerm, so the terms dictionary (Sefaria.terms from /data.js) wins over the index title: Exodus 'ספר שמות', Leviticus 'ספר ויקרא', Deuteronomy 'ספר דברים', Jonah 'יונה הנביא' (not the catalog's heTitle). The h1 keeps the page language's title (a German title in the Hebrew interface, in Heebo 30px); the tab reads 'מקורות'.",
        "Layout (1280): .content padding-top 60 (not the library home's 56); h1 = a 22px/500 grey Roboto line holding a 30px black adobe-garamond-pro span (Heebo in the Hebrew interface), 30px under it; tab list 1px #ccc rule, 18px under; the tab 22px Roboto, 10px padding, 4px #ccc underline, 30px inline-end margin; h2 24px black serif, margin-top 40 (collapses with the tab list's 18); summary 18px uppercase #666 serif, 30px over; <ul> flex-wrap, 20px over and under; li 18px serif, '•' with 0 5px margins. No category colour line. Phone (singlePanel): h1 10px over the tabs, tab 16px with 18px bottom padding, sidebar under the list.",
        "BUILT 2026-11-04 (src/routes/translations.$slug.tsx, src/features/library/TranslationsRoute.tsx, src/ui/TranslationsPage, src/lib/translations): the model is built on the server (createServerFn) from the shared catalog, the API answer and the terms dictionary (server copy of /data.js's terms) and put in the server's page; the browser never downloads the catalog or terms for it. Links keep the API's href byte for byte (ven=german%7CDie+f%C3%BCnf…) and open the reader in the app (VerbatimRouterLink). Pixel diff vs www.sefaria.org: see CHANGELOG 2026-11-04 — translations.",
        "Fixed on the way (not reproduced): getTranslation called on every render; the dead filter code referencing showFilterHeader.",
    ],
)
add("LIB-021", [])
add(
    "LIB-029",
    [
        "VERIFIED 2026-11-04: the title is an InterfaceText (Roboto 22px/500 in English, Heebo in the Hebrew interface) whatever its language; the body is a bare text node directly in the module (Roboto 16px #666, no <p>, no Learn More, no video button). English and Hebrew pages have no entry and show 'A Living Library of Torah' with the library's blurb in the interface language. Sidebar order: this module, the empty Promo slot, then the footer.",
        "BUILT 2026-11-04 (src/ui/NavSidebar/AboutTranslatedText.tsx). Deliberate difference: in the Hebrew interface the old bare German text inherited rtl and its final period showed at the line's start ('.der Entwicklung…'); the new module keeps the text's own lang/dir, so the period stays at the end.",
    ],
)
add("LIB-037", [])
add(
    "RTE-011",
    [
        "BUILT 2026-11-04: 'translations' removed from DJANGO_PREFIXES on the Library host; /translations/ is a client prefix in the route manifest and an app page (not a ref) in lib/reader/paths. On the Voices host it stays Django's (RTE-065).",
    ],
)
new(
    {
        "id": "RTE-065",
        "area": "routing",
        "group": "Library page URLs",
        "name": "Library-only pages stay Django's on the Voices host",
        "summary": "A page the new reader renders for the Library (sefaria.org) is still passed to Django when it is requested on the Voices host, until the Library/Voices host model is decided.",
        "details": [
            "src/lib/routing/django-paths.ts LIBRARY_HOST_ONLY (first segment 'translations') + isVoicesHost (a host starting 'voices.'); isDjangoPath(pathname, method, host) in the request middleware (host from X-Forwarded-Host, else the request URL) and in the trailing-slash redirect.",
            "Open question Q-E1 (TARGET_ARCHITECTURE): which pages each module serves. Added 2026-11-04 by the translations port.",
        ],
        "audience": "all",
        "platform": "all",
        "status": "live",
        "tier": "standard",
        "refs": ["sefaria/urls_library.py:24"],
        "src": "lane translations 2026-11-04",
    }
)
new(
    {
        "id": "LIB-070",
        "area": "library-nav",
        "group": "Translations",
        "name": "Translations page link targets open the reader in that version",
        "summary": "Each text on a translations page opens the reader at its first section in that language's translation, side by side with the Hebrew.",
        "details": [
            "Old ReaderApp.openURL: a click inside .translationsPage opens the ref with ven from the link and takes the content language from its ?lang (bi). English/Hebrew commentaries bundled by collective title link to their category page /texts/<cats>/<collective> (spaces unescaped).",
            "VERIFIED 2026-11-04: /Genesis.1?ven=german%7CDie+f%C3%BCnf+B%C3%BCcher+Moses…&lang=bi opens Genesis 1 with the Wohlgemuth German translation beside the Hebrew.",
            "BUILT 2026-11-04: VerbatimRouterLink keeps the API's href byte for byte and navigates through the router on a plain click (modified clicks are the browser's).",
        ],
        "audience": "all",
        "platform": "all",
        "status": "live",
        "tier": "standard",
        "refs": ["static/js/ReaderApp.jsx:1242", "reader/views.py:4907-4910"],
        "src": "lane translations 2026-11-04",
    }
)

# --- review fixes (same day) ---
fix(
    "LIB-021",
    "VERIFIED 2026-11-04: /api/texts/translations/he answers HTTP 500 after ~16 s on www.sefaria.org, so /translations/he shows only its title ('ספריה בעברית'), the Texts tab and the About module — kept: the new page shows the same and its server render waits at most the API deadline (8 s).",
    "VERIFIED 2026-11-04: /api/texts/translations/he answers HTTP 500 after ~16 s on www.sefaria.org, so /translations/he shows only its title ('ספריה בעברית'), the Texts tab and the About module; the live page answers at once (TTFB 0.5–1.1 s) because it fetches the list in the browser. BUILT: the same page; the server's page waits for the list at most 1.5 s (LIST_WAIT_MS, prefetchTranslationsPage) and otherwise ships without it, and the server keeps a page's model 10 min and a failure 60 s, shared by concurrent requests (sharedTranslationsModel) — so the browser's ask after load joins or fails fast. Ours /translations/he TTFB 0.3 s once the failure is known, ≤1.7 s while the failing call is under way (it was 7.2 s).",
)
fix(
    "LIB-021",
    "VERIFIED 2026-11-04: an unknown slug (/translations/ro, /tr, /xx, /DE — the lookup is case-sensitive) is Django's 404 'Page Not Found | Sefaria'. Head: <title> and og:title / twitter:title = the language's title; description / og:description / twitter:description = its description; og:url, hreflang alternates and the img-gen og:image are the site-wide head (not per page in the new reader yet).",
    "VERIFIED 2026-11-04: loaded from the server, an unknown slug (/translations/ro, /tr, /xx, /DE — the lookup is case-sensitive) is Django's 404 'Page Not Found | Sefaria' (in-app navigation is different: LIB-037). A trailing slash is a 404 too (/translations/de/, /translations/: Django's ^translations/(?P<slug>[^.]+)$ reads the slug 'de/'). Head: <title> and og:title / twitter:title = the language's title; description / og:description / twitter:description = its description; og:url, hreflang alternates and the img-gen og:image are the site-wide head (not per page in the new reader yet).",
)
fix(
    "LIB-021",
    "BUILT 2026-11-04: src/lib/translations/translations-page.ts holds the 14 languages (title, description, direction) and the route answers 404 for any other slug (passed to Django in the cluster). The page's title, description, og:title/description and twitter:title/description are written per language.",
    "BUILT 2026-11-04: src/lib/translations/translations-page.ts holds the 14 languages (title, description, direction); loaded from the server the route answers 404 for any other slug (passed to Django in the cluster), and a Library-only path with a trailing slash is Django's (django-paths isDjangoPage) rather than the 308 the reader's trailing-slash rule gives its own pages — so /translations/de/ is Django's 404, as on sefaria.org. The page's title, description, og:title/description and twitter:title/description are written per language.",
)
fix(
    "LIB-037",
    "BUILT 2026-11-04: the language links are this client's own pages now (relative /translations/<code>, in-app navigation); ro and tr still 404 (passed to Django), as on sefaria.org.",
    "VERIFIED 2026-11-04: from /texts a click on Türkçe or Română opens a translations page inside the app on sefaria.org — ReaderApp.openURL sends any /translations/.+ to openTranslationsPage, titled by Sefaria.getHebrewTitle from ISOMap ('Türkçe Yahudi Metinleri', 'Texte evreiești în limba română'), the list from /api/texts/translations/tr|ro (tr: Kabbalah, Jewish Thought, Musar), the library's 'A Living Library of Torah' About module; back/forward work. Only a direct load or reload of /translations/tr|ro is Django's 404. BUILT 2026-11-04: the language links are this client's own pages (relative /translations/<code>, in-app navigation); ro, tr (and ISOMap's lad, jrb) open in the app only (IN_APP_TRANSLATION_LANGUAGES: the route's loader accepts them when it runs in the browser), and loaded from the server they are 404s passed to Django, as on sefaria.org. Not reproduced: an in-app link to a slug ISOMap does not know ('Jewish texts in xx' on live) is a 404 here — nothing links to one.",
)
fix(
    "RTE-065",
    "src/lib/routing/django-paths.ts LIBRARY_HOST_ONLY (first segment 'translations') + isVoicesHost (a host starting 'voices.'); isDjangoPath(pathname, method, host) in the request middleware (host from X-Forwarded-Host, else the request URL) and in the trailing-slash redirect.",
    "src/lib/routing/django-paths.ts LIBRARY_HOST_ONLY (first segment 'translations') + isVoicesHost: the hosts Django's DOMAIN_MODULES gives the voices module — voices.* (voices.sefaria.org) and the Hebrew Voices host chiburim.* (chiburim.sefaria.org.il, staging chiburim.sef-stage-il.org; sefaria/system/middleware.py). isDjangoRequest(request) in the request middleware takes the host from X-Forwarded-Host (its first value), else the request URL; the trailing-slash redirect uses the same host. Tests: src/server/pass-through.test.ts (both Voices hosts, X-Forwarded-Host, the Hebrew Library host www.sefaria.org.il keeps the page).",
)
add(
    "LIB-070",
    [
        "VERIFIED 2026-11-04: after the click sefaria.org writes the reader's own address, /Exodus.1?ven=german|Die_Heilige_Schrift,_trans._Dr._Simon_Bernfeld,_Berlin,_1902_-_German_[de]&lang=bi&aliyot=0 (spaces as _, '[de]' readable). BUILT: the same, byte for byte — lib/reader/search-serializer keeps '[' and ']' readable (it wrote %5Bde%5D on every reader address before).",
    ],
)
add(
    "LIB-029",
    [
        "Parity 2026-11-04: the deliberate lang/dir on the right-to-left About bodies (ar, fa, yi) is the remaining pixel difference on those pages — 0.09–0.10% at 1280 and 0.12–0.19% on a phone (the final period at the sentence's end, and Chromium's fallback face for Arabic script); every other language 0.00–0.01%.",
    ],
)
add(
    "LIB-020",
    [
        "Analytics, VERIFIED 2026-11-04: the old page's panel (div.readerPanel) carries data-anl-batch {\"panel_number\":1,\"content_lang\":\"english\"} (content_lang 'hebrew' in the Hebrew interface; a reader whose content language is Hebrew-only gets 'hebrew' too). The page's own elements have no data-anl-event; the events around it are the shell's (header, module switcher). BUILT: the same data-anl-batch on the page's frame (NavPage anlBatch) — panel 1, content_lang 'hebrew' in the Hebrew interface else 'english' (the Hebrew-only content-language case is not carried: the page sits outside the reader's settings). The module switcher's items (modswitch_item_click, data-anl-text) are rendered only once it opens — shell debt shared with /texts (SHL-036).",
        "Parity 2026-11-04, Hebrew interface: phone 0.01–0.05% (the header's icon); desktop 4.7–7.1% from the shell — the site-wide Library Assistant banner is 9px taller on our side, the header labels ('מקורות' vs 'טקסטים') and the search box differ; shifted 9px the main column is 0.000%.",
    ],
)
add(
    "SHL-036",
    [
        "2026-11-04 (translations port): the library's menu pages (/texts, its categories) still lack the old readerPanel's data-anl-batch; /translations/<lang> has it (NavPage anlBatch).",
    ],
)
json.dump(atlas, open(T / "features.json", "w"), ensure_ascii=False, indent=1)
S2 = T / "rebuild-status.json"
st = json.load(open(S2))
st["LIB-020"] = {
    "status": "done",
    "by": "src/ui/TranslationsPage, src/features/library/TranslationsRoute.tsx, src/lib/translations/translations-page.ts",
}
st["LIB-021"] = {
    "status": "partial",
    "note": "Pages, 404s, title and description per language done; og:url, hreflang alternates and og:image are the site-wide head (platform-seo)",
    "by": "src/routes/translations.$slug.tsx, src/lib/translations/translations-page.ts",
}
st["LIB-029"] = {"status": "done", "by": "src/ui/NavSidebar/AboutTranslatedText.tsx"}
st["LIB-037"] = {
    "status": "done",
    "by": "src/ui/CategoryPage, src/ui/NavSidebar, src/features/library, src/routes/translations.$slug.tsx (ro/tr in the app)",
}
st["LIB-070"] = {
    "status": "done",
    "by": "src/features/shared/RouterLink.tsx (VerbatimRouterLink), src/features/library/TranslationsRoute.tsx, src/lib/reader/search-serializer.ts",
}
st["RTE-011"] = {
    "status": "done",
    "by": "src/routes/translations.$slug.tsx, src/lib/routing/django-paths.ts, src/server/pass-through.ts",
}
st["RTE-065"] = {"status": "done", "by": "src/lib/routing/django-paths.ts, src/server/pass-through.ts, src/start.ts"}
json.dump(st, open(S2, "w"), ensure_ascii=False, indent=1)
