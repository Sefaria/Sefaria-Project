"""Wave 4, fix lane d-shell, 2026-11-10: parity S3, S12, S12b; a11y S6, S7, S8, N1, N2, N3, N7, N9; exits F-9; security nits 3 and 5.
Idempotent: run twice, nothing changes."""

import json
import os
import pathlib

T = pathlib.Path(os.environ.get("ATLAS_DIR") or pathlib.Path(__file__).resolve().parents[1])
atlas = json.load(open(T / "features.json"))
by = {f["id"]: f for f in atlas}
status = json.load(open(T / "rebuild-status.json"))

NAMES = {
    "AI-003": "Chatbot user token and props",
    "AI-011": "Library Assistant chatbot widget",
    "STA-001": "Static content pages",
    "STA-008": "Product, tool and edition pages",
    "STA-012": "Educators, Word-by-Word, newsletter and sponsorship pages",
    "LIB-001": "Browse the Library category grid",
    "LIB-008": "Category page contents list",
    "GUI-011": "Mobile navigation menu",
    "I18-007": "Site language toggle in dropdowns",
    "SRC-063": "Mobile filter and sort panels",
    "TOP-003": "Topics landing page layout",
    "TOP-012": "Topic card",
    "LIB-022": "New Additions to the Library page",
    "CAL-001": "Learning Schedules page",
    "RTE-034": "Language switch URL (/interface)",
    "CON-072": "Edit a dictionary entry (moderator)",
}
for fid, name in NAMES.items():
    assert by[fid]["name"] == name, (fid, by[fid]["name"], name)


def add(fid, lines):
    print(fid, "-", by[fid]["name"])
    for l in lines:
        if l not in by[fid]["details"]:
            by[fid]["details"].append(l)


def set_status(fid, value):
    print(fid, "-", by[fid]["name"], "->", value["status"])
    status[fid] = value


add("AI-003", [
    "FIXED 2026-11-10 (wave 4, parity S3): a signed-out visitor gets the assistant when remote config's feature.chatbot.anonymous_enabled is not off (src/lib/assistant/access.ts assistantOnForAnonymous: Django's is_enabled_for_anonymous + normalize, read from /api/remote-config; no Django change), without a token; feature.chatbot.anonymous_free_answers goes to the widget as anon-free-answers.",
])
add("AI-011", [
    "FIXED 2026-11-10 (wave 4, parity S3): <lc-chatbot> for signed-out visitors (the remote-config switch), no user-id attribute, its login prompt's signup-options slot holding Sign up / Log in links to this client's auth pages with data-signup-source=rate_limit_login_button (the old slot had round Google/Apple/Email buttons: deliberate difference, the auth page offers the same three); the slot is hidden until the widget defines itself (the old library-assistant.scss rule). Not on /login and /register, as the old ReaderApp's !showAuth.",
    "Still different from sefaria.org (2026-11-10): sefaria.org now shows the widget on phones too (a full-screen sheet, and a 'Library Assistant' row in the phone menu); here not below 843px. Search's no-results text does not point to the assistant (NoSearchResults' library_assistant body and the chatbot:launcher event).",
    "e2e: the suite never loads the widget's script (e2e/helpers.ts open() answers lc-chatbot.umd.cjs with an empty script); the element and its attributes are unit-tested (src/features/assistant/LibraryAssistant.test.tsx).",
])
set_status("AI-011", {"status": "partial", "note": "Signed in and signed out (remote-config switch) on wide screens; not on phones (sefaria.org's full-screen sheet and menu row), no search no-results pointer", "by": "src/features/assistant/LibraryAssistant.tsx, src/lib/assistant"})

add("STA-001", [
    "FIXED 2026-11-10 (wave 4, parity S12): every static page sat 60px lower than on sefaria.org (the legacy page starts under its fixed 60px header and its first block clears it; ours starts below the header). The scoped legacy CSS now moves #staticContentWrapper up 60px (lib/static-page/legacy-css.ts LEGACY_BODY_DEFAULTS, build-time CSS only); its first 60px sit under the header, as there. e2e/static-pages.spec.ts measures the h1 at sefaria.org's y (/terms, /about 140; /educators, /mobile 130).",
    "FIXED 2026-11-10 (wave 4, v-a11y N2): a page's own <main> (about, team, jobs, products, the Hebrew ways-to-give...) is written as a <div> by the sanitiser, so the shell's <main> is the page's only one (sefaria.org has the duplicate: deliberate difference).",
])
add("STA-008", [
    "FIXED 2026-11-10 (wave 4, v-exits F-9): /mobile, /educators and the English /ways-to-give are rendered without asking Django at all (lib/static-page/port-model.ts: their title, description and body class, checked against Django's answers in e2e/fixtures/static-pages), so a Django without the content mode no longer sends them to Django's page (src/routes/page-route.test.ts).",
])
add("STA-012", [
    "FIXED 2026-11-10 (wave 4, v-exits F-9): /educators no longer needs Django's content mode (lib/static-page/port-model.ts).",
])
add("LIB-001", [
    "FIXED 2026-11-10 (wave 4, parity S12b): in the Hebrew interface the descriptions are the old 17.08px (the .int-he span's 122%) on a 24px line, not 14px/18px. v-a11y N7: the title, category links and descriptions carry dir with lang, and a Hebrew-interface fallback to the English description is marked English.",
])
add("LIB-008", [
    "FIXED 2026-11-10 (wave 4, parity S12b, v-a11y N7): Hebrew-interface descriptions 17.08px / 24px as on sefaria.org; lang with dir, and the language of what is shown (an English fallback is marked English).",
])
add("GUI-011", [
    "FIXED 2026-11-10 (wave 4, v-a11y S6): opened by the text panel's Menu button (which comes after the menu in the page), the menu takes focus (the menu itself, so a phone's keyboard does not open) and Escape gives it back to that button; opened by the header's own button, focus stays on the button. sefaria.org's phone hamburger is not focusable at all: deliberate difference.",
])
add("I18-007", [
    "FIXED 2026-11-10 (wave 4, v-a11y N9): the header's menus (language, Library, account) close when focus leaves them, and focus goes on to where the reader was going.",
])
add("SRC-063", [
    "FIXED 2026-11-10 (wave 4, v-a11y S7): closing the phone's Sort & filter dialog (Escape, x, Show Results) puts focus back on its 'Sort & filter results' button; a re-render inside the dialog (a filter ticked) no longer pulls focus back to the dialog.",
])
add("TOP-003", [
    "FIXED 2026-11-10 (wave 4, v-a11y S8): at 320px in Hebrew the newsletter band's 300px teaser no longer runs past the window (no horizontal page scroll; e2e/reflow.spec.ts).",
])
add("TOP-012", [
    "FIXED 2026-11-10 (wave 4, v-a11y N3): links in a card's description are underlined, not told apart by colour alone (sefaria.org underlines only on hover: deliberate difference).",
])
add("LIB-022", [
    "FIXED 2026-11-10 (wave 4, v-a11y S8, N2): the 725px column never runs past the window (1280px at 200% zoom had a 20px page scroll; e2e/reflow.spec.ts); the page's own <main id=updatesPage> is a <div> inside the shell's main (sefaria.org has both: deliberate difference).",
])
add("CAL-001", [
    "FIXED 2026-11-10 (wave 4, v-a11y N1): a visually hidden h1 'Learning Schedules' / 'לוח לימוד יומי' (sefaria.org has an empty h1).",
])
add("RTE-034", [
    "FIXED 2026-11-10 (wave 4, v-security nit 5; owner decision 2026-11-10: the cookie exactly as legacy): interfaceLang=<lang>; Domain=<get_cookie_domain of the host's language, or of all languages on an unpinned host>; Path=/ (a session cookie, no SameSite/Secure, as Django's set_cookie; curl on www.sefaria.org and www.sefaria.org.il); host-only on localhost; a stale host-only cookie is expired in the same response so it cannot shadow the domain one. A language on another domain for this module goes there with set-language-cookie (needs_domain_switch). A signed-in switch is passed to Django when pass-through is on, so the profile's interface_language (which outranks the cookie for them) is saved, as the old view does.",
])
add("CON-072", [
    "FIXED 2026-11-10 (wave 4, v-security nit 3): the editing box gets the stored entry through the display's sanitiser (keeping every attribute the server keeps on save: LexiconEntry.ALLOWED_ATTRS), not raw into innerHTML. The server's big tags and data: images are not in that sanitiser's list: their text is kept, the tag is not (an open question in the lane report).",
])

json.dump(atlas, open(T / "features.json", "w"), ensure_ascii=False, indent=1)
json.dump(status, open(T / "rebuild-status.json", "w"), ensure_ascii=False, indent=1)
