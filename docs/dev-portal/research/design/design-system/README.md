Sefaria is a digital library of Jewish texts. The interface stays quiet so the texts lead: white pages, one navy for action, serif faces for the texts themselves and a plain sans for the interface around them. Every screen may run in English (LTR) or Hebrew (RTL), so every choice below comes in both.

## Token layers

- **Core primitives** (`navy-*`, `gray-*`, `purple-*`, `red-*`, `yellow-*`, `green-*`, `blue-tbr-*`, `green-tbr-*` and the single brand hues) are the raw palette. Never place them directly in a design.
- **Semantic tokens** (`action-*`, `text-*`, `surface-*`, `border-*`, `icon-*`, `feedback-*`, `module-*`) alias into the primitives. Design with these.
- **Category, brand and functional tokens** (`category-*`, `brand-*`, `functional-*`) are one-off named colors used only where that specific color is called for.
- The `blue-tbr` and `green-tbr` scales are marked *to be reviewed*. Reach them only through the tokens that already alias them.

## Product themes

The three themes are product modes, not light and dark. **Library** is the main site and the default. **Sheets** and **DevPortal** override exactly four tokens; everything else is shared:

| Token | Library | Sheets | DevPortal |
|---|---|---|---|
| `action-primary` | `navy-700` | `green-tbr-700` | `navy-700` |
| `border-strong` | `navy-600` | `green-tbr-600` | `purple-800` |
| `module-primary` | `navy-700` | `green-tbr-700` | `purple-700` |
| `module-accent` | `navy-100` | `green-tbr-100` | `white` |

Brand anything product-specific with `module-primary` and `module-accent` so it follows the theme. Use `brand-sefaria-blue`, `brand-sheets-green` or `brand-devportal-purple` only when you mean that one product regardless of context.

## Color

- Set text in `text-primary` on any `surface-*`. Supporting copy and metadata take `text-secondary`; placeholders and quiet metadata take `text-muted`, only on `surface-page` or `surface-subtle`.
- Links are `text-link`, hovering to `text-link-hovered`.
- Primary buttons fill with `action-primary`, label in `text-inverse`. Secondary controls use `action-secondary`.
- Pages sit on `surface-page`. Use `surface-subtle` for quiet panels, `surface-hover` for hovered rows, `surface-selected` for a chosen item, `surface-highlighted` for highlighted content, `surface-inverse` with `text-inverse` for dark bands.
- Separate with `border-default` (or `border-subtle` for the softest divider); use `border-strong` when the edge must carry weight. Input borders need 3:1 against the page, which `border-default` does not reach: use `border-strong` on inputs that must read as fields without a fill.
- Errors: `feedback-error-text` on `feedback-error-background`, outlined in `feedback-error-border`. `feedback-success` and `feedback-info` pass as text on white. `feedback-warning` is 1.9:1 on white: use it only as a fill or mark beside an icon and `text-primary` copy, never as text.
- Never signal state by color alone: every feedback color travels with a word or an icon.
- Category colors (`category-tanakh-teal`, `category-talmud-gold`, `category-mishnah-blue` and the rest) mark which part of the library a text belongs to: bars, rules and markers on category tiles and results. They are decorative identifiers, not text colors.
- Reading highlights use `functional-highlight-blue`, `functional-highlight-blue-light` and `functional-highlight-text-blue` (green variants in green contexts).

## Type

Two pairs of families, one for **content** (the texts) and one for **system** (the interface), in each language:

| Role | English | Hebrew |
|---|---|---|
| Content | Adobe Garamond Pro (`en-content-*`) | Taamey Frank CLM (`he-content-*`) |
| System | Roboto (`en-system-*`) | Heebo (`he-system-*`) |

- Set source texts, translations and commentary in the content styles: `en-content-body` (18px) or `he-content-body` (22px). Hebrew content runs about 20% larger than English at each step so the two read at the same weight side by side.
- Set every interface element in the system styles. `en-system-body-regular` (16px) is the default UI copy; `en-system-body-strong` and `en-system-small-strong` are for CTA buttons and linked text.
- Use `en-system-small-comfortable` (14/21) for Library Assistant responses and anywhere reading comfort matters more than density; `en-system-small-compact` (14/18) for dense lists.
- Dedications (e.g. in book TOCs) set the message in `en-dedication-message` / `he-dedication-message` and the supporting text in `en-dedication-content` / `he-dedication-content`.
- Letter spacing is 0 throughout. Styles without a line height in the source inherit the component's.
- When a string can be either language, pick the style by the language of the string, not of the interface.

## Spacing, borders and radius

- Specify spacing with `spacing-*` names (`spacing-small` 8px, `spacing-large` 16px, `spacing-2xlarge` 24px…), never raw pixels. They alias the `dimension-*` scale, so a scale change propagates.
- Borders are `border-width-thin` (1px) by default, `border-width-medium` (1.5px) and `border-width-thick` (2px) for emphasis.
- There is no radius scale. Take corner radii from `dimension-*` steps rather than inventing values.

## Elevation

Prefer borders to shadows. When something floats, use `shadow-small` for resting cards, `shadow-medium` for menus, `shadow-large` for floating panels, `shadow-xlarge` for dialogs. `shadow-xxlarge` is reserved for the search result card hover state.

## States

- **Default** uses the component's normal tokens.
- **Hover and pressed** share one value in most cases (`action-primary-hover`). Design a separate pressed state with `action-primary-pressed` only when a component's spec calls for it.
- **Focus** belongs to development: one ring, `outline: 2px solid var(--functional-focus-blue); outline-offset: 2px`, no white gap. Do not design a custom focus treatment unless asked, and do not use `border-focus` as a focus indicator (1.61:1).
- **Disabled** is always included: `text-disabled` and `icon-disabled`.

## Iconography

- Icons are Lucide, stroke-only, bound to `icon-default`, `icon-muted`, `icon-inverse` or `icon-disabled`. Sizes are 12, 18 and 24px, but not every icon exists at every size: check before specifying one.
- The Icon library Figma file (key `UzgAAujaBq2i3qvO4lhrYZ`) is the source. Instance its components; never redraw an icon or paste a fresh SVG from Lucide.
- A `Legacy/` prefix means a pre-Lucide icon still live in the Sefaria Project codebase. It is not deprecated. Everything else is Lucide, filed in one category each (which may differ from Lucide's own site).
- AI Chatbot work uses Lucide only. Sefaria Project work defaults to Lucide, but first check whether the screen still uses a `Legacy/` icon.
- If an icon is not in the library, a one-off from Lucide is fine only with an explicit flag: "using [icon] from Lucide directly, not yet in our icon library".

## Logo

No logo files are in this system yet. Set the name in plain type until the marks are added.
