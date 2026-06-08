# React Component Library — Product Spec

**Status:** Planned (Q3 foundation, started in tandem with the Login/Register UI refresh)
**Owner:** Akiva Berger
**Designer:** Penina Levy
**Last Updated:** 2026-06-08

> Companion spec: [`2026-06-08-1602-login-register-ui-react`](../2026-06-08-1602-login-register-ui-react/plan.md) — the first consumer of this library. Build the components here; consume them there.

---

## Problem

Sefaria has no real form-component layer. `static/js/common/` has `Button`, `Card`, `RadioButton`, `ToggleSwitch`, etc., but **there is no `Input`/`TextField` component** — inputs are bespoke CSS wrapped around raw `<input>` elements (the login page still uses static CSS from ~12 years ago). Every new form re-styles inputs from scratch, error states are inconsistent (native browser tooltips), and there is no single source of truth that an AI agent or engineer can reach for. The SSO Login/Register refresh forces the issue: it needs production-grade inputs and buttons that match a fully componentized Figma.

The Figma is already built as a component system (variants, properties, tokens) — effectively a Storybook in design. Our code should mirror it.

---

## Goals

1. Establish a **token-driven, Storybook-first component library** under `static/js/common/`, starting with form primitives.
2. Ship a canonical **`Input`/`TextField`** covering every state in the Figma: default, focus, filled, error, disabled, password-mask + show/hide, inline error message with info icon, label, required.
3. Consolidate **buttons** (including the Google/Apple provider buttons) into the existing `Button` contract.
4. Make components **RTL/LTR aware**, including the mixed case Penina flagged: an LTR value field (email/password) inside an RTL (Hebrew) UI.
5. Keep **CSS classes as the styling canon** so server-rendered consumers can share the exact same styling without mounting React.
6. Be **AI-friendly**: one canonical path per primitive, predictable props, no competing variants.

---

## Non-Goals

- Rewriting every existing input across the site at once. Adoption is **gradual** — replace in place as pages are touched.
- A full visual overhaul of unrelated pages (profile, settings) in this spec.
- Picking up a third-party headless component library. (Evaluated — see shape.md — but the scope here is Sefaria-owned primitives seeded from the Figma.)
- React Native / mobile-app components. The app is a separate codebase with its own component needs.

---

## Scope (component inventory)

Component names in the right column are the **Figma source-of-truth names** (file: Registration & Login — SSO & UI Refresh).

| Component | Priority | Figma → notes |
|---|---|---|
| **Design tokens** (CSS custom properties) | P0 | Adopt the `Semantic/*` + `Core/*` tokens; replace leaked Figma `sds-*` / `SF Pro` placeholders. |
| **`Input` / `TextField`** | P0 | Figma **`Input Field`** (`187:76581`). All 10 named states (incl. *with link*, *filled/error*, *placeholder/error*, password mask/unmask) + RTL/LTR + a11y. |
| **`FormField`** | P0 | Label-above-field + inline error composition. |
| **`Button`** (consolidation) | P1 | Figma **`Buttons [for now]`** (`187:76568`): primary (navy), secondary (white/bordered), states default/hover/disabled. |
| **`ProviderButton`** | P1 | **Custom** secondary button + provider icon + **black text**, triggering the Google/Apple SDK programmatically (not SDK-rendered chrome). |
| **`Captcha`** wrapper | P1 | Figma **`Captcha`** (`192:6701` section) — adds the missing error state. |
| **`Divider`** ("or" / "או") | P2 | Between SSO and email sections. |
| **`AuthCard`** / layout primitive | P2 | Figma **`Form Card`** — responsive; mobile = all screens **≤ 842px**. May extend `Card.jsx`. |
| **`LegalText`** block | P2 | Figma **`Legal Text`** — "By continuing, you are agreeing to Sefaria's Terms of Use and Privacy Policy" with links. |

---

## Success Criteria

- [ ] A tokens file centralizes color/spacing/typography/radius/state custom properties; design-vs-code name mismatches reconciled.
- [ ] `Input` renders every Figma state, supports password show/hide, renders inline errors with the info (not warning) icon, and works in EN + HE including the LTR-in-RTL case.
- [ ] Every component has a Storybook story covering all states in EN and HE.
- [ ] `Button` exposes the provider/auth treatments without new ad-hoc CSS at call sites.
- [ ] The Login/Register UI spec consumes these components with no bespoke input CSS.
- [ ] Components meet a11y baseline: labelled controls, `aria-invalid`/`aria-describedby` on errors, keyboard operable, color is never the sole state signal.

---

## Open Questions

1. Token ownership: do design tokens live in one new CSS file, or fold into `static/css/s2.css`? (Leaning: dedicated `tokens.css` imported first.)
2. Do we adopt the Lucide icon set wholesale now (Penina standardized icons on Lucide in Figma), or only the icons these components need?
3. Should `FormField` own client-side validation, or remain presentational with validation passed in? (Leaning: presentational; parent owns validation.)
