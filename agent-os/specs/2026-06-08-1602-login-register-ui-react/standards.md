# Standards — Login / Register UI (React)

## Bundle & template

- Standalone webpack bundle following the `webpack.diffPage.js` / `webpack.explore.js` precedent; mounted via `django-webpack-loader` `{% render_bundle 'login' %}` (as in `edit_text.html`).
- Django owns routing, CSRF, the already-authenticated branch, redirects, and a no-JS fallback (`CustomLoginView`). React owns only the card UI/flow.
- Client config (provider client IDs, `next`, CSRF, `mode`) is bootstrapped into the page; never hard-coded in JS.

## Components

- Consume the component library ([1601](../2026-06-08-1601-react-component-library/plan.md)) — no bespoke input/button CSS here. Missing affordance → add to the library, not to this page.

## Auth & sessions

- Email/password and SSO both establish a **Django session** (not JWT-only) for parity with the server-rendered rest of the site.
- All POSTs from React send the CSRF token. SSO callbacks remain `@csrf_exempt` (signed provider JWT is the trust anchor).
- Reuse existing SSO callbacks, register form/API, and password-reset backend unchanged.

## Internationalization

- All copy via `Sefaria._()` / `InterfaceText`; no hard-coded `int-en`/`int-he` literals in the React app.
- New source strings added via the **existing interface-strings mechanism** — **Weblate is out of scope** for this project. Verify HE + RTL, including LTR email/password fields inside the RTL UI.

## UX flow

- Card content-swap, not page navigation, for email login/register. URL stays `/login`/`/register`; card provides its own back button.
- "Forgot password?" inline in the login form.
- Google One Tap suppressed on `/login` and `/register`; present elsewhere.
- Provider order: Google, then Apple.

## Accessibility & analytics

- Errors inline with `aria-invalid` + `aria-describedby`; color never the sole signal.
- Preserve analytics conventions (`data-anl-*` / `Sefaria.track`) where the legacy flow tracked events.

## Testing

- Playwright for the flows (extend `e2e-tests/tests/sso-settings.spec.ts`); Jest for `AuthPage` state transitions. QA handoff to Cyril.
