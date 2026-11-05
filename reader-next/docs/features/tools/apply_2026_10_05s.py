"""Site header, mobile menu, cookie notice, skip link, interface-language switch, Escape: verified 2026-10-05. Idempotent."""
import json, pathlib
T = pathlib.Path(__file__).resolve().parents[1]
atlas = json.load(open(T / "features.json")); by = {f["id"]: f for f in atlas}
def add(fid, lines):
    for l in lines:
        if l not in by[fid]["details"]: by[fid]["details"].append(l)
add("GUI-002", [
    "VERIFIED 2026-10-05 (/texts, signed out, English): role=banner .header > .headerInner (60px, box-shadow) with nav aria-label 'Primary navigation': logo link (aria-label 'Sefaria library logo'), 'Texts' /texts, 'Topics' /topics, 'Donate' (donate.sefaria.org …?c_src=Header, new tab). Hebrew labels: מקורות, נושאים, תרומה. The desktop header shows from 900px up; at 842px and below the mobile header replaces it (the same 842px where panels go single-column).",
    "Rebuild: SiteHeader (src/ui/SiteHeader). Destinations the client does not have yet are the old site's pages (src/lib/shell/links.ts). While reading on a phone the header is hidden (live: same).",
])
add("GUI-003", [
    "VERIFIED 2026-10-05: right side = search combobox (placeholder 'Search', aria-label 'Search for Texts or Keywords Here', maxlength 75, Hebrew keyboard icon), 'Sign Up' (/register, data-signup-source=nav_bar), Help icon link (aria-label 'Help', help.sefaria.org/hc/en-us), globe button 'Toggle Interface Language Menu', module-switcher button (aria-label 'Library'), profile button. Not rebuilt: the autocomplete (Phase 6) — submitting goes to the library's search page; the Hebrew keyboard.",
])
add("GUI-009", ["VERIFIED 2026-10-05: menu = logo link (/about), separator, Library (blue dot), Voices (green dot), Developers (purple dot, developers.sefaria.org), 'More from Sefaria >' (/products)."])
add("GUI-010", ["Rebuild: signed-out profile menu = Log in, Sign up, Site Language, New Additions (/updates), Help — with the library's account pages behind the links until accounts exist."])
add("GUI-011", [
    "VERIFIED 2026-10-05 (390px): bar = menu button (aria-label 'Menu'), centred logo, aleph/ayin language toggle; slide-out nav (aria-label 'Mobile navigation menu') = search, Texts, Topics, Learning Schedules (/calendars), Donate (c_src=MobileNavMenu), language toggle 'English • עברית', Get Help, About Sefaria (/mobile-about-menu), Voices on Sefaria, Developers on Sefaria, More from Sefaria, Sign up, Log in.",
])
add("I18-002", ["VERIFIED rule + rebuild: skip link 'Skip to main content' / 'דלגו לתוכן האתר' is the first tab stop and moves focus to <main id=main>; the rebuild hides it until focused."])
add("RTE-034", [
    "Rebuild: GET /interface/english|hebrew?next=<path> sets the interfaceLang cookie (1 year, Lax) and 302s to next. next must be a path on this site (a '//host', backslash or absolute URL falls back to '/'): the old route's open-redirect exposure is not copied.",
])
add("GUI-007", ["VERIFIED 2026-10-05: cookie notice text EN 'We use cookies to give you the best experience possible on our site. Click OK to continue using Sefaria. Learn More.' / HE 'אנחנו משתמשים ב\"עוגיות\" כדי לתת למשתמשים את חוויית השימוש הטובה ביותר. קראו עוד בנושא', button 'OK' / 'לחצו כאן לאישור'; a 360px grey box at the bottom left. Rebuild: same cookie name; shown after mount."])
add("SHL-071", ["Rebuild: Escape in a panel closes it unless a menu, dialog or input already used the key."])
json.dump(atlas, open(T / "features.json", "w"), ensure_ascii=False, indent=1)
S = T / "rebuild-status.json"; st = json.load(open(S))
st["GUI-002"] = {"status": "done", "note": "Links point to the old site's pages until built", "by": "src/ui/SiteHeader"}
st["GUI-003"] = {"status": "partial", "note": "No autocomplete (Phase 6), no keyboard, no accounts", "by": "src/ui/SiteHeader"}
st["GUI-009"] = {"status": "done", "by": "src/ui/SiteHeader"}
st["GUI-010"] = {"status": "partial", "note": "Signed-out menu only", "by": "src/ui/SiteHeader"}
st["GUI-011"] = {"status": "partial", "note": "Signed-out menu; search without autocomplete", "by": "src/ui/SiteHeader"}
st["GUI-007"] = {"status": "done", "by": "src/ui/CookieNotice"}
st["I18-002"] = {"status": "done", "by": "src/ui/SkipLink, src/routes/__root.tsx"}
st["RTE-034"] = {"status": "done", "by": "src/routes/interface.$lang.tsx"}
st["I18-007"] = {"status": "done", "by": "src/ui/SiteHeader"}
st["I18-008"] = {"status": "partial", "note": "Language switch done; the preferred-translation reset is not", "by": "src/ui/SiteHeader"}
st["SHL-071"] = {"status": "done", "by": "src/features/reader/TextPanel.tsx"}
json.dump(st, open(S, "w"), ensure_ascii=False, indent=1)
