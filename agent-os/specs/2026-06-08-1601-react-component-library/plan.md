# React Component Library — Implementation Plan

## Context

Seed a token-driven, Storybook-first component library under `static/js/common/`, starting with the form primitives the Login/Register UI refresh needs. CSS classes (driven by design tokens) are the styling canon so both React and server-rendered consumers share one source of truth. Follow the `Button.jsx` house style throughout.

This plan is the dependency of [`2026-06-08-1602-login-register-ui-react`](../2026-06-08-1602-login-register-ui-react/plan.md). Phases 0–2 here unblock that spec; Phases 3–5 can land in parallel with it.

---

## Phase 0: Design Tokens

### Task 1: Token layer
- Create `static/css/tokens.css` (imported before `s2.css`) with CSS custom properties for color, spacing, typography, radius, and **state colors** (error, focus, disabled).
- **Adopt the Sefaria semantic tokens from the Figma** (`get_variable_defs`) and **drop the leaked Figma placeholders**. Confirmed values:

  | Purpose | Figma token | Value |
  |---|---|---|
  | Primary action / button | `Semantic/Action/Primary` (+ hover) | `#18345d` / `#132b4c` |
  | Text primary (incl. provider-button text) | `Semantic/Text/Primary` | `#121212` |
  | Text muted / placeholder | `Semantic/Text/Muted` | `#707070` |
  | Focus border | `Semantic/Border/Focus` | `#cccccc` |
  | Error border + text | `Semantic/Feedback/Error/*` | `#c03522` |
  | Inline link | `functional/inline-link-blue` / `Semantic/Text/Link` | `#4871bf` / `#18345d` |
  | Disabled / neutral border | `Core/Neutral/Gray/400` / `/250` | `#999999` / `#e6e6e6` |
  | Secondary-button hover | `Core/blue TBR/100` | `#f0f7ff` |
  | Spacing scale | (clean) | 4 · 8 · 12 · 16 · 24 · 48 |

- **Cleanup target:** replace `var(--sds-size-*)`, `var(--sds-color-*)` and the stray `Body/Regular = SF Pro` with Sefaria equivalents (English sans = Roboto per the Figma; Hebrew = Heebo; serif headings use the Sefaria serif). These `sds-*` / `SF Pro` values are Figma "Simple Design System" defaults that leaked in — this **is** the drift Penina flagged.
- Audit existing `:root` vars in `static/css/s2.css` (e.g. `--sefaria-blue`, `--dark-grey`); alias to the semantic tokens rather than duplicate. Record the final mapping table in `references.md`.

### Task 2: Icon assets
- Import the Lucide-based icons Penina ships (info icon, eye/eye-off for password, provider marks) into `static/icons/`. Decide wholesale-Lucide vs. as-needed (Open Question 2).

---

## Phase 1: Input / TextField (core)

### Task 3: `Input` component
- New `static/js/common/Input.jsx` following the `Button.jsx` contract (functional, `PropTypes`, tokenized CSS classes, no inline styles).
- Props: `type` (text|email|password), `value`, `onChange`, `label`, `name`, `id`, `placeholder`, `error` (string|null), `disabled`, `required`, `dir`, `autoComplete`, `trailingLink` ({text, href|onClick} — the Figma **"with link"** variant, e.g. "Forgot password?" in the label row), plus `...rest` passthrough.
- States via CSS classes: `sefaria-input`, `--focus`, `--filled`, `--error`, `--disabled` (error covers both empty `placeholder/error` and `filled/error`).
- Password: mask + show/hide toggle (**eye** / **eye-off** icon), accessible toggle button.
- Direction-aware: support LTR value in RTL UI (email/password in Hebrew).

### Task 4: Inline error + a11y
- Render inline error message with the **info icon** (not a warning icon — deliberate, per Figma) when `error` is set.
- Wire `aria-invalid`, `aria-describedby` → error node id. Color is never the only signal (icon + text).

### Task 5: `Input` stories
- `stories/common/Input.stories.jsx`: default, focus, filled, error, disabled, password (masked + revealed), EN, HE, and the LTR-in-RTL case. Mirror the `Button.stories.jsx` `argTypes` style.

### Task 6: `FormField`
- `static/js/common/FormField.jsx`: composes label + `Input` + error region into one labelled unit. Presentational; validation passed in. Story with required/optional + error variants.

---

## Phase 2: Buttons

### Task 7: Consolidate auth/provider treatments into `Button`
- Extend `Button.jsx` variants to cover the auth buttons ("Continue with email" etc.) using tokens — no new ad-hoc CSS at call sites.
- Keep the docstring discipline: prefer variants over `className`.

### Task 8: `ProviderButton`
- `static/js/common/ProviderButton.jsx`: a **custom** secondary `Button` + provider icon + black-text (`Semantic/Text/Primary`) that triggers the Google GSI / Apple JS SDK programmatically on click — matching the Figma `Buttons [for now]` secondary variant, **not** an SDK-rendered button.
- Follow Google's and Apple's button branding guidelines (icon, "Continue with …" wording, min size) for compliance.
- Stories for Google + Apple, EN/HE, default/hover/disabled.

---

## Phase 3: Form composition primitives

### Task 9: `Captcha` wrapper
- Wrap the existing captcha with the missing **error state** (red outline + inline message). Story with default + error.

### Task 10: `Divider` and `LegalText`
- `Divider` ("or" / "או") and `LegalText` (Privacy/ToS consent block, link slots). Stories EN/HE.

---

## Phase 4: Card / layout

### Task 11: `AuthCard` (or extend `Card.jsx`)
- Responsive auth card (Figma `Form Card`): mobile = **all screens ≤ 842px**, desktop ≥ 843 (matches the new site header). Desktop card ~640px wide; mobile 393px. Background-graphic slot, close/back affordances. Decide extend-`Card` vs. new component during build. Story at both breakpoints.

---

## Phase 5: Storybook hardening & docs

### Task 12: a11y + docs
- Add the Storybook a11y addon; ensure every story passes.
- Write a short "how to consume" doc (props, tokens, when to use `className`), and adoption guidance (gradual replacement).

---

## Verification

- `npm run jest` green for component behavior tests.
- Storybook builds; every component has a story; a11y addon clean.
- A throwaway integration check: render `FormField` + `ProviderButton` together and confirm token-driven styling matches Figma at both breakpoints, EN + HE.

---

## Critical Files

| File | Change |
|---|---|
| `static/css/tokens.css` | New — design tokens (P0 foundation) |
| `static/js/common/Input.jsx` | New — core input primitive |
| `static/js/common/FormField.jsx` | New — label+input+error composition |
| `static/js/common/ProviderButton.jsx` | New — Google/Apple SDK button wrapper |
| `static/js/common/Button.jsx` | Extend — auth/provider variants |
| `static/js/common/Captcha.jsx` | New — captcha + error state |
| `static/js/common/Divider.jsx`, `LegalText.jsx` | New — small primitives |
| `static/js/common/AuthCard.jsx` | New (or extend `Card.jsx`) — responsive auth card |
| `stories/common/*.stories.jsx` | New — one story per component, EN/HE, all states |
| `static/css/s2.css` | Align existing `:root` vars with tokens |
