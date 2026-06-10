# Login / Register UI (React) — Shaping Notes

## Architecture

- **Dedicated webpack bundle, not part of the main reader app.** The auth pages are standalone. Add a `login` (auth) entry to `node/webpack.config.js` following the established standalone-bundle precedent (`webpack.diffPage.js`, `webpack.explore.js`, `webpack.timeline.js` are each `require('./webpack.config.js')[n]`). Render it into a slim Django template via `{% load render_bundle from webpack_loader %}{% render_bundle 'login' %}` (same `django-webpack-loader` mechanism `edit_text.html` uses).
- **Django keeps the shell and the auth backend.** Routing (`/login`, `/register`), CSRF tokens, the already-logged-in branch, redirects, and the actual auth endpoints stay in Django. React owns only the card UI + client flow. Settings the client needs (`GOOGLE_SSO_CLIENT_ID`, `APPLE_SSO_CLIENT_ID`, `next`, CSRF token) are bootstrapped into the page (data attributes / a small inline JSON blob), as other Sefaria pages bootstrap props.
- **`<AuthPage>` state machine.** A single React tree with a `mode`: `choose · email-login · email-register · forgot · reset · already-authed`. "Continue with email" and "back" are **state transitions, not URL changes**. URL stays `/login` or `/register`. Decision (from the SSO handover meeting): we do not reflect sub-state in the URL; the browser back button returns to the prior site page, and the card provides its own back button. This is acceptable because no flow deep-links into a sub-step.
- **Consumes the component library** ([spec 1601](../2026-06-08-1601-react-component-library/plan.md)): `Input`, `ProviderButton`, `Captcha`, `Divider`, `AuthCard`, `LegalText`, and `Button`.

## Decisions

- **Login submission → add a JSON `api/auth/login` endpoint that establishes a session.** *(Decided.)* The React form never does a full-page form POST. The SSO callbacks already `auth_login()` (session) + return JWT; email/password login matches. A thin `api/auth/login` view validates `SefariaLoginForm`/`EmailAuthenticationForm`, calls `auth_login()`, and returns JSON (errors inline). `CustomLoginView` (HTML form) stays as the no-JS fallback; `api/login/` (`TokenObtainPairView`, JWT-only, no session) is unchanged and used by the app, not this page.
- **Reuse SSO POC logic, ported into React.** Move the inline `<script>` blocks from `login.html`/`register.html` into the React app (`google.accounts.id` init, Apple `AppleID.auth.init`, callback POSTs). Behavior unchanged (popup desktop / redirect mobile web); only the host moves.
- **Provider controls use the custom Figma treatment.** Apple calls `AppleID.auth.signIn()`; Google retains an official transparent GIS interaction target over the custom visual. `AuthPage` still initializes popup on desktop and signed-state redirect on mobile web.
- **Strings use the existing interface mechanism; Weblate is out of scope.** *(Decided.)* All copy goes through `Sefaria._()` / `InterfaceText`, exactly as the rest of the React app does — add new source strings the same way existing interface strings are added. We do **not** take on any Weblate pipeline work in this project. New strings include the **SSO-collision errors** ("account already exists via Google/Apple/email", with a deep link into the right flow), the captcha error, and the refreshed reset-flow copy (from Penina's strings doc). The bulk of auth copy is static.
- **One Tap suppression is a base-template flag.** `base.html` currently renders One Tap for every anonymous user. Add a context flag (e.g. `suppress_one_tap`) set truthy on the login/register views so One Tap does not appear on those two pages, while remaining everywhere else.
- **Provider button order: Google on top, Apple next** (consistency with the rest of the product). Apple's iOS prominence rules are an app concern, handled in the app codebase.
- **Background graphic** is the navy **source-connections wave** image, from Penina as desktop + mobile PNGs (the mobile asset is rotated). Breakpoint: mobile ≤ 842px, desktop ≥ 843; the `AuthCard` (`Form Card`) handles the rest.

## Migration / risk

- The current page loads **no React bundle** — this introduces one on the auth routes. Cost is bounded (small standalone bundle, precedent exists). Confirm the webpack entry + `render_bundle` wiring early (Phase 0) to de-risk.
- Keep `CustomLoginView` + the legacy template path working until the React flow is verified, then retire the old markup + static CSS classes (`registrationContent static`, `registration-links`, `button control-elem`).
- The login page being fully separate spaghetti is an advantage: we can replace it wholesale with low blast radius (it shares almost nothing with the reader app).

## Out of scope (tracked elsewhere)

Mobile-app sign-in screens · removing first/last-name required fields · Voices/Library rollout · the full component library internals (spec 1601).
