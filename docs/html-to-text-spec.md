# HTML-to-Text Normalization Spec (Canonical)

This document defines the **canonical** HTML-to-text normalization behavior used by Sefaria for “copy as plain text”.

## Canonical reference implementation (Web)

Canonical code lives in:
- `static/js/sefaria/util.js` (`Sefaria.util.htmlToText`)
- `static/js/ReaderApp.jsx` (`handleCopyEvent` sets `text/plain` to `Sefaria.util.htmlToText(html)`)

The goal of other platforms (Mobile, Google Docs plugin, Python image generation) is to match this output **byte-for-byte**.

## Algorithm

Given an input string `html`:

1. **Remove literal code breaks and tabs** (actual characters, not HTML tags):
   - Replace all `\n` with `""`
   - Replace all `\t` with `""`

2. **Insert structural separators** by replacing these exact substrings:
   - `</td>` → `\t`
   - `</table>` → `\n`
   - `</tr>` → `\n`
   - `</p>` → `\n`
   - `</div>` → `\n`
   - `<br>` → `\n`
   - `<br( )*/>` → `\n` (i.e. `<br/>` and `<br />`)

   Notes:
   - These replacements are **case-sensitive** (they only match the lowercase spellings above).
   - The replacement happens on the **string**, before HTML parsing.

3. **Parse HTML and extract text**:
   - Parse the string as HTML (`<!doctype html><body>` + `html`).
   - Take `textContent` of `body`.
   - HTML entities are decoded per the HTML parser (e.g. `&nbsp;` becomes U+00A0).

4. **Collapse duplicate blank lines**:
   - Replace `\n\s*\n` with `\n`.

5. Return the resulting string.

## Tests

The shared test cases are duplicated inline in each platform’s test suite to avoid any cross-repo fixture coupling.

