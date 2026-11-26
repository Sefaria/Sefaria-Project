# HTML normalization for golden comparisons

Goldens (PLAN §2.5) are compared after normalization, never byte for byte. Two implementations exist: Python
(`devportal/contracts/normalize.py`, `normalize(html) -> str`) and TypeScript (in `devportal-ui/src/contracts/`).
Both must pass the shared cases in `devportal/contracts/normalize_cases.json`: each `input` normalizes to exactly its
`expected`, and normalizing an `expected` returns it unchanged. Run the Python side with
`python -m devportal.contracts.normalize`.

Normalization maps two HTML fragments to the same string when a browser would build the same visible document from
them and they carry the same meaningful attributes. It is not a sanitizer and not a pretty-printer.

## Steps

1. **Parse** the input as an HTML fragment (not a document) into a tree.
   - Element and attribute names are lower-cased.
   - Void elements (`area base br col embed hr img input link meta source track wbr`) have no children and no end tag;
     `<br/>` and `<br />` are the same as `<br>`.
   - An end tag closes the nearest open element with that name and every element opened inside it; an end tag with no
     matching open element is ignored; elements still open at the end are closed. (No other HTML5 tree-construction
     repairs are applied: inputs are expected to be well formed, as both renderers' outputs are.)
   - Character references in text and attribute values are decoded (`&amp;` → `&`, `&#x20;` → space, `&nbsp;` →
     U+00A0).
   - Comments, doctypes and processing instructions are dropped.
2. **Line endings.** In text, `\r\n` and lone `\r` become `\n`.
3. **Adjacent text nodes** are merged.
4. **Whitespace-only text** (only space, tab, `\n`, `\f`, `\r`) is dropped when at least one of its neighbours (the
   previous or next sibling node; a missing sibling counts) is a block element or absent, except anywhere inside
   `pre` or `textarea`. Block elements: `address article aside blockquote body button dd details dialog div dl dt
fieldset figcaption figure footer form h1 h2 h3 h4 h5 h6 header hgroup hr html iframe li main nav ol p pre section
summary table tbody td tfoot th thead tr ul`. Whitespace between two inline siblings (`<b>a</b> <i>b</i>`) is kept.
   Whitespace inside a text node that also has other characters is never changed.
5. **`pre`:** if the first child of a `pre` is text starting with `\n`, that one `\n` is removed (the HTML parser
   rule, so `<pre>\nx` and `<pre>x` agree).
6. **Editor-only attributes are removed:** `contenteditable`, `draggable`, `spellcheck`, `translate`, and every
   attribute whose name starts with `data-pm-`, `data-node-view-`, `data-dp-editor-` or `data-dp-src`.
7. **`class`:** split on whitespace; drop tokens starting with `ProseMirror` or `dp-editor-`; de-duplicate; sort
   (code-point order); join with one space. An empty result removes the attribute.
8. **Attributes:** when an element repeats an attribute, the first wins. Attributes are sorted by name (code-point
   order). Every attribute is written `name="value"`; a boolean attribute is `name=""`.
9. **Serialize** with no added whitespace: `<tag a="v">children</tag>`, void elements as `<tag a="v">`.
   - In text, escape `&` → `&amp;`, `<` → `&lt;`, `>` → `&gt;`. Nothing else is escaped (U+00A0 and non-ASCII stay as
     characters).
   - In attribute values, escape `&` → `&amp;`, `<` → `&lt;`, `>` → `&gt;`, `"` → `&quot;`, `'` → `&#x27;`.

## What normalization deliberately keeps

Attribute values other than `class` (including `dir`, `id`, `href`), text content and its internal whitespace, the
order of elements, and every element (nothing is unwrapped). A difference in any of these is a real difference.
