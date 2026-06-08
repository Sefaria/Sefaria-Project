# React Component Library — Shaping Notes

## Architecture

- **Location & convention.** Components live in `static/js/common/`; stories in `stories/common/`. This is existing canon (`Button.jsx` + `Button.stories.jsx`). Do not introduce a new components root.
- **Mirror the `Button.jsx` contract.** Functional component, `PropTypes`, `variant` + `size` props, `className` as a discouraged escape hatch, icons from `/static/icons/<name>.svg`, copy via `InterfaceText` / `Sefaria._()`, keyboard a11y via `static/js/sefaria/util` helpers. `Button.jsx`'s docstring ("keep clean and minimal, stick to variants, avoid adding new ones") is the house style — apply it to every new component.
- **CSS is the styling canon.** Components render semantic markup + CSS classes (`sefaria-input`, `sefaria-input--error`, …); all visual values come from **design tokens** (CSS custom properties). A server-rendered Django template can emit the same classes and get identical styling without React. This is the rule that lets the Login UI ship without re-styling anything twice, and lets us adopt components gradually.
- **Tokens first.** Before any component, land a tokens layer: `--sefaria-color-*`, `--sefaria-space-*`, `--sefaria-radius-*`, state colors, typography. Reconcile the name drift Penina flagged (design token names ≠ current code globals). Components reference tokens only — never hard-coded hex/px.
- **Controlled components.** Inputs are controlled; the parent owns value + validation state. `FormField` composes label + control + error but stays presentational.
- **Direction-aware.** A `dir` prop (or direction-aware class) handles the LTR-value-in-RTL-UI case (email/password fields are LTR even in Hebrew). Spacing/line-height parity between EN and HE is a tokens responsibility, not per-component patching.

## Decisions

- **Build our own primitives, seeded from the Figma — don't adopt a headless library now.** A headless lib (Radix/Ark/etc.) was considered for "AI-first" leverage. Rejected for this phase: the Figma primitives are simple (input, button, field), and introducing a dependency + theming layer is its own project. Revisit once the primitive set grows beyond forms.
- **One canonical path per primitive.** No parallel "login input" vs "settings input." The bloat risk (two paths → hard for humans and AI) outweighs short-term convenience. New inputs adopt the canonical component; legacy inputs migrate in place.
- **Storybook is the contract surface.** Every component ships a story enumerating all states in EN and HE. Stories double as the visual-QA surface Penina signs off against and the Playwright target.
- **Provider buttons are custom Sefaria buttons, not SDK-rendered chrome.** The Figma `Buttons [for now]` set (node `187:76568`) renders "Continue with Google" / "Continue with Apple" as the **secondary** button variant — white fill, 1.5px border, provider icon from the icon library, hover `Core/blue TBR/100 #f0f7ff`. Per the Figma note, the **text color is `Semantic/Text/Primary #121212`** (black) — the one intentional deviation from the navy primary. So `ProviderButton` = a secondary `Button` + provider icon + black-text override that **triggers the provider SDK programmatically** (Google GSI / Apple JS) on click, rather than embedding the SDK's own rendered button. Caveat to honor: follow Google's and Apple's button branding guidelines for the custom treatment (icon, wording, min size) so we stay compliant. Primary button = `Semantic/Action/Primary #18345d`, hover `#132b4c`, disabled grey.
- **Show/hide password is in scope here** (it was deferred in the SSO meeting only because there was no input component to host it). With a real `Input`, masking + reveal is a built-in affordance.

## Input — state matrix (verified against Figma `Input Field`, node `187:76581`)

Every input is **label-above-field**. The named variants in the design system are:

| Figma variant | Notes |
|---|---|
| default/placeholder text | label + grey placeholder ("Value") |
| default/placeholder masked | password placeholder (dots), no value |
| typing | focused, caret visible |
| filled | value present |
| disabled | greyed field + label |
| filled/password masked | dots + **eye** icon (reveal) |
| filled/password unmasked | plaintext + **eye-off** icon (hide) |
| **with link** | label row carries an inline link on the trailing side (this is how **"Forgot password?"** attaches to the password field) |
| filled/error | red border + below-field **info-circle icon + "Error"** text |
| placeholder/error | error state on an empty field |

Plus the cross-cutting axes: **direction** (LTR · RTL · **LTR value in RTL UI** — Hebrew label/error with an LTR email/password value, confirmed in the HE row of the Figma) and **locale** (EN/HE, line-height parity).

Tokens (from `get_variable_defs`): text `Semantic/Text/Primary #121212`, placeholder `Semantic/Text/Muted #707070`, focus border `Semantic/Border/Focus #cccccc`, error `Semantic/Feedback/Error/Border|Text #c03522`, inline link `functional/inline-link-blue #4871bf` / `Semantic/Text/Link #18345d`, disabled `Core/Neutral/Gray/400 #999999`.

The difficulty is not any single state — it is that this becomes **canon for every future input** and must integrate with form submission/validation (replacing native browser validation tooltips with the inline error). Design the prop API deliberately; this is the component the SSO meeting explicitly said not to rush.

## Testing

- Jest unit tests for behavior (controlled value, show/hide, error wiring).
- Storybook stories per component (all states, EN/HE) — visual contract.
- Playwright covers the components in their first real consumer (the login page) rather than in isolation.

## Adoption

Gradual. When a page with inputs is next touched (profile, settings, chatbot), swap to the canonical `Input` then — not in a big-bang migration. The tokens + CSS-canon approach means even un-migrated server-rendered inputs can pick up the new classes for visual consistency ahead of full React adoption.
