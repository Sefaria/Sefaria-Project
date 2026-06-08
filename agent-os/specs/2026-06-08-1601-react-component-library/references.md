# References — React Component Library

## Internal — pattern exemplars

### `Button.jsx` — the house style
- **Location:** `static/js/common/Button.jsx`
- Functional component, `PropTypes`, `variant`/`size` props, `icon` from `/static/icons/`, `href`-renders-as-`<a>` for a11y, docstring discouraging new variants. Copy this contract for every new component.

### `Button.stories.jsx` — the Storybook style
- **Location:** `stories/common/Button.stories.jsx`
- `meta` + `argTypes` + named exports per state. Imports via `@static/js/common/Button.jsx`. Mirror this for `Input`, `FormField`, `ProviderButton`.

### `Card.jsx`, `RadioButton.jsx` — composition + a11y references
- **Location:** `static/js/common/Card.jsx`, `static/js/common/RadioButton.jsx`
- `RadioButton` shows controlled-input + `InterfaceText` + keyboard helper usage. `Card` shows `InterfaceText` with `{en, he}` and markdown.

### Storybook config
- **Location:** `.storybook/main.js`, `.storybook/preview.jsx`, `.storybook/sefariaStub.js`
- `@static` alias and the `Sefaria` stub used by stories.

### Existing tokens / globals
- **Location:** `static/css/s2.css` (`:root` block — `--sefaria-blue`, `--dark-grey`, font-size vars, `--theme-*`)
- Audit and align; do not duplicate.

### i18n primitives
- **Location:** `static/js/sefaria/sefaria.js` (`Sefaria._()`, `_i18nInterfaceStrings`), `InterfaceText` (in `static/js/Misc`)
- All component copy flows through these.

### Keyboard / a11y helpers
- **Location:** `static/js/sefaria/util`
- `handleKeyboardClick`, `handleRadioKeyDown`, `handleLinkSpaceKey`.

## External

- Figma — Registration / Login Wireframes (componentized; variants + tokens):
  https://www.figma.com/design/2WflG98PDhWQ7OKrDkaCPb/Registration---Login-Wireframes?node-id=65-331
- Component nodes (via `figma-desktop` MCP, verified 2026-06-08): `187:76581` Inputs (`Input Field`), `187:76568` Buttons (`Buttons [for now]`), `192:6701` Legal Text & reCAPTCHA error, `Form Card` (auth card). Tokens via `get_variable_defs` on these nodes → mapping in 1601 plan.md Phase 0.
- Lucide icons (Penina's icon standard): https://lucide.dev
- WAI-ARIA Authoring Practices — text fields & forms: https://www.w3.org/WAI/ARIA/apg/patterns/

## Related specs

- [`2026-06-08-1602-login-register-ui-react`](../2026-06-08-1602-login-register-ui-react/plan.md) — first consumer of this library.
- [`2026-04-28-1601-apple-sso-login`](../2026-04-28-1601-apple-sso-login/plan.md) — the SSO backend these forms call.
