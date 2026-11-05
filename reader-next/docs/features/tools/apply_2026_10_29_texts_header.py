"""/texts and the site header brought to pixel parity with sefaria.org (desktop 1280 and a phone User-Agent). Idempotent."""
import json, os, pathlib
T = pathlib.Path(os.environ.get("ATLAS_DIR") or pathlib.Path(__file__).resolve().parents[1])
atlas = json.load(open(T / "features.json")); by = {f["id"]: f for f in atlas}
IDS = ["LIB-001", "LIB-002", "LIB-004", "LIB-023", "LIB-028", "LIB-030", "LIB-031", "LIB-037", "GUI-001", "GUI-002", "GUI-003", "GUI-009", "GUI-010", "GUI-011", "PRM-014", "AI-001"]
for i in IDS: print(i, by[i]["name"])
V = " Verified on www.sefaria.org with Playwright, 2026-10-29."
def add(fid, lines):
    for l in lines:
        if l not in by[fid]["details"]: by[fid]["details"].append(l)
add("LIB-001", [
    "`/` answers 302 → /texts (any query dropped): Browse the Library is the site's home." + V,
    "Desktop geometry (1280px): the page scrolls inside .readerNavMenu .content under a fixed header (and promo banner); .contentInner is a 725px column centred beside the 420px sidebar, so the grid starts at x=97.5 with two 327.5px columns 10px apart and rows 6px apart; each .navBlock is a 4px colour line, a 24px/1.3 title (15px over, 8px under, margin-inline-end 20px) and a 14px/18px #666 description; the title row is 22px/500 #666 with 15px under it." + V,
])
add("LIB-002", [
    "The aleph/ayin toggle is the old .languageToggle: 34px, 1px #ccc border, 6px corners. On a phone (≤842px, the old singlePanel) it is hidden in the page (.navTitle .languageToggle display:none) and shown at the right of the mobile header instead, for the 'navigation' menus (home and category pages) — the old Header's hasLanguageToggle; never in the Hebrew interface." + V,
])
add("LIB-004", [
    "Phone layout: page padding 15px, title 25px under the header; the About blurb (AboutSefaria hideTitle) is 16px/normal #666 with 'Learn More ›' straight after the full stop (no gap, no underline — the a.inTextLink rules only apply inside .navSidebar), 34px over the grid; the sidebar follows 50px below the grid (20px margin, 30px padding, then an empty module's 34px) with module titles 10px over their content, not 20px. The desktop-only AboutSefaria module is not in the phone sidebar (TextsPage passes it for multiPanel only)." + V,
])
add("LIB-023", [
    "Sidebar geometry: 420px, #fbfbfa, modules 34px apart in block flow (a module's last margin folds into the 34px), titles 22px/500 #666 with a 1px #ccc rule 14px under and 20px over the content; 120px of grey under the footer (the old border-bottom), which sets how far the desktop page scrolls; the footer (.stickySidebarFooter) is an empty titled rule then links 16px #666 with 10px over and 16px after each." + V,
])
add("LIB-028", ["'Getting Started (2 min)' is .button.get-start: 221x39, the vector.svg play icon (not inverted) 10px from the label, margin-top 22px." + V])
add("LIB-037", ["Languages are 18px serif, black, joined by '•' (li::after, margin 0 5px), 22px under the description; Hebrew names (Yiddish) render in Taamey Frank via the English serif stack (--english-serif-font-family includes 'Taamey Frank' after adobe-garamond-pro)." + V])
add("LIB-030", ["Resources is an h3 (15px uppercase, no rule); its links are the old IconLink images (mobile.svg, educators.svg, visualizations.svg, torah-tab.svg, help.svg) 18px, 10px from the label, 29px apart." + V])
add("GUI-001", [
    "The old .headerInner.mobile: 15px side padding, three boxes spread across (space-between) — the Font Awesome 4 'fa-bars' glyph at 24px in #6f6f6f (20.57x17.14px, its top 4.3px into a 24px line), the 154x25 logo (centred only between the other two boxes, so x≈111 with the 34px toggle, ≈128 without), and the page's content-language toggle or an empty box. There is no interface-language control in the bar (that is in the menu)." + V,
])
add("GUI-002", [
    "Desktop bar: links 16px/500 #666 nudged down translateY(0.15em) (0.1em Hebrew), 30px apart, 60px after the 154x25 logo; search box 250x30, radius 250px, #ededec, the 18px search_mdl.svg 6px down/7px in and 9px from an 18px Cardo input that runs to the end; the keyboard_mdl.svg icon appears inside it on focus, 7px from the end; no focus ring after a click (only when tabbing, body.user-is-tabbing). 843–1086px: the logo becomes the 19x25 samech mark, links 24px apart and 20px after it, icons 16px apart." + V,
])
add("GUI-003", ["Right side: search, Sign Up (74x28, 14px/14px, 1px transparent border), then 18px image icons (help_mdl, globallanguageswitcher_mdl, moduleswitcher_mdl, profile_loggedout_mdl) 20px apart, the last 30px from the edge; every gap 20px." + V])
add("GUI-009", ["Drop-down (moduleDropdown): the full 'Sefaria' logo (logo.svg, 100x32) then Library / Voices / Developers with 12px dots (#18345D, #518159, #7C416F — the inline dot sits on the text baseline, not centred) and 'More from Sefaria ›' centred, every row 15px top and bottom, separators without margins." + V])
add("GUI-010", ["All header drop-downs: 200px white card 35px under the icon's top, end-aligned to it, shadow 0 1px 3px rgba(0,0,0,.25), radius 6px; items 16px black, 15px in, first 10/5px, middle 5/5px, last 5/10px; separators 5px margins; the language block is 'Site Language' (14px/18px #6f6f6f) over 'English • עברית'. The globe's menu rules the heading off (12px padding, #ccc line) and stacks the languages 33px apart with a Font Awesome tick by the current one." + V])
add("GUI-011", ["Layout: a fixed white sheet under the header filling the screen; search line 15px/10px with a #ededec rule; full-width rows 16px #666, 15px padding, 16px icons (book, topic, calendar, heart.png inverted on the blue Donate row) 15px from the label; the account part on #fbfbfa between #ccc rules: language row (globe, 'English • עברית'), Get Help, About, Voices/Developers with 16px dots, More from Sefaria (chevron), Sign up (login.svg) / Log in, groups split by #ededec hr lines." + V])
add("PRM-014", ["Geometry (1280px): a 104px #f7f7f7 strip under the header (padding 10px, 1px lightgrey rule), the #653259 card radius 10px padding 20px; ai-double-star.svg 41x43, 18px from two lines (16px 600 white; 16px at 0.85 opacity, 4px apart); buttons 38px high, 14px/18px 600: 'Log in to Try' white with a shadow, 'Maybe later' transparent; 50px before the buttons, 20px between them." + V])
add("AI-001", [
    "Mounted only for the library module, wide screens (not mobile), when remote config feature.client.show_join_chatbot_banner is true and the reader is not already in the experiment; never on /login, /register, /password/reset/confirm. Signed out: 'Log in to Try' → /login?next=/enable-library-assistant?next=<page> (data-signup-source la_banner), cookie signup_promo_banner_dismissed. Signed in: 'Try It' posts profile settings {library_assistant: true} and reloads (cookie chatbot_experiment_banner_dismissed). Back-off schedule from feature.chatbot.promoMaybeLaterJSON, session length from feature.chatbot.promoSessionLengthSeconds." + V,
])
add("LIB-031", ["The footer is .stickySidebarFooter.navSidebarModule: an empty <h1/> (its 14px padding and #ccc rule only), then .footerContainer (padding-top 15px) of 16px #666 links each with 10px over and 16px after; it follows the last module directly (sticky top 0), not pushed to the bottom." + V])
# an earlier run of this script put the Resources line under LIB-031 by mistake
by["LIB-031"]["details"] = [l for l in by["LIB-031"]["details"] if not l.startswith("Resources is an h3")]
json.dump(atlas, open(T / "features.json", "w"), ensure_ascii=False, indent=1)
S2 = T / "rebuild-status.json"; st = json.load(open(S2))
st["GUI-001"] = {"status": "done", "note": "Pixel parity with a phone User-Agent (scripts/parity-page.mjs)", "by": "src/ui/SiteHeader"}
st["GUI-002"] = {"status": "done", "note": "Pixel parity at 1280px incl. focus state and drop-downs (scripts/parity-page.mjs, parity-header-states.mjs); links point to the old site's pages until built", "by": "src/ui/SiteHeader"}
st["GUI-011"] = {"status": "done", "note": "Legacy layout, pixel parity signed out", "by": "src/ui/SiteHeader"}
st["PRM-014"] = {"status": "partial", "note": "Library Assistant promo with the old back-off; generic SiteWideBanner (Strapi) not built", "by": "src/features/shell/SiteWideBanner, src/lib/shell/promo-backoff.ts"}
st["AI-001"] = {"status": "partial", "note": "Signed-out banner done; signed-in 'Try It' (not in the experiment) not shown yet", "by": "src/features/shell/SiteWideBanner"}
json.dump(st, open(S2, "w"), ensure_ascii=False, indent=1)
