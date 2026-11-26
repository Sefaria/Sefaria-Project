# C5: design tokens and CSS conventions

Contract C5 of [PLAN.md](../../docs/dev-portal/PLAN.md) §4.3. It fixes where colours, sizes and fonts come from, how CSS is named, and the breakpoints. It changes only through the Integrator.

## The three global files

All three live in `devportal-ui/src/styles/` and are imported once, by the entry `src/app/main.tsx`, so the Vite manifest lists them as the entry's CSS.

| File                | What it holds                                                                                       | How it is made                                                                                                                                                                                                |
| ------------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tokens.css`        | The Sefaria design system's tokens: primitives, semantic tokens, the three product themes, type     | **Vendored.** Lines 1-422 of `docs/dev-portal/research/design/design-system/tokens.css`, byte for byte, under a header naming the source commit and sha256. Never edited by hand                              |
| `readme-tokens.css` | The custom properties measured on live, prefixed `--rm-`                                            | **Generated** by `node scripts/readme-tokens.ts` from `research/reference/data/css-vars-computed-live.json` (plus `--project-color-*` from `research/site/root-css-vars-computed.json`). Never edited by hand |
| `article.css`       | Body styles shared by public pages, the HTMLBlock frame and the editor canvas, scoped `.dp-article` | Hand-written. W7 owns it from Phase 3                                                                                                                                                                         |

Prettier and Stylelint skip the first two (`devportal-ui/.prettierignore`, `.stylelintrc.json`), so they stay byte-exact. `src/styles/tokens.test.ts` fails if `tokens.css` drifts from its source or `readme-tokens.css` from the generator.

**Why vendored, not the package.** PLAN §2.8 says to use `@sefaria/design-system` at the tag the root `package.json` pins if it ships these token names. `v1.1.0` ships `core.css` and `semantic.css`: primitives are named `--core-*`, there is no `data-theme` block and no DevPortal theme, and about 190 of the 260 names here are missing. So the file is vendored. Switch when the package ships the DevPortal theme under these names.

**What the vendored file leaves out.** Lines 423-786 of the source: the unprefixed typography classes (`.en-system-body-strong` and the rest), which break the `dp-` rule, and `@font-face` rules pointing at the design-system artifact's private blob URLs. Use the shorthand tokens instead: `font: var(--text-en-system-body-strong);`.

## Theme

The portal sets `data-theme="devportal"` on `<html>`. That theme overrides four tokens (`action-primary` = navy-700, `border-strong` = purple-800, `module-primary` = purple-700, `module-accent` = white); everything else is the Library default. There is no dark mode (live forces light; Q30).

## Which token to use where

| Situation                                                                                          | Use                                                                                                                                                                                      |
| -------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Reference and docs chrome that copies live (sidebar, article column, playground, header, footer)   | `--rm-*`. Live wins there (PLAN §2.8). Exact element values are in `research/reference/data/computed-get-v3-texts.json` and `REFERENCE_SPEC.md` §1; tokens are a convenience             |
| The live purple `#612854` (header bar, Try It button)                                              | `--rm-project-color-primary` (and `--rm-header-background` inside `.dp-rm-header`). Q31: live's purple stays where live uses it                                                          |
| New elements that live does not have (Discord CTAs, the community band, the 404 suggestions' look) | Design-system semantic tokens: `--action-primary`, `--text-inverse`, `--text-primary`, `--surface-*`, `--border-*`, `--spacing-*`, `--shadow-*`. Never a primitive such as `--navy-700`  |
| Focus                                                                                              | `outline: 2px solid var(--functional-focus-blue); outline-offset: 2px;` on every focusable element the portal draws                                                                      |
| Body and interface text                                                                            | Roboto (Q18: the design system's font overrides live's system stack), `var(--font-en-system)`; Hebrew `var(--font-he-system)` (Heebo). Self-hosted from `public/fonts/`, no Google Fonts |
| Code                                                                                               | Live's system stack, `var(--rm-font-family-mono)`                                                                                                                                        |
| The homepage                                                                                       | `home.css`, ported from live's custom CSS and scoped under `.dp-home` (PLAN Phase 5). Its own breakpoints (737, 796, 1070/1071, 1280, 1400, 1440, 1600) apply only there                 |

### Scope classes for measured values

Live sets its custom properties on `<html>` and overrides some of them on four containers. `readme-tokens.css` keeps that structure: put each class on the matching element and the `--rm-*` values inside resolve as on live.

| Class                 | Put it on                           | Live element            | Notable values                                                                                                                            |
| --------------------- | ----------------------------------- | ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| (none, `:root`)       |                                     | `html`                  | `--rm-hub-sidebar-width: 288px`, `--rm-hub-playground-width: 480px`, `--rm-hub-main-max-width: 800px`, `--rm-color-text-default: #32343a` |
| `.dp-rm-app`          | The shell root (`#dp-root`'s child) | `.rm-ReadMe`            | The 15px type scale: `--rm-font-size-md: 15px`, `--rm-font-size-3xl: 31px` (the H1)                                                       |
| `.dp-rm-header`       | The header bar                      | `header.rm-Header`      | `--rm-header-background: #612854`                                                                                                         |
| `.dp-rm-playground`   | The playground column               | `#ReferencePlayground`  | `--rm-markdown-font-size`, `--rm-table-*`                                                                                                 |
| `.dp-rm-request-card` | The request card                    | `.rm-PlaygroundRequest` | `--rm-api-request-*`, `--rm-raw-editor-*`                                                                                                 |

Method badge colours (`REFERENCE_SPEC.md` §1.3) are the live palette tokens: GET `--rm-green30` (#008756), POST `--rm-blue40` (#0222c6), with white text.

## Class names

1. **Every class in the DOM starts with `dp-`.** Global classes (the three files above, `home.css`, and every class the Markdown renderer emits) are kebab-case: `dp-article`, `dp-callout`, `dp-callout--warn`, `dp-code-tabs__tab`. Block, `__element` and `--modifier` follow BEM.
2. **Component styles are CSS Modules**, one `Component.module.css` beside each component. Local names are camelCase (`.root`, `.methodPill`). The build scopes them with the pattern `dp-[name]__[local]--[hash:base64:5]` (`vite.config.ts`), so they too start with `dp-`. In Vitest they stay unscoped (`classNameStrategy: 'non-scoped'`).
3. **No inline styles, no `<style>` elements** on public pages: the CSP has `style-src 'self'` and no `'unsafe-inline'` (PLAN §2.12). Dynamic values go through CSS custom properties set from a stylesheet, or through classes.
4. **The sanitizer keeps `class` only when every token starts with `dp-`** (PLAN §2.6), so rendered Markdown can carry only portal classes.
5. Stylelint enforces rules 1 and 2: `selector-class-pattern` is `^dp-…` for global CSS and camelCase for `*.module.css` (`devportal-ui/.stylelintrc.json`).

## Breakpoints

Measured on live (`REFERENCE_SPEC.md` §1.6). CSS writes the numbers literally (custom properties do not work in media queries); TypeScript imports them from `src/styles/breakpoints.ts`.

| Threshold | Media query (narrow side) | Layout below the threshold                                                                                                              |
| --------- | ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| 1300      | `(max-width: 1299px)`     | Playground inner width 448 instead of 432                                                                                               |
| 1066      | `(max-width: 1065px)`     | The playground stacks below the article. Measure on live whether this is a viewport or container rule before building it (PLAN Phase 2) |
| 769       | `(max-width: 768px)`      | Mobile: 103px header with hamburger, logo and search; sidebar becomes the sub-nav dropdown                                              |
| 700       | `(max-width: 700px)`      | Article padding `32px 20px`                                                                                                             |
| 414       | `(max-width: 414px)`      | The sidebar dropdown panel is repositioned                                                                                              |

The visual-parity widths (1440, 1280, 1024, 768, 390) sit on both sides of these thresholds.
