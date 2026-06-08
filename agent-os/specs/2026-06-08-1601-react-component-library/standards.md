# Standards — React Component Library

## Component contract (mirror `Button.jsx`)

- Functional components with `PropTypes`. No class components.
- Expose `variant` / `size` style props; treat `className` as a discouraged escape hatch (document why when used).
- Prefer extending existing variants over creating new components or parallel CSS paths. **One canonical path per primitive.**
- Icons: `/static/icons/<name>.svg` via an `icon` prop; decorative icons get `alt="" aria-hidden="true"`.
- All user-facing copy goes through `InterfaceText` / `Sefaria._()` — never hard-coded English.

## Styling

- **Tokens only.** No hard-coded hex or px in component CSS — reference CSS custom properties from `tokens.css`.
- CSS classes are the canon (`sefaria-<component>`, `--<state>` modifiers). No inline `style` objects except truly dynamic values.
- Components must render identically when the same classes are emitted by a server-rendered template.

## Accessibility

- Every control is labelled; errors use `aria-invalid` + `aria-describedby`.
- Color is never the sole signal of state (pair with icon + text).
- Keyboard operable; reuse `static/js/sefaria/util` keyboard helpers (`handleKeyboardClick`, `handleRadioKeyDown`, `handleLinkSpaceKey`).

## Internationalization & direction

- Support EN + HE for every component; verify line-height/spacing parity.
- Direction-aware: components must handle LTR values inside an RTL UI (email/password) via `dir` or direction-aware classes.

## Storybook

- One `*.stories.jsx` per component under `stories/common/`, using `@static/js/common/...` imports and the `meta` + `argTypes` style of `Button.stories.jsx`.
- Stories enumerate **all states in EN and HE**. Stories are the visual-QA contract.

## Testing

- Jest for behavior (controlled value, password toggle, error wiring).
- a11y Storybook addon must pass for every story.
