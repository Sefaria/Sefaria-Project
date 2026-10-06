# Phase 7 plan — analytics, sign-in, feedback, and the rest of the site

Written 2026-10-06 after the owner's decisions on fonts (legacy Adobe Garamond Pro, built) and Dicta (merge as on sefaria.org,
built). This plan supersedes `docs/PHASE7_PROPOSAL.md`. Every fact about the old site below was read from Sefaria-Project or probed on
sefaria.org on 2026-10-06; file references are to Sefaria-Project unless they start with `src/`.

The rules from `docs/HANDOFF.md` still hold: the Feature Atlas is the specification, verify against the live site, tests tagged with
atlas IDs, one feature per commit, no pushing. Nothing in this plan sends data to Sefaria until its step says so and the owner has
answered the decision attached to it.

---

## 0. The decision everything else depends on: where the new client is served

Signed-in features, the feedback form and the analytics cookies all depend on whether the browser treats the new client and
`www.sefaria.org` as the same site. Three options:

| Option | How | Sign-in | Feedback | Cost |
|---|---|---|---|---|
| **A. Same origin (recommended)** | The edge (Cloudflare / nginx) sends reader and library paths to the new client and everything else (`/api/*`, `/login`, `/sheets/*`, admin) to Django, all on `www.sefaria.org` | Django's session cookie just works; API calls are same-origin, no CORS | Works as today (same-origin form POST with the CSRF cookie) | Path routing rules at the edge; a list of paths owned by each app |
| B. Subdomain (`reader.sefaria.org`) | New client on its own host; API stays on `www` | Session cookie must be scoped to `.sefaria.org`; API needs credentialed CORS for that one origin (nginx today sends `Access-Control-Allow-Origin: *`, which browsers refuse with credentials); `CSRF_TRUSTED_ORIGINS` | Needs CORS + CSRF changes (the preflight to `/api/send_feedback` returns 500 today) | Django and nginx changes, cross-origin bugs |
| C. Tokens (JWT) | `POST api/login/` (`MobileTokenObtainPairView`, simplejwt) + `api/login/refresh/`, as the native app does | Only DRF views accept the bearer token; most user endpoints (`api/profile`, `api/notes`, `api/user_history`) are plain Django views using the session | Same as B | Token storage in the browser (XSS exposure); endpoint changes |

**Recommendation: A.** It needs no change to Django's auth, keeps every old URL working, and lets the move happen path by path
(reader first, library pages next, the rest later). B is the fallback if the edge cannot route by path. C is not recommended for
the web.

Development: point `SEFARIA_API_ORIGIN` at a local Sefaria-Project server and proxy `/api`, `/login`, `/logout` through Vite, so
the dev setup is same-origin like production (option A) and nothing signed-in touches production.

**Owner decision 7-0:** A, B or C; and who owns the edge routing change.

---

## 1. Sign-in (atlas ACC-001…015, GUI-004, CON-011)

What exists on the old site (verified):
- Session auth (`SESSION_COOKIE_*`, `CSRF_COOKIE_HTTPONLY = False` so scripts can read the token); `AUTHENTICATION_BACKENDS`
  email + allauth; Google One Tap and Apple SSO (the SSO project, `sso/` app); the new React login/register page (`AuthPage`,
  `api/auth/login` JSON + session, password reset `api/auth/password/reset`); JWT endpoints for the native app.
- Who is signed in reaches the old client in the page (`DJANGO_VARS.props._uid`, `_email`, …). There is `GET api/profile` for the
  current user's profile.

Plan (with option A):
1. **Who am I.** A `user` query (`src/lib/cache/policies.ts` already has a `user` class: never persisted, always fresh) on
   `GET /api/profile`. Server render: forward the request's cookie to the API in the route loader so the first paint knows the
   reader is signed in (no sign-up modal flash). Verify the endpoint's anonymous answer first.
2. **Log in / Sign up / Log out.** Phase 7a: links to Django's `/login?next=`, `/register?next=`, `/logout` (the new AuthPage is
   already live there, with One Tap and Apple). Phase 7b (optional): port AuthPage into this client's component library — only if
   the owner wants one login UI codebase instead of two.
3. **Gate.** Replace the sign-up modal for signed-in readers: Save, Notes, Add to Sheet, Add Connection, history. The gating table
   `SIGN_IN_TOOLS` (ConnectionsPane) becomes "signed out → modal, signed in → the tool".
4. **CSRF.** Every write sends `X-CSRFToken` from the `csrftoken` cookie; one fetch helper does it.
5. **Tests.** e2e against a local Django with a seeded test user (`auth_english_user.json`-style fixtures exist in
   `e2e-tests/`); never against production accounts.

**Owner decisions 7-1:** keep Django's login page (recommended) or port it; which test accounts e2e may use.

---

## 2. Feedback endpoint (atlas GUI-027, CON-0xx Feedback)

Verified: `POST /api/send_feedback` → `sefaria.views.generate_feedback`. It reads the form field `json` (`request.POST['json']`) with
`type`, `refs`, `url`, `currVersions`, `uid`, `email`, `msg`, and sends an email: `content_issue` → corrections@sefaria.org,
`user_testing` → gabriel@sefaria.org, anything else → hello@sefaria.org. It is not `csrf_exempt`. A cross-origin preflight to it
returns HTTP 500 today. The rebuild's form already builds exactly this body (`src/lib/feedback.ts`) but has never sent it.

Plan:
1. With option A the form posts same-origin with the CSRF header: no server change.
2. Verify on a **local** Django with `EMAIL_BACKEND = console` (the email appears in the server log): body shape, CSRF, the three
   recipients, the error path.
3. One live check on staging (not production) with the owner watching the inbox.
4. Then enable it in production builds; until then the form says "sent" only in development (as today, intercepted in e2e).
5. Hardening worth proposing upstream (not required for parity): rate limiting, and the old code reads `uid` from the client
   instead of `request.user`.

**Owner decision 7-2:** staging inbox and go-ahead for the staging test.

---

## 3. Analytics (atlas ANL-001…017, SRC-104…108)

What the old site loads (templates/base.html, verified):
- **Google Tag Manager** (`GOOGLE_TAG_MANAGER_CODE`) and **GA4 gtag** (`GOOGLE_GTAG`) configured with `user_id`, `traffic_type`
  (`sefariaemail` for staff), `site_lang`, `site_version`.
- **AnalyticsEventTracker** attached to `#s2` for click, scrollIntoView, toggle, mouseover, input, inputStart — the declarative
  `data-anl-*` attributes (ANL-015).
- **TrackG4** `onclick_<component>` events, the **search funnel** (`searchAnalytics.js`, SRC-104…108), sign-up funnel (ANL-013),
  impressions (ANL-003…006), copy/print (ANL-011), sidebar events (ANL-012).
- **Simple Analytics** (cookieless) with a custom session id; **Sentry** for browser errors (ANL-017).

Plan:
1. **One module, one catalog.** `src/lib/analytics/`: a typed catalog of every old event name and its parameters (from the atlas
   entries and the old code), and adapters for gtag/GTM, Simple Analytics and Sentry. Components never call a vendor directly.
2. **Same names, same parameters**, so GA4 reports and dashboards keep working across the switch. Add one dimension,
   `client: "reader-next"`, so the two clients can be compared during the rollout.
3. **Page views** from the router (`onResolved`), with the old dimensions (ANL-001, ANL-010).
4. **Declarative tracking**: port AnalyticsEventTracker as one delegated listener reading `data-anl-*` attributes, so most events
   are markup, not code.
5. **Off by default.** No IDs in development or tests; the adapters are no-ops. Tests assert on an in-memory event log, never on
   network calls to Google.
6. **Consent**: match the old behaviour exactly (verify what loads before the cookie notice is accepted); if the owner wants a
   change (for example GDPR consent mode), it is a product decision, not part of parity.

**Owner decisions 7-3:** the same GA4 property and GTM container or a new data stream; whether Sentry gets a separate project for
the new client; consent behaviour.

---

## 4. The rest of Phase 7, in order

Counts are atlas features outside `retire`. "Read-only" means the public API only; "signed-in" needs section 1.

| Step | Area | Features | Kind | Depends on | Notes |
|---|---|---|---|---|---|
| 7a | Platform: deployment, SEO | 30 (14 core) | infra | 7-0 | Canonical URLs, sitemaps, robots, OpenSearch (SRC-028…030), meta tags; done with the deployment |
| 7a | Analytics | 16 | infra | 7-3 | Section 3 |
| 7a | Feedback | — | write | 7-0, 7-2 | Section 2 |
| 7a | Sign-in basics | 14 | signed-in | 7-0, 7-1 | Section 1, steps 1–4 |
| 7b | Topics pages | 31 (9 core) | read-only | topic TOC endpoint | The topic TOC exists only in Django's page context (`library.get_topic_toc_json()`; `/api/topics/toc` answers `{}`). Needs one small public endpoint in Sefaria-Project. Also finishes the Author/Topic card crumbs in search (SRC-070) |
| 7b | Calendars | 3 | read-only | — | `/api/calendars` is public |
| 7b | Sheets (reading) | 25 (9 core) | read-only | — | Public sheets through the API; the Voices module's look |
| 7b | Collections (reading) | 10 | read-only | — | `api/collections/<slug>` |
| 7b | Profiles (public) | 11 | read-only | — | `api/profile/<slug>`, followers/following |
| 7c | Saved, history, notes | 11 (5 core) | signed-in | 7a sign-in | `api/user_history/saved`, `api/profile/user_history`, `api/notes`; history sync `api/profile/sync` |
| 7c | Notifications | 11 | signed-in | 7a sign-in | `api/notifications`, `…/read` |
| 7c | Sheet editor | 28 (14 core) | signed-in | 7a sign-in, sheets reading | The biggest piece; plan it separately |
| 7c | Collections and profile editing, following | — | signed-in | 7a sign-in | |
| 7d | Promotions | 16 | CMS | owner | Strapi-driven banners and sidebar slots; decide whether the new client reads Strapi |
| 7d | AI (Library Assistant) | 20 | signed-in + third party | owner | Sends data to Sefaria's assistant service; separate decision |
| 7d | Linker and embeds | 14 | stays in Django | — | `linker.js` and embeds are served to other sites; no reason to move |
| 7d | Admin and moderator tools | 55 | stays in Django | — | Not part of the reading app |
| 7d | Static pages | 18 | link out or port | owner | Mostly content; porting is low value |
| — | Legacy pages | 25 (12 retire) | retire | — | Keep redirects only |

Suggested sequence: **7a** (infrastructure and sign-in, so later steps can be tested end to end) → **7b** (read-only pages, which can
ship behind the edge routing one path at a time) → **7c** (signed-in features) → **7d** (decisions and leftovers).

Each step follows the Phase 6 recipe: read the atlas entries, probe sefaria.org with a desktop and a phone User-Agent, compare
screenshots and computed styles (not only text), write a parity script for the area, build, test, record findings in the atlas.

---

## 5. Decisions needed from the owner (summary)

| # | Decision | Recommendation |
|---|---|---|
| 7-0 | Where the client is served | A: same origin, path-routed at the edge |
| 7-1 | Login page | Keep Django's (the new AuthPage); link with `next=` |
| 7-1 | e2e test accounts | Local Django with seeded users only |
| 7-2 | Feedback live test | Staging, with an inbox the owner watches |
| 7-3 | Analytics property and Sentry | Same GA4 property plus a `client` dimension; separate Sentry project |
| 7-3 | Consent | Match the old site |
| 7b | A public topic TOC endpoint in Sefaria-Project | Yes (small Django view returning `library.get_topic_toc_json()`) |
| 7d | Promotions (Strapi), Library Assistant, static pages | Decide per area when 7c is done |
| — | Adobe Fonts kit domains | Add the new client's host to kit `aeg8div` before launch |
