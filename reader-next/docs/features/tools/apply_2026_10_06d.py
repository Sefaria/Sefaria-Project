"""Auth port (owner decision 7-1, 2026-10-06): the SSO AuthPage, sign-in state, header, One Tap, funnel analytics. Idempotent."""
import json, pathlib
T = pathlib.Path(__file__).resolve().parents[1]
P = T / "features.json"
atlas = json.load(open(P)); by = {f["id"]: f for f in atlas}
IDS = ["ACC-001", "ACC-002", "ACC-006", "ACC-007", "ACC-008", "ACC-009", "ACC-010", "ACC-011", "ACC-012", "ACC-013", "ACC-014",
       "GUI-003", "GUI-004", "GUI-010", "GUI-011", "CON-011", "RTE-032", "RTE-033", "RTE-052", "API-012", "ANL-002", "ANL-013", "STA-007"]
for fid in IDS: print(fid, by[fid]["name"])  # names checked by hand before use

def add(fid, lines):
    for l in lines:
        if l not in by[fid]["details"]: by[fid]["details"].append(l)

def drop(fid, prefix):
    by[fid]["details"] = [l for l in by[fid]["details"] if not l.startswith(prefix)]

# ── verified on the live site ─────────────────────────────────────────────────────────────────────────────────────
add("ACC-008", [
    "VERIFIED 2026-10-06 (www.sefaria.org/login, /register; 1280×900 and Pixel 7, computed styles + geometry): navy page #18345d with the line drawing (auth-bg-desktop.png at the bottom, auth-bg-mobile.png at the top on phones), padding 56px 32px (phone 56px 32px 24px); card 640px max, 16px radius, padding 56px 24px (phone 56 24 24), gap 32px, min-height 535 (choose) / 538 (login email) / 823 (register email); content capped at 348px. At 1280: card at (320,116) 640×535; heading at y 184; provider buttons 348×51 (1.5px #18345d border, 4px radius, 16px/600); 'or' divider 14px #707070 with #e6e6e6 rules; Continue with Email 348×51 navy; legal line 12px/1.35. Phone: card 348 wide at x 32, heading 30px.",
    "CORRECTION (VERIFIED 2026-10-06): the card heading is NOT serif — it is Roboto 40px/400 #121212 (30px at ≤842px), line-height normal. The AuthCard.jsx comment says 'serif heading'; the CSS never sets a serif face.",
    "VERIFIED 2026-10-06: copy of the choose / email / forgot views (English) as in i18n/interface/en.json auth.*; inputs 348×45, 1px #e6e6e6, 4px radius, 16px text, 14px labels; back arrow 48×48 at (32,32) in the card (phone (8,8), 16px padding).",
    "REBUILD (sefaria-reader auth-port): src/features/auth (AuthPage state machine, views, FormView, Google/Apple triggers, One Tap) and src/ui (AuthCard, TextField, ProviderButton, Captcha, AuthErrorBanner, LegalText, labelled Divider, Button size xl, AuthText). Same copy (en/he from the old json), same requests, same error handling; e2e/auth.spec.ts asserts the live geometry above at 1280 and on a phone.",
    "REBUILD DIFFERENCE (CSRF): there is no Django-rendered <meta name=csrf-token> in this client. The token is the LAST csrftoken cookie (as Django's parse_cookie picks it — safe with the cauldron double cookie); when there is none yet, GET /_allauth/browser/v1/auth/session first (VERIFIED 2026-10-06: it sets csrftoken; allauth browser_view calls get_token). src/lib/auth/csrf.ts, http.ts.",
    "REBUILD DIFFERENCE (a11y): the old inputs have outline:none and only lighten the border on focus; the rebuild adds a visible :focus-visible ring. The Google shell is aria-disabled while Google's button is not ready.",
    "REBUILD DIFFERENCE (phones): the old page is a fixed-height box that scrolls inside; in the rebuild the page itself scrolls (the reader's phone layout).",
])
add("RTE-032", [
    "VERIFIED 2026-10-06: titles 'Log in to Sefaria' and 'Create an Account' (www.sefaria.org); Hebrew site 'כניסה לחשבון בספריא' and 'יצירת חשבון' (www.sefaria.org.il). The reset page's 'Reset Your Password' has no Hebrew in locale/he.",
    "REBUILD: /login, /register and /password/reset/confirm/<uidb64>/<token>/ are routes of the new client (src/routes/_auth*.tsx — one AuthPage stays mounted across them); 'login', 'register' and 'password' left DJANGO_PREFIXES (src/server/pass-through.ts). Every POST to them still goes to Django. A signed-in reader asking for /login or /register goes to '/' as Django did. Trailing slashes are dropped by the router (307), the reset POSTs re-add Django's slash.",
    "REBUILD: the emailed token link is handed to Django (it validates the token, stores it in the session and 302s to …/<uid>/set-password/, which the client renders); VERIFIED 2026-10-06 against www.sefaria.org through the client's pass-through: an invalid token gets Django's page (no redirect), which the client turns into a 302 to the set-password address so the expired card shows there.",
])
add("ACC-011", [
    "REBUILD DIFFERENCE: Django rendered authResetValid into its page; the client is not Django, so the reset card first asks with an empty JSON POST to the link (a valid link answers 400 field errors and saves nothing; an invalid one answers _auth.code invalid_reset_link) and shows the card's Loading line meanwhile. src/features/auth/AuthPage.tsx probeResetLink.",
    "BUG (code reading, not verified live — needs a real reset link): in ResetExpiredView's 'no account for this link' case, 'Request New Link' sets the Forgot view and navigates to /login in the same tick; AuthPage's flow-change effect then resets the view to 'choose', so the reader lands on the choice, not on Forgot Password. Rebuild: lands on Forgot Password (AuthPage keepViewRef).",
])
add("ACC-009", ["REBUILD: LoginView posts JSON to /api/auth/login with X-CSRFToken; success is a full page load of safeNext(next), as before. Tested with mocked endpoints (unit + e2e)."])
add("ACC-010", ["REBUILD: same form-encoded noredirect POST to /register, the same field-code mapping (EMAIL_EXISTS_ERRORS, required → auth.required_field), reCAPTCHA v2 (explicit render, scaled, RTL-anchored) when RECAPTCHA_PUBLIC_KEY is set in the client's runtime config."])
add("ACC-012", [
    "REBUILD: useProviderTriggers ported (src/features/auth/use-provider-triggers.tsx): same GIS options (use_fedcm_for_button, ux_mode popup/redirect by ssoUseRedirect, continue_with, locale iw/en), same allauth provider-token POST, same Apple init/signIn and /api/auth/apple/callback, same redirect-mode cookie sefaria_sso_next and /accounts/apple/login/?next=. Client IDs come from GOOGLE_SSO_CLIENT_ID / APPLE_SSO_CLIENT_ID in the runtime config (empty = button hidden, as on the old site). Works only when the client is served same-origin with Django.",
])
add("ACC-001", ["REBUILD: the auth page is a route of the new client (src/features/auth/AuthRoute.tsx); in-app links to /login and /register (header, sign-up modal, cross-links) are router navigations and carry data-signup-source (src/features/auth/signup-source.ts). resumePendingSignUpAttempt runs once per page load in the root shell."])
add("ACC-007", ["REBUILD: routes src/routes/_auth.tsx (+ login, register, password.reset.confirm.$uidb64.$token). Logout stays Django's (/logout?next=/texts)."])
add("ACC-002", ["REBUILD: src/features/auth/use-google-one-tap.ts — same session key, 1.2s delay, auth-path re-check, prompt listener, analytics burst on the credential callback, reload on success; also suppressed over the client's cookie notice ([data-interruptive-ui]) and open <dialog>s. GIS is loaded for signed-out readers when a Google client ID is configured, as base.html did."])
add("ACC-013", ["REBUILD: see ACC-002 (same hook)."])
add("ACC-006", ["REBUILD: the sign-up modal's Sign Up / Sign in now go to the new client's own /register and /login (in-app), with next and data-signup-source=signup_modal_<kind>."])
drop("GUI-004", "REBUILD DECISION (pending owner): there is no sign-in in the new client.")
add("GUI-004", ["REBUILD (2026-10-06, owner decision 7-1): the modal's Sign Up / Sign in go to the client's own auth page (/register, /login ?next=<current address>), in-app."])
add("GUI-010", [
    "REBUILD (2026-10-06): signed-in menu built from Header.jsx LoggedInDropdown (Library module): profile picture (initials on #6f6f6f when there is none or a gravatar has not loaded), bold name, Account Settings, Torah Tracker, Site Language, New Additions, Help, Log Out (/logout?next=/texts). Signed in, the header drops Sign Up and the globe menu and shows Saved (/saved), as the old header does. Not checked live signed in (needs an account; e2e/auth-signed-in.spec.ts runs against a deployment).",
])
add("GUI-003", ["REBUILD: Sign Up goes to the client's /register?next= (in-app, data-signup-source=nav_bar)."])
add("GUI-011", ["REBUILD: signed in, the phone menu has Saved, History & Notes, Account Settings and Logout instead of Sign up / Log in."])
add("API-012", [
    "CORRECTION (VERIFIED 2026-10-06): GET /api/profile with no slug is NOT 'self' — profile_api raises Http404 when slug is missing (reader/views.py), so the anonymous request gets the HTML 404 page (checked live) and a signed-in one does too (code). The old client never asks: who is signed in arrives in DJANGO_VARS.",
    "Who-am-I for the new client: GET /_allauth/browser/v1/auth/session (VERIFIED 2026-10-06 anonymous: 401 JSON, meta.is_authenticated false; 200 with data.user.id when signed in) plus GET /api/user_stats/<id>?quick=1 (public_user_data: name, profileUrl, imageUrl = profile_pic_url_small; login_required and only for oneself). Neither is cached by Varnish.",
])
add("CON-011", ["2026-10-06: the client now knows who is signed in (viewer query); the signed-in tools themselves (notes, add to sheet …) are still to build — signed-in readers still get the sign-up modal for them."])
add("ANL-013", ["REBUILD: signupAnalytics.js and useSignUpTracking.js ported with their tests (src/lib/auth/analytics.ts, use-sign-up-tracking.ts): same event names, params, defaults (project site_registration, feature_name site_registration_form, transport beacon) and sessionStorage keys. Every event leaves through trackAuthEvent(name, params), which calls window.gtag('event', …) as the old code did — to be rewired to the shared analytics module at merge."])
add("ANL-002", ["REBUILD: a capturing click listener records data-signup-source for links to /login and /register; the auth page takes it on arrival (nav_bar, login_crosslink, signup_modal_<kind>). Typed/direct arrivals have none, as before."])
add("RTE-033", ["REBUILD: the client calls /api/auth/login, /api/auth/password/reset, /api/auth/apple/callback, /_allauth/browser/v1/auth/provider/token and /_allauth/browser/v1/auth/session same-origin; /_allauth, /accounts, /api, /logout stay Django's in the pass-through."])

# ── rebuild-only ─────────────────────────────────────────────────────────────────────────────────────────────────
if "ACC-016" not in by:
    atlas.append({
        "id": "ACC-016", "area": "accounts", "group": "Session", "name": "Who is signed in, at first paint (rebuild)",
        "summary": "The new client learns who is signed in from Django's session cookie while rendering on the server, so the header is right from the first frame.",
        "details": [
            "Viewer query (src/features/auth/viewer.ts): on the server, only when the request carries a sessionid cookie, the cookie is forwarded to /_allauth/browser/v1/auth/session and /api/user_stats/<id>?quick=1 (through Varnish, which passes them); the answer is dehydrated into the page. In the browser the same endpoints are asked same-origin after 5 minutes. Sign-in and sign-out are full page loads.",
            "Replaces the old DJANGO_VARS _uid / full_name / profile_pic_url / slug. /api/profile could not be used (see API-012).",
        ],
        "audience": "all", "platform": "all", "status": "rebuild-only", "tier": "core", "refs": [],
        "src": "sefaria-reader: src/lib/auth/session.ts, src/features/auth/viewer.ts",
    })

json.dump(atlas, open(P, "w"), ensure_ascii=False, indent=1)

S2 = T / "rebuild-status.json"; st = json.load(open(S2))
st.update({
    "ACC-001": {"status": "done", "note": "Auth page is a route; in-app links with signup source", "by": "src/features/auth/AuthRoute.tsx"},
    "ACC-002": {"status": "done", "note": "One Tap ported (needs GOOGLE_SSO_CLIENT_ID and same-origin Django)", "by": "src/features/auth/use-google-one-tap.ts"},
    "ACC-006": {"status": "done", "note": "Sign-up modal links to the client's own auth page", "by": "src/ui/SignUpModal"},
    "ACC-007": {"status": "done", "note": "/login, /register, reset link rendered here; logout Django's", "by": "src/routes/_auth.tsx"},
    "ACC-008": {"status": "done", "note": "Ported; geometry matched to sefaria.org at 1280 and on a phone", "by": "src/features/auth/AuthPage.tsx"},
    "ACC-009": {"status": "done", "by": "src/features/auth/views.tsx"},
    "ACC-010": {"status": "done", "note": "reCAPTCHA when RECAPTCHA_PUBLIC_KEY is configured", "by": "src/features/auth/views.tsx"},
    "ACC-011": {"status": "done", "note": "Reset validity asked with a side-effect-free probe; token link handed to Django first", "by": "src/features/auth/AuthPage.tsx, src/server/pass-through.ts"},
    "ACC-012": {"status": "done", "note": "Needs the client IDs in the runtime config and same-origin Django", "by": "src/features/auth/use-provider-triggers.tsx"},
    "ACC-013": {"status": "done", "by": "src/features/auth/use-google-one-tap.ts"},
    "ACC-014": {"status": "n/a", "note": "Mobile-app JWT endpoints; not used by the web client"},
    "ACC-016": {"status": "done", "by": "src/features/auth/viewer.ts"},
    "GUI-004": {"status": "done", "note": "Modal, all eight kinds; links to the client's own auth page", "by": "src/ui/SignUpModal, src/ui/Modal"},
    "GUI-010": {"status": "done", "note": "Signed-out and signed-in menus (signed-in not checked live)", "by": "src/ui/SiteHeader"},
    "RTE-032": {"status": "done", "note": "Login/register/reset routes here; logout Django's", "by": "src/routes/_auth.tsx"},
    "RTE-033": {"status": "done", "note": "Endpoints called same-origin; stay Django's in the pass-through", "by": "src/lib/auth, src/server/pass-through.ts"},
    "ANL-002": {"status": "done", "by": "src/features/auth/signup-source.ts"},
    "ANL-013": {"status": "done", "note": "Through trackAuthEvent → gtag until the shared analytics module", "by": "src/lib/auth/analytics.ts"},
    "CON-011": {"status": "partial", "note": "Signed-out gating done; the client knows who is signed in; signed-in tools still to build", "by": "src/features/reader/ConnectionsPane.tsx"},
})
json.dump(st, open(S2, "w"), ensure_ascii=False, indent=1)
