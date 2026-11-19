# C4: the Markdown dialect and the HTML it renders to

This is contract C4 (PLAN §4.3). It fixes, for every construct the portal's Markdown supports, the source syntax and
the exact HTML the server renders: tags, `dp-` classes and attributes. The Python renderer (`devportal/markdown/`)
implements it; the docs UI (W7) styles and enhances it; the editor (W13) must produce HTML that normalizes to the same
thing (`NORMALIZE.md`). One fixture per construct lives in `fixtures/markdown/`, its expected HTML in
`golden/markdown/`. When this file and a golden disagree, the golden is what the tests enforce; fix whichever is wrong
through the Integrator.

## How the rules were derived

The dialect is "ReadMe-flavoured Markdown as used in the 152 files of `Sefaria/developer-docs`". Every rule below that
says _live_ was derived on 2026-11-18 from the server HTML of the 59 visible docs pages that have a body and the 7
reference guide pages (welcome group), fetched with GET into `.devportal-run/live-html/`, and compared with the source
files. Proof, all enforced by tests in `devportal/tests/pure/`:

- **Heading ids:** all 485 heading ids on the 66 pages equal live, in order (`heading_ids_test`, data in
  `fixtures/markdown/live/headings.json`).
- **Table of contents:** equal to the `toc` arrays of `research/site/pages.json` for all 58 pages listed there.
- **Element counts:** for every page, the number of `p`, `li`, `table`, `td`, `pre`, code-tab groups, `img`, `figure`,
  callouts, `blockquote`, `hr`, `br`, `strong`, `em`, `code` and headings equals live. The only differences are the
  two HTMLBlock pages (live inlines the block, we frame it) and two links that Cloudflare's e-mail obfuscation adds
  on live (`patot`, `workflowy`).
- **Code tabs (F-4):** 191 code blocks on live, 113 with tab chrome; the rule below reproduces every one. Checked
  again in live's hydrated DOM (Playwright, GET only) for `docs/cli` and `docs/commentaries`.

## Pipeline

1. **Front matter.** If the text starts with a line `---`, everything up to the next line `---` (matched with
   `\n---(\n|$)`, because many files have no newline after the closing fence) is YAML front matter and is not
   rendered. `split_front_matter`, `parse_front_matter`.
2. **Parse** with `markdown-it-py`, preset `gfm-like` (CommonMark, GFM tables, strikethrough, linkify), `html: true`,
   `typographer: false`, `breaks: true`. Block rules for the five components run before the HTML-block rule.
3. **Transform:** blockquote callouts, image-only paragraphs, table-cell alignment, link resolution, heading ids and
   the TOC.
4. **Render** to the HTML below, then **sanitize** (nh3, allow-list below).
5. **TOC** (`RenderResult.toc`) and **plain text** (`RenderResult.text`) come with the HTML; the raw HTML of each
   HTMLBlock is in `RenderResult.htmlblocks`.

`render(source, *, link_resolver=rewrite_link, revision="0", htmlblock_url=..., sanitize_output=True)` returns
`RenderResult(html, toc, text, htmlblocks)`. The HTML is a fragment; the page template puts it inside the article
container (W7's `<div class="dp-markdown">`).

## Global conventions

- Every class the renderer emits starts with `dp-`. The sanitizer removes every other class token.
- The renderer emits no `dir` attribute: every block is left to right, as on live (RTL, below).
- No `style` attribute anywhere; alignment and widths use classes or the `width` attribute.
- The renderer emits no `target` or `rel` on links (live emits `target=""`, which does nothing).
- Text is escaped; attribute values are double-quoted.

## Constructs

### Paragraphs and line breaks

A single newline inside a paragraph is a line break on live (ReadMe renders with `breaks` on: `general-faq`,
`accessibility-interns-...`, `text-formatting-beyond-the-segment-level`, `the-disambiguator` and
`the-educator-playbook-...` show `<br>` where the source has a bare newline). So:

```html
<p>
  Yes! We have an iOS app.<br />
  Our iOS app is available on Apple's App Store.
</p>
```

A hard break (two trailing spaces or `\`) is the same `<br>`. `---`, `***`, `___` render `<hr>`.

### Inline

| Source                      | Output                                                                                                                 |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `**a**`, `__a__`            | `<strong>a</strong>`                                                                                                   |
| `*a*`, `_a_`                | `<em>a</em>`                                                                                                           |
| `~~a~~`                     | `<s>a</s>`                                                                                                             |
| `` `a` ``                   | `<code class="dp-code">a</code>` (live: `code.rdmd-code`)                                                              |
| `[t](url "title")`          | `<a href="url" title="title">t</a>` after link resolution                                                              |
| `<https://x>`, `<a@b.org>`  | `<a href="https://x">https://x</a>`, `<a href="mailto:a@b.org">a@b.org</a>`                                            |
| bare `https://x.org/...`    | linked (linkify). Domains without a scheme (`Sefaria.org`, `cli.py`) are **not** linked, as on live (`fuzzy_link` off) |
| `&amp;`, `&#x20;`, `&nbsp;` | decoded; the sanitizer re-serializes text (`&amp;`, `&lt;`, `&gt;`, `&nbsp;`)                                          |
| typographer                 | off: quotes, dashes and `(c)` stay as typed                                                                            |

### Headings

Source: ATX (`#`…`######`) or setext. Output (live: `h2.heading.heading-2.header-scroll` holding
`div.heading-anchor#id`, `div.heading-text`, `a.heading-anchor-icon`):

```html
<h2 class="dp-heading dp-heading-2" id="quick-questions-and-answers">
  <span class="dp-heading-text">Quick Questions and Answers</span>
  <a
    class="dp-heading-anchor"
    href="#quick-questions-and-answers"
    aria-label="Skip link to Quick Questions and Answers"
  ></a>
</h2>
```

(no whitespace between the three parts in the real output). The id is on the heading itself; W7 gives headings
`scroll-margin-top` instead of live's offset anchor `div`. The anchor link is empty; W7 draws the icon. Its
`aria-label` is `Skip link to ` + the heading's text (live's own label, without its `,[object Object]` bug).

**Heading-id algorithm (live = `github-slugger`).** Take the heading's text content (after emoji shortcodes are
replaced and entities decoded; inline code contributes its text, links their text, images nothing). Lower-case it.
Remove every character that is not a Unicode letter, mark, number or connector punctuation, `-` or space. Replace each
space with `-`. Nothing is trimmed: `### New Tools & Libraries&#x20;` → `new-tools--libraries-`; `🔧 Project` →
`-project`; `:warning: Important` → `️-important` (the U+FE0F variation selector is a mark and survives). Hebrew is
kept: `איך-ליצור-מראי-מקורות-להפניה`. Duplicates on a page get `-1`, `-2`, … in document order with github-slugger's
counter: `Duplicate`, `Duplicate`, `Duplicate-1` → `duplicate`, `duplicate-1`, `duplicate-1-1`. One counter per page,
in document order, including headings inside callouts and table cells (`Slugger`, `slugify`).

**Empty heading** (`###` alone, 2 files): renders nothing (live renders `<!-- -->`), but keeps a TOC entry with text
`""` and id `""`, as live's TOC does.

### Table of contents

`toc` is a list of `{"level", "id", "text"}` for every heading of level **1 to 3** in document order, **except
headings inside a callout** (either kind). `text` is the text content, trimmed. This equals live's TOC on every page;
note live includes H1 (the plan said H2 and H3; live wins). Nesting by level is the UI's job.

### Lists

`<ul>`, `<ol>` (with `start="N"` when the first number is not 1), `<li>`. Tight lists render items without
`<p>`; loose lists wrap item paragraphs in `<p>`. `- [ ]` task syntax is plain text.

### Blockquote

`<blockquote>` with block children, unless it is a callout.

### Callouts

Two source forms, one output. Component form (10 in 8 files):

```text
<Callout icon="🚧" theme="warn">
  ### This is a work in progress.

  Markdown inside is parsed, dedented.
</Callout>
```

Blockquote form (3 in the corpus): a blockquote whose first line starts with one of the theme emoji below followed by
a space or the end of the line. The rest of that first line is the title and becomes an `h3` (omitted when empty);
the rest of the blockquote is the body.

```text
> 🚧 Work-In-Progress
>
> Please note: this reference is a work in progress.
```

Output (live: `blockquote.callout.callout_warn[theme=🚧] > span.callout-icon + h3.heading…`, the component form also
wrapped in `div.readme-tailwind`, which we drop):

```html
<blockquote class="dp-callout dp-callout-warn">
  <span class="dp-callout-icon" aria-hidden="true">🚧</span>
  <h3 class="dp-heading dp-heading-3" id="work-in-progress">…</h3>
  <p>Please note: …</p>
</blockquote>
```

Themes: `default`, `info`, `warn`, `error`, `okay` → class `dp-callout-<theme>`. Component `theme` aliases: `success`
→ `okay`, `warning` → `warn`, `danger` → `error`; anything else → `default`. Component without `icon`: `default` and
`info` 📘, `warn` 🚧, `error` ❗️, `okay` 👍. Blockquote-form emoji → theme (live's table): 📘 ℹ️ → `info`; 🚧 ⚠️ ⚠ →
`warn`; 👍 ✅ → `okay`; ❗️ ❗ 🛑 ⁉️ ‼️ → `error`. Any other emoji (🎉) leaves an ordinary blockquote. A blockquote whose
first child is a heading (`> ### :warning: …`) is not a callout (live agrees). Headings inside callouts get ids and
are left out of the TOC.

### Code

**Tab rule (F-4), derived from live:** a fenced block **with a language** always gets tab chrome, even alone; a fence
with no language and an indented block never do. The source has no adjacent fences, so no group has more than one tab.

**Tab label:** the info string's first word is the language; the rest, if any, is the label (`text JSON` → JSON,
`html OPML` → OPML, `javascript React` → React, `python python` → python). Without a label, live's display name of the
language: `bash` Bash, `curl` cURL, `html` HTML, `javascript`/`js` JavaScript, `json` JSON, `python`/`py` Python,
`text` Text, `typescript`/`ts` TypeScript, plus the other names in `LANG_LABELS` (`renderer.py`). An unknown language
is its own label, as typed.

```html
<div class="dp-codetabs">
  <div class="dp-codetabs-toolbar">
    <button type="button" class="dp-codetabs-tab dp-active" value="python">Python</button>
  </div>
  <div class="dp-codetabs-inner">
    <pre class="dp-pre"><code class="dp-code"
data-lang="python">import django
</code></pre>
  </div>
</div>
```

Without a language:

```html
<pre class="dp-pre"><code class="dp-code">"title": "Ramban on Genesis"
</code></pre>
```

`value` and `data-lang` keep the language as typed (`Text React` → `value="Text"`). The code is escaped text; there is
no highlighting markup in server HTML (live's server HTML has none either; live highlights in the browser and adds a
copy button). W7 highlights `code[data-lang]` and adds copy buttons. Live: `div.CodeTabs > div.CodeTabs-toolbar >
button` + `div.CodeTabs-inner > pre > code.rdmd-code`.

### Images

Component form, attributes as found in the corpus: `src`, `alt`, `align` (`left`, `center`, `right`), `width` (`"70% "`
with a trailing space, `"500px"`), `caption`, `border={true|false}`, `framed={true}`; values may be `"…"`, `'…'` or
`{…}`; the tag may span lines. Markdown form: `![alt](src "title")`.

```html
<div class="dp-image">
  <span class="dp-img-lightbox" role="button" tabindex="0" aria-label="Expand image"
    ><span class="dp-img-lightbox-inner"
      ><img class="dp-img dp-img-align-center dp-img-border" src="…" alt="" loading="lazy" width="70%" /></span
  ></span>
</div>
```

- `dp-img-align-<align>` only for a valid `align`; `dp-img-border` only for `border={true}`.
- `width` is trimmed and kept only when it matches `^\d+(\.\d+)?(px|%)?$`; otherwise omitted (live writes
  `width="auto" height="auto"`, which browsers ignore). `title` only when non-empty.
- `aria-label` is the `alt` when the image has a caption and a non-empty alt, otherwise `Expand image` (live's rule).
- With a `caption` (or `framed`), the lightbox span is wrapped in a figure; the caption is inline Markdown:

```html
<div class="dp-image">
  <figure class="dp-figure dp-figure-framed dp-figure-align-center">
    <span class="dp-img-lightbox" …>…</span>
    <figcaption><p>Caption</p></figcaption>
  </figure>
</div>
```

`dp-figure-framed dp-figure-align-<align or center>` only when `framed={true}` (live: `figure.img-frame.img-frame-center`).

- A paragraph holding only Markdown images (and whitespace) becomes one `div.dp-image` per image, as live shows them
  as blocks. An image inside text renders the same lightbox span inline, without the `div`.
- Live: `span.img.lightbox.closed[role=button][tabindex=0][aria-label] > span.lightbox-inner > img.img.img-align-center.border`.
  Clicking opens a lightbox (W7).

### Tables

Pipe tables and the component form produce the same markup (live: `div.rdmd-table > div.rdmd-table-inner > table`):

```html
<div class="dp-table">
  <div class="dp-table-inner">
    <table>
      <thead>
        <tr>
          <th class="dp-align-left">Attribute</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td class="dp-align-left"><code class="dp-code">dependence</code></td>
        </tr>
      </tbody>
    </table>
  </div>
</div>
```

- Alignment: pipe delimiter `:--` / `:-:` / `--:`, or the component's `align={["left","center","right"]}` by column;
  class `dp-align-<a>` on every `th` and `td` of that column (live: `style="text-align:left"`). No alignment, no class.
- Component form: `<Table align={[…]}>` with `<thead>`, `<tbody>`, `<tr>`, `<th>`, `<td>` in any indentation. Each
  cell's content is dedented and parsed as Markdown (fences, lists, paragraphs). **A cell with exactly one top-level
  paragraph renders it without `<p>`**; a cell with several paragraphs keeps `<p>` on each (live).
- Pipe-table cells are inline only (GFM).

### Embed

`<Embed url="…" … />` (YouTube only in the corpus). `url`, else `href`, is matched for a YouTube id (`watch?v=`,
`youtu.be/`, `embed/`, `shorts/`, `live/`). The `html="%3Ciframe…"` attribute is never rendered.

```html
<div class="dp-embed">
  <div class="dp-embed-media">
    <iframe
      class="dp-embed-iframe"
      src="https://www.youtube-nocookie.com/embed/JUSW7y4wYUQ"
      width="854"
      height="480"
      title="Sefaria Research at PyConn 2024"
      allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
      allowfullscreen=""
      loading="lazy"
    ></iframe>
  </div>
</div>
```

`title` is the component's `title`, else `YouTube embed` (live's). Live: `div.embed > div.embed-media >
iframe.embedly-embed` through `cdn.embedly.com`; we go to youtube-nocookie directly (PLAN §2.6). Any other URL renders
`<div class="dp-embed dp-embed-link"><a href="url">title or url</a></div>`.

### HTMLBlock

`<HTMLBlock>{`…`}</HTMLBlock>` (4 files). The body is a JavaScript template literal (`` \` ``, `\${`, `\\` are
unescaped). It is never put in the page. The n-th block (0-based, document order) renders:

```html
<div class="dp-htmlblock">
  <iframe
    class="dp-htmlblock-frame"
    sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
    src="/_portal/htmlblock/<revision>/<n>"
    title="HTML block <n+1>"
    loading="lazy"
  ></iframe>
</div>
```

`<revision>` is the `revision` argument (`[A-Za-z0-9_-]+`); the frame view serves `RenderResult.htmlblocks[n]` of that
revision. W7 sizes the frame from its content height. Headings inside a block have no id and are not in the TOC (as on
live).

### Raw HTML

`html: true`: HTML blocks and inline HTML pass to the sanitizer. Used in the corpus: `<br>` (90 in 34 files), `div`,
`span`, `a`, `p`, `b`, `i`, `u`, `small`, `hr`, `code`, entities, and the contact page's Formstack `iframe`, whose
`style` is removed (CSS replaces it). `href`/`src` in raw HTML get the same link resolution as Markdown links. Unknown
components (`<Cards>`, `<Recipe …/>`) lose their tags and keep their text, or show as escaped text when they are not
valid HTML.

### Emoji shortcodes

`:name:` in text (never in code) becomes the Unicode emoji for the gemoji names in `emoji.py` (`warning` ⚠️,
`sparkles` ✨, `wrench` 🔧, `handshake` 🤝 are the corpus's four, plus common ones). Unknown names stay as typed.
Replacement happens before heading ids are computed, which is why `### :warning: X` has the id `️-x` on live.

### RTL

No direction is set: the renderer emits no `dir` on paragraphs, headings, list items, table cells or captions, so
every block is left to right, Hebrew-first ones included. This is live's rendering (2026-11-18, every element with
Hebrew text in `linker-v3` and `sites-using-the-linker` list items, `linker-v2` table cells, `the-disambiguator`
blockquote paragraphs, the Hebrew page's H1 title: no `dir` attribute anywhere in the Markdown, computed `ltr`); an
earlier draft of this contract put `dir="auto"` on each block, which turned those lists right to left. Hebrew runs
inside a line still lay out right to left by the bidi algorithm. Right-to-left blocks come only from authored HTML:
the one fully Hebrew page is an HTMLBlock with its own `<div dir="rtl">`, and the sanitizer keeps an authored `dir`
(`auto`, `ltr`, `rtl`).

### Links

`render()` resolves every Markdown link destination, image source and raw-HTML `href`/`src` with `link_resolver`
(default `rewrite_link`):

| Destination                                   | Becomes                                                             |
| --------------------------------------------- | ------------------------------------------------------------------- |
| `doc:<slug>[#frag]`                           | `/docs/<slug>[#frag]`                                               |
| `ref:<slug>[#frag]`                           | `/reference/<slug>[#frag]`                                          |
| `page:<slug>[#frag]`                          | `/page/<slug>[#frag]`                                               |
| `http(s)://developers.sefaria.org[/path]`     | `/path` (or `/`)                                                    |
| anything else, and malformed forms (`doc: x`) | unchanged (a remaining `doc:` URL is then removed by the sanitizer) |

`rewrite_markdown_links(source) -> (new_source, changes)` does the same on Markdown **source** for the import (PLAN
§7.2 step 3): only inline-link and image destinations, reference definitions and `href`/`src` attributes, never inside
fences, indented code or inline code spans, never link text, autolinks or bare URLs; every other byte is preserved.
Live itself shows `ref:` links as `/reference-link/<slug>` and adds `class="doc-link" data-sidebar` to `doc:` links;
we do neither.

### Plain text

`RenderResult.text`: the text of the sanitized HTML, one block per line, whitespace collapsed; code blocks, code-tab
buttons, callout icons, iframes (embeds and HTMLBlocks) left out; inline code kept.

## Sanitizer allow-list (C10 shares it)

`devportal/markdown/sanitize.py`, nh3 0.3.8:

- **Tags:** `a blockquote br button code del div em figcaption figure h1-h6 hr iframe img li ol p pre s span strong
table tbody td th thead tr ul`, plus raw `b i u small sub sup kbd mark ins dl dt dd abbr cite q`. Removed with their
  content: `script style noscript template textarea title xmp object embed form select noembed noframes plaintext
math svg`. Any other tag is removed and its text kept.
- **Attributes:** everywhere `class` (only `dp-` tokens) and `dir` (`auto`, `ltr`, `rtl`); `a`: `href title
aria-label`; `img`: `src alt title width height loading`; `span`: `role` (`button`) `tabindex` (`0`, `-1`)
  `aria-label aria-hidden`; `ol`: `start`; `th`/`td`: `colspan rowspan`; `code`: `data-lang`; `button`: `type`
  (forced to `button`) `value`; `iframe`: `src width height title allow allowfullscreen loading`; `h1`-`h6`: `id`.
  Nothing else: no `style`, no `on*`, no `target`, no `rel` (nh3's `link_rel` is off).
- **URLs:** `http`, `https`, `mailto`, and relative URLs.
- **iframes:** kept only when `src` starts with `https://sefaria.formstack.com/` or `https://www.youtube-nocookie.com/`,
  or matches `^/_portal/htmlblock/[A-Za-z0-9_-]+/\d+$`; otherwise the whole element is removed. An author's `sandbox`
  is always dropped; HTML-block frames always get `sandbox="allow-same-origin allow-popups
allow-popups-to-escape-sandbox"`. `allow` keeps only `autoplay fullscreen encrypted-media picture-in-picture
clipboard-write`.
- Comments are removed.

## Live classes → ours (for W7)

| Live                                                                                           | Ours                                                                                                          |
| ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `.rm-Markdown.markdown-body`                                                                   | `.dp-markdown` (template)                                                                                     |
| `.heading.heading-N.header-scroll`, `.heading-anchor`, `.heading-text`, `.heading-anchor-icon` | `.dp-heading.dp-heading-N` (id on it), —, `.dp-heading-text`, `.dp-heading-anchor`                            |
| `.callout.callout_<theme>`, `.callout-icon`                                                    | `.dp-callout.dp-callout-<theme>`, `.dp-callout-icon`                                                          |
| `.CodeTabs`, `.CodeTabs-toolbar`, `button`, `.CodeTabs-inner`, `code.rdmd-code`                | `.dp-codetabs`, `.dp-codetabs-toolbar`, `.dp-codetabs-tab`, `.dp-codetabs-inner`, `pre.dp-pre > code.dp-code` |
| `code.rdmd-code` (inline)                                                                      | `code.dp-code`                                                                                                |
| `.img.lightbox.closed`, `.lightbox-inner`, `img.img.img-align-X.border`                        | `.dp-img-lightbox`, `.dp-img-lightbox-inner`, `img.dp-img.dp-img-align-X.dp-img-border`                       |
| `figure`, `figure.img-frame.img-frame-center`                                                  | `figure.dp-figure`, `.dp-figure-framed.dp-figure-align-center`                                                |
| `div.readme-tailwind` wrapper                                                                  | `div.dp-image` (images only)                                                                                  |
| `.rdmd-table`, `.rdmd-table-inner`, `style="text-align:X"`                                     | `.dp-table`, `.dp-table-inner`, `.dp-align-X`                                                                 |
| `.embed`, `.embed-media`, `iframe.embedly-embed`                                               | `.dp-embed`, `.dp-embed-media`, `iframe.dp-embed-iframe`                                                      |
| `.rdmd-html` (inline HTML block)                                                               | `.dp-htmlblock > iframe.dp-htmlblock-frame`                                                                   |

## Live quirks not reproduced

`target=""` and `title=""` on links; `title=""`, `width="auto"`, `height="auto"` on images; `,[object Object]` in
anchor labels; `/reference-link/` URLs; `doc-link` classes; Cloudflare's `[email protected]` rewriting; inline
`<style>` blocks; the empty-heading comment; HTMLBlocks inlined into the page.
