# References — Login / Register UI (React)

## Internal — current state (to replace)

### Legacy auth templates
- **Location:** `templates/registration/login.html`, `templates/registration/register.html`, `templates/registration/password_reset*.html`
- Server-rendered, static CSS (`registrationContent static`, `registration-links`, `button control-elem`), inline SSO `<script>` blocks. Being reimplemented in React.

### One Tap
- **Location:** `templates/base.html` (Google One Tap block, guarded by `GOOGLE_SSO_CLIENT_ID and not request.user.is_authenticated`)
- Add a `suppress_one_tap` flag to hide it on `/login` and `/register`.

## Internal — backend to reuse

### Auth endpoints
- **Location:** `sefaria/urls_shared.py`
  - `login/` → `CustomLoginView` (HTML form; no-JS fallback)
  - `api/login/` → `TokenObtainPairView`, `api/login/refresh/` → `TokenRefreshView` (JWT)
  - `api/auth/google/callback`, `api/auth/apple/callback` (SSO; session + JWT)
  - `api/auth/link/<provider>`, `api/auth/status`
- New: `api/auth/login` (JSON + session) — to add in Phase 3.

### Forms
- **Location:** `sefaria/forms.py` — `SefariaLoginForm` (`EmailAuthenticationForm`), `SefariaNewUserForm` / `SefariaNewUserFormAPI`, `SefariaPasswordResetForm`, `SefariaSetPasswordForm`.

### SSO views & service
- **Location:** `sefaria/views.py` (`google_sso_callback`, `apple_sso_callback`, `link_social_provider`, `user_auth_status`), `sso/service.py` (`SocialAuthService`).

## Internal — build & mount pattern

### Standalone bundle precedent
- **Location:** `node/webpack.config.js` (array of configs), `node/webpack.diffPage.js`/`webpack.explore.js`/`webpack.timeline.js` (`require('./webpack.config.js')[n]`), `package.json` `build-*`/`watch-*` scripts.

### render_bundle usage
- **Location:** `templates/edit_text.html` (`{% load render_bundle from webpack_loader %}` … `{% render_bundle 'main' %}`).

### i18n primitives
- **Location:** `static/js/sefaria/sefaria.js` (`Sefaria._()`, `_i18nInterfaceStrings`, `_cacheSiteInterfaceStrings`), `InterfaceText` in `static/js/Misc`. Use these as-is for all auth copy. (Weblate translation of the interface-strings catalog is an existing pipeline and **out of scope** for this project.)

## External

- Figma — Registration / Login Wireframes:
  https://www.figma.com/design/2WflG98PDhWQ7OKrDkaCPb/Registration---Login-Wireframes?node-id=65-331
- Key Figma nodes (via `figma-desktop` MCP, verified 2026-06-08):
  - `65:331` — page root (all sections)
  - `179:8472` Desktop **Sign In** (choose screen) · `179:8446` **Create An Account** · `198:10957` **Email Create Account (filled)**
  - `187:76581` **Inputs** (`Input Field` states) · `187:76568` **Buttons** (`Buttons [for now]`) · `192:6701` **Legal Text & reCAPTCHA error**
  - `179:7896` **Mobile Web** (≤842; Google/Apple redirect) · `179:8445` **Desktop** (Google/Apple popup)
  - `198:11904` **Google One-Tap** · `187:76018` **Hebrew Examples**
  - Tokens via `get_variable_defs` on the Inputs/Buttons sections (see 1601 plan.md Phase 0).
- Google Identity Services (One Tap + button): https://developers.google.com/identity/gsi/web/guides/overview
- Sign in with Apple JS: https://developer.apple.com/documentation/sign_in_with_apple/sign_in_with_apple_js

## Source — handover meeting

- Fireflies: "Placeholder — SSO SSD Perhaps last handover" (2026, participants: Akiva Berger, Penina Levy, Michael Fankhauser). Key decisions captured in product.md / shape.md: card content-swap, cross-flow nav, forgot-password inline, One Tap off on auth pages, mobile ≤842px breakpoint, existing interface-strings mechanism (Weblate out of scope), provider order Google→Apple.

## Related specs

- [`2026-06-08-1601-react-component-library`](../2026-06-08-1601-react-component-library/plan.md) — dependency for form primitives and custom provider buttons.
- [`2026-04-28-1601-apple-sso-login`](../2026-04-28-1601-apple-sso-login/plan.md) — SSO backend.
