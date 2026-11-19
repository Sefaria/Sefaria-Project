# Codebase mapping

Three naming systems exist and they are not unified: this system's token names, the AI Chatbot codebase's variables, and the Sefaria Project codebase's variables. No semantic token has a confirmed codebase name yet. Do not guess a mapping: check the code or ask.

## Token names here vs. Figma

Figma paths become kebab-case names: `Semantic/Action/Primary hover` is `action-primary-hover`, `Core.Navy.700` is `navy-700`, `category/tanakh-teal` is `category-tanakh-teal`, `functional/background/background-page` is `functional-background-page`. `Semantic/Border/Subttle` is `border-subtle`.

## Codebase greys (reference only)

These are the Sefaria Project's own grey variable names. Use this table only to translate a grey you meet in code to its primitive. Never pick a grey from here for new work; use `text-*`, `border-*` or `surface-*`.

| Codebase name | Primitive | Hex |
|---|---|---|
| `even-lighter-grey` | `gray-50` | #fafafa |
| `lightest-grey` | `gray-100` | #eeeeee |
| `lighter-grey` | `gray-200` | #ededec |
| `light-grey` | `gray-300` | #cccccc |
| `medium-grey-legacy` | `gray-400` | #999999 |
| `medium-grey` | `gray-500` | #6f6f6f |
| `mediumer-grey` | `gray-550` | #707070 |
| `dark-grey` | `gray-600` | #666666 |
| `darker-grey` | `gray-700` | #575757 |
| `darkest-grey` | `gray-800` | #333333 |
