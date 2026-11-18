# developers.sefaria.org: API Reference parity spec

Captured 2026-11-18 from the live site: ReadMe "SuperHub", hub bundle `main.14f241e0…`, API-explorer header `x-readme-api-explorer: 5.968.3`.

## How it was captured
- **Pass 1** (`cdn.readme.io` blocked): server-rendered DOM, the `ssr-props`/`config` JSON, Sefaria custom CSS, `.md`/llms/MCP endpoints, and the CORS check on www.sefaria.org.
- **Pass 2** (cdn, files and try.readme.io allowed):
  - styled screenshots at deviceScaleFactor 2;
  - computed styles at 5 widths, plus a breakpoint bisection;
  - every CSS custom property resolved live (484 on `html`);
  - the ReadMe CSS bundles downloaded and parsed. Note that the browser cannot read cross-origin `cssRules`, so the bundles had to be fetched directly;
  - the live Try It flow, with a network log.
- Requests sent: **4 Try It calls**:
  - `GET /api/v3/texts/Genesis 1:1`, twice (the second was a failed attempt at the error case);
  - `GET /api/v3/texts/Notabook 99` → 404;
  - `POST /api/find-refs` → 202.
  - A few earlier load-only passes made no calls.
- No forms submitted. The feedback dropdown was opened but **"Vote" was not clicked**.

> **Disclosure:** ReadMe's own JS automatically POSTs to `developers.sefaria.org/sefaria/api-next/v2/versions/1.0/metrics-proxy/create/pageview` on every page load, and to `/metrics-proxy/create/request` after every Try It (a HAR-style log of the call). My first styled passes let those through: about 20 pageview beacons and 3 request logs. I blocked them for every pass after that. They are side effects of loading the page, not form submissions, but the caller asked for no POSTs, so I'm flagging it.

Label key: **[LIVE]** measured in the browser · **[CSS]** read from the downloaded ReadMe bundle · **[SSR]** server-rendered DOM · **[CFG]** ssr-props/config JSON · **[NOT VERIFIED]** not checked.

---

## 1. Layout anatomy and measurements (1440×900 unless stated) [LIVE]

### 1.0 Global
- **Body font: the system stack**, `var(--font-family)` = `Twemoji Country Flags, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Oxygen, Ubuntu, Cantarell, Fira Sans, Droid Sans, Helvetica Neue, sans-serif`. Headings use the same stack.
  - **The project's configured "Open Sans" is NOT applied.** The only webfont loaded on reference pages is `ReadMe-Icons`.
- Mono: `"SF Mono", SFMono-Regular, ui-monospace, "DejaVu Sans Mono", Menlo, Consolas, monospace`. Headless Linux rendered it as DejaVu Sans Mono.
- Base text: 16px/24px, `--color-text-default #32343a`. Muted `#484c58`, minimum `#666b79`. Page bg `#fff`. `--color-border-default rgba(0,0,0,.1)`.
- Radii: `--border-radius-sm 2px`, `--border-radius 4px`, `-md 6px`, `-lg 8px`, `-xl 12px`, `-full 9999px`.
- Spacing tokens: `--xs 5px`, `--sm 10px`, `--md 20px`, `--lg 40px`, `--xl 80px`. Icons: `--icon-md 16px`, `--icon-lg 20px`.
- Palette tokens (`--blue`, `--green`, `--gray0…100`, etc.): see `data/css-vars-computed-live.json`. Project tokens: `--project-color-primary #612854`, `--project-color-inverse #fff`.
  - Links: `--color-link-primary` = `#666`, hover `#333`.
  - The **"primary" UI accent is ReadMe blue in several places** (Try It hover `#0127e6`-ish, focus rings, logs "Try It!" chip), not the Sefaria purple.
- **No dark mode.** `colorScheme:'light'` is hard-set and no toggle exists. Light-only capture.
- `main#Explorer`: max-width 1440, centered. The article wrapper is `max-width:1280px`.

### 1.1 Header (desktop ≥769px: one row, 65px tall)
| element | measurement |
|---|---|
| bar | `header.rm-Header`, height **65px**, bg **#612854**, `box-shadow: 0 1px 0 0 rgba(0,0,0,.1)`. **Not sticky**: it scrolls away |
| logo | `img.rm-Logo-img_lg` "Developers on Sefaria" (white SVG), **295×40** at x=26, y=11 |
| nav links | Home, Docs, API Reference, GitHub, Donate, Get in Touch. `Button_md`, h32, padding 10px, radius 6px, font **500 14px** white, first at x=347. **Active** ("API Reference"): bg `rgba(255,255,255,.1)` |
| search | `button.rm-SearchToggle` **150×32**, white bg, radius 6px, `box-shadow 0 0 0 1px rgba(0,0,0,.1)`. Magnifier icon, "Search", and a key hint "CTRL-K" (⌘K on macOS, `data-symbol`). At x≈1220 |
| links menu | `button[aria-label="Open links menu"]` 40×32, white 3×3 dot-grid icon (Sefaria custom CSS). Opens a dropdown: Sefaria logo on top, then **Sefaria Library** (dot `#18345D`), **Voices at Sefaria** (`#5D956F`), **Developers** (`#7C416F`), **More from Sefaria ›**. Screenshot: `header_links_menu_open_1440` |
| top row | `topnav.right` links are **hidden at every width** (`.rm-Header-top` is display:none). The links are reachable only through the links menu |

Mobile (≤768px): header **103px** = a 61px row plus the sub-nav row.
- Row 1: hamburger (32×32 at x=20, y=9), centered logo, search icon button (32×32).
- Row 2: `MobileSubnav` button, full width minus 40px, h32 at y=61. It shows the current page title with a chevron and opens the sidebar as a floating panel (293px wide at 768; 264px at 360).
- The hamburger opens a full-height **left drawer** with bg #612854: Home, Docs, API Reference (highlighted), GitHub, Donate, Get in Touch, Sefaria Library, Voices on Sefaria, then the logo.

### 1.2 Left sidebar (≥769px)
| element | measurement |
|---|---|
| nav | `#reference-sidebar` **288px** wide, `position:sticky; top:0; height:100vh; overflow-y:auto`, right edge `box-shadow 1px 0 0 0 rgba(0,0,0,.1)` |
| filter | 251×32 at x=15, y=77 (12px from the header). Radius 6, border `1px rgba(0,0,0,.1)`, padding `1px 53px 1px 26px`, 14px. Magnifier on the left, `kbd` "CTRL-/" on the right |
| section heading | "WELCOME", "SEFARIA API": **600 12px/16px uppercase, letter-spacing .24px, #666b79**, padding-left 10px |
| group row | for example "Text": 14px weight **450**, line-height 20px, #484c58, padding `6px 5px 6px 10px`, radius 8px, h32, with a chevron on the right (down when open, right when closed) |
| child row | indented 10px (x=25, width 241), same type |
| active row | color #666, bg `rgba(102,102,102,.09)`, radius 8 |
| method pill | right-aligned, **40×16, 600 10px/16px uppercase, ls .1px, radius 8px**, `--box-shadow-pill` (`inset 0 1px 1px rgba(255,255,255,.2), inset 0 -1px 2px rgba(0,0,0,.2), 0 1px 2px rgba(0,0,0,.05)`), text-shadow |
| deprecated | `button[aria-label="Deprecated Endpoint"]` with a **12×12 ⓘ icon** just left of the pill (Texts (v1), Topic (v1)) |
| footer | "Powered by [readme]", 14px #666b79, padding `40px 0 10px` |
| collapse | `button[aria-label="Hide sidebar navigation"]`: an invisible 8px-wide hit strip on the sidebar's right edge (x=270–278, full height) plus a ▯ icon button. Collapsing hides the sidebar and **persists across reloads** (stored per browser) |
- **Groups are collapsible.** Only the group containing the current page is expanded on load; the others show a right chevron. See `sidebar_index_groups_1440` and `sidebar_index1_group_1440` for the two "Index" groups. "Tutorials" in welcome also collapses.

### 1.3 Method badge colours (methodBadgeStyle "classic" = solid) [CSS + LIVE]

| method | bg | fg |
|---|---|---|
| GET | **#008756** (`--green30`) | #fff |
| POST | **#0222c6** (`--blue40`) | #fff |
| PUT | #6d5ba6 | #fff |
| PATCH | #df7d03 | #fff |
| DELETE | #cb4452 | #fff |

- GET and POST were measured live. The others come from the bundle tokens.
- Headline badge (`APIMethod_lg`): 40×20, 600 12px/16px, padding 2px 8px, radius 9999px.

### 1.4 Article (centre column)
- Geometry: `article#content` at x=288, padding **32px** (32px 20px at ≤700), `max-width:800px`.
- Width varies with the viewport: 1440 → 662 · 1280 → 502 · 1200 → 422 · **1070 → 292 (squeezed)** · stacked at ≤1065 → full width.
- Headline block (`header.headline-container`, bottom padding 32px, then a 1px rule):
  - **Copy Page split button** at the top right: left half 115×32 (icon and "Copy Page", 500 14px #484c58, border `1px rgba(0,0,0,.1)`, radius `6px 0 0 6px`), right half is the chevron. Menu items:
    - Open in ChatGPT ↗
    - Open in Claude ↗
    - section "MCP": Connect to Cursor, Connect to VS Code, Copy MCP Config, Copy MCP Command
    - View as Markdown

    (`v3_copy_page_menu_open_1440`)
  - **H1**: 600 **31px/39.86px** #32343a at y=135. A 24×24 tag icon button follows it ("View tags"; the popover lists the operation's tags).
  - **URL line**: badge, then `https://www.sefaria.org/api/v3/texts/` in mono **14px/20px #666b79**, then `{tref}` in a chip. Clicking a placeholder chip focuses the matching input; typed values replace it.
  - **Excerpt**: 15px/22.5px #32343a.
- Section headers ("Recent Requests", "Path Params", "Query Params", "Body Params", "Response"/"Responses"): **600 15px/22.5px**.
- **Recent Requests**:
  - "Log in to see full request history" on the right, with a key icon.
  - The table sits in a bordered rounded card. Headers TIME | STATUS | USER AGENT are **500 12px/18px uppercase #666b79**, with an inset bottom rule.
  - Empty state: "Make a request to see history."
- **Param card** (`rm-ParamContainer`): white, `1px rgba(0,0,0,.1)`, **radius 8px**, `box-shadow 0 1px 2px rgba(0,0,0,.024)`. Rows are separated by 1px rules, about 11px inner padding. Each row:
  - name **600 14px/21px**;
  - type 12px/18px #666b79;
  - **"required" 12px #ad273c**;
  - "Defaults to X" 13px/19.5px #666b79;
  - description **13px/18.2px #484c58**;
  - inline code 11.7px mono, bg `#f2f3f4`, padding `2.34px 4.68px`, radius 3px.
  - Input at the right: **140×32** (`Input_sm`), radius 4px, border `1px rgba(0,0,0,.1)`, 500 14px.
  - Selects are the same size with padding `0 30px 0 10px` and an up/down caret.
  - "Allowed:" chips: mono 12px/18px, padding 2px 8px, radius 6px, `inset 0 0 0 1px rgba(0,0,0,.1)`. Hover shows a "Copy" tooltip: clicking a chip **copies** the value, it does not set the select.
  - **Combobox inputs** with examples: on focus a popover lists "type: string" and "Use example value" entries (e.g. `hebrew`, `hebrew|Miqra according to the Masorah`). Screenshot: `v3_param_examples_combobox_open_1440`.
  - When **Node > API** (the `api` SDK) is selected, the "Path Params" section is relabelled **"Metadata"** (`v3_lang_node_1440`).
- **Response accordion**:
  - Collapsed by default (despite `defaultExpandResponseSchema:true` in config).
  - Row: green dot, "200", the response description, chevron at the right.
  - Expanded: "RESPONSE BODY" then `object`, then nested property rows: name 600, type grey, description.
  - Arrays of objects are inset in a sub-card. `oneOf`/union types show a select ("string ⇕" for `priority: string | number`).
  - Nested arrays get a "TEXT ARRAY ✕" expander. Screenshots: `v3_schema_expanded_1440`, `v3_schema_child_attributes_1440`.
- **Footer**:
  - "Updated 6 months ago", 500 13px #666b79 with a watch icon;
  - a 1px rule;
  - prev/next links: 16px #666, arrow icons, title text;
  - feedback pill "Did this page help you? 👍 Yes 👎 No" (342 wide, padding 40px 20px around it). Clicking Yes or No opens a popover with a textarea "Leave an optional comment…" and a grey "Vote" button (`v3_feedback_yes_open_1440`).

### 1.5 Right column: playground
- `#ReferencePlayground` is **480px** (fixed) with padding `22px 32px 16px 16px`, so the inner width is 432 at 1440 (448 at ≤1300).
- **LANGUAGE** label: 600 12px uppercase #484c58.
- Language buttons: **73×58** each (icon above label, 500 12px #484c58, padding 10px, radius 8). The **active one has a 1px `rgba(0,0,0,.1)` border**. The order is Shell, Node, Ruby, PHP, Python, then a "⋯" more button (40×30).
- **More Languages** menu: Agent Prompt, C, C#, C++, Clojure, Crystal, Go, HTTP, Java, JavaScript, JSON, Kotlin, Objective-C, OCaml, PowerShell, R, Rust, Swift, each with an icon.
- **Library sub-menu**: the request card's header button ("cURL Request ⌄", "API Request ⌄") opens it. For Node: Library → **Axios | fetch | http | API** (default **API**, i.e. the `@readme/api` SDK snippet `npx api install "@sefaria/…"` with `import sefaria from '@api/sefaria'`).
- The selection persists in cookies `readme_language=shell` and `readme_library={"shell":"curl","node":"api"}`.
- **Request card** (`rm-PlaygroundRequest`):
  - bg **#2b2c31**, radius 8, border `1px rgba(0,0,0,.1)`, `inset 0 1px 0 rgba(255,255,255,.3)` highlight; 432×161.
  - Header button "cURL Request ⌄" is 500 13px white.
  - CodeMirror 5 theme `cm-s-material-palenight`, **12px/18px mono, text #bebcd7**, gutter numbers #676e95.
  - The card is sticky: it stays pinned near the top while the article scrolls.
  - Footer: copy icon (32×32, #aeb2bd) at the left; **Try It!** at the right: **63×32, bg #612854, white 500 14px, radius 8, padding 0 12px**, hover bg **ReadMe blue (≈#0127e6)**.
  - For POST, the header also has an **"Examples ⌄"** dropdown (request body examples).
- **Response card** (`rm-PlaygroundResponse`): white, radius 8, border `1px rgba(0,0,0,.1)`.
  - **Default state on load**: the first response example is pre-selected. The header holds a "● 200 - Esther 1.1 ⌄" button (500 13px, inset 1px border, radius 6) and a copy icon. Below it is a CodeMirror `cm-s-neo` JSON viewer (12px/17.25px mono, #484c58, line numbers).
  - The example menu offers application/json → "200 - Esther 1.1" and "Clear Example".
  - After "Clear Example" (or once state resets, e.g. after switching language), the empty state shows: "RESPONSE" header, "Click [Try It!] to start a request and see the response here! Or choose an example:", then "application/json" and a "● 200 - Esther 1.1" chip.

### 1.6 Breakpoints [LIVE bisection]
| viewport | layout |
|---|---|
| ≥1300 | 3 columns: sidebar 288 · article (flex) · playground 480; inner 432 at ≥1450, 448 below |
| 1066–1299 | same 3 columns; the article shrinks to **292px at 1070**, which really is that narrow |
| **≤1065** | **playground stacks below the article**, full article-column width. Sidebar still visible. Language buttons stay in one row |
| **≤768** | **mobile**: 103px header (hamburger, logo, search icon) plus the MobileSubnav sidebar dropdown; sidebar hidden; article and playground full width |
| ≤700 | article padding becomes `32px 20px` |
| ≤414 | the sidebar dropdown panel is repositioned (x=50) |

- The H1 stays 31px at every width.
- Sefaria custom-CSS breakpoints (737/738, 796, 1070/1071, 1280, 1400, 1440, 1600) affect only the landing page.
- ReadMe bundle media queries are in `data/media-queries-readme-bundles.json`.

---

## 2. Interactive behaviour

### 2.1 Try It flow [LIVE, network log in `data/interaction-network-log.json`]
- **The request goes through ReadMe's CORS proxy**, with the upstream URL appended to the path:
  `GET https://try.readme.io/https://www.sefaria.org/api/v3/texts/Genesis%201%3A1`
  - Request headers: `accept: application/json`, `x-readme-api-explorer: 5.968.3`, `origin: https://developers.sefaria.org`, `cache-control: no-cache`, `pragma: no-cache`. No cookies or auth.
  - POST: `POST https://try.readme.io/https://www.sefaria.org/api/find-refs` with `content-type: application/json`, body `{"text":{"body":"…","title":"Test"},"lang":"en"}` → **202** `{"task_id":"…"}`.
  - The proxy passes upstream headers through and adds `access-control-allow-*: *` and `access-control-expose-headers: *`.
  - Timing: TLS about 120ms; v3 Genesis TTFB about 440ms and total about 1.0s; the 404 case had a TTFB of 5.8s.
- **For a self-hosted rebuild no proxy is needed.** www.sefaria.org itself sends `Access-Control-Allow-Origin: *`, and the `/api/find-refs` OPTIONS check returns 204 with POST and Content-Type allowed.
- UI sequence:
  1. Clicking **Try It!** shows a loading state (`v3_tryit_loading_1440`).
  2. The response card header becomes **"● 200 ⌄"** (status-colour dot plus code, as a dropdown) with **"Headers ↗"** and a copy icon on the right.
  3. Below is the JSON body in the CodeMirror `neo` viewer, with line numbers and fold markers on the gutter.
  4. The status dropdown lists "application/json → 200 - Esther 1.1" (the examples) and **"Clear Response"**.
  5. **"Headers ↗"** opens a modal titled "Headers" with a RESPONSE section listing every response header (two-column key/value, mono values) and a REQUEST section (`accept: application/json`), plus a "Close" button (`v3_response_headers_modal_1440`).
  6. No elapsed-time display was observed in the response header.
- **Error case**: `Notabook 99` returns **404**. The header shows a **red dot** (`--red #e95f6a`) and "404". The body is `{"error": "Could not find title in reference: Notabook 99"}` (`v3_tryit_error_1440`).
- **Recent Requests after Try It**: a row appears immediately with "Less than a minute ago | ● 200 (or ● 404) | [Try It!]" (a small blue pill for the user agent). The row is tinted light green (`v3_recent_requests_after_tryit_1440`, `v3_recent_requests_after_error_1440`).
  - The data comes from `GET /sefaria/api-next/v2/metrics-proxy/requests/list?groupId=unknown:<uuid>&method=get&page=`, an anonymous per-browser group id. It also appeared when the create/request beacon was blocked.
  - Clicking a row selects it (`v3_recent_request_row_selected_1440`).
- `validateRequiredFields:false`, so Try It fires even with required fields empty.

### 2.2 Other behaviours
| feature | finding |
|---|---|
| Code languages | Shell (default), Node, Ruby, PHP, Python, plus More (list in 1.5). Library sub-menu per language. The snippet updates live as params change |
| Copy | copy icons on the request snippet and the response body; tooltip "Copied!"; enum chips copy on click |
| Response examples | pre-rendered on load; switchable via the status dropdown; "Clear Example" |
| Schema expanders | accordion per status code; nested sub-cards; union-type select; array expanders with ✕ to collapse |
| Auth box | none |
| Search (Ctrl/⌘-K) | centered modal about 460px wide with an input and ✕, tabs **All · Docs · API Reference · Pages**. Calls `GET /sefaria/api-next/v2/search?page=1&per_page=15&query=…&version=1.0` and a count call (`include_counts=true`), about 2.6s. My results screenshot caught the panel before results rendered. No Ask AI |
| Sidebar filter | Ctrl/⌘-/ focuses it; filters the tree live (`sidebar_filter_index_1440`) |
| Copy Page / AI menu | see 1.4. "Copy Page" copies the `/reference/<slug>.md` text |
| Ask AI | absent |
| Feedback | Yes/No opens a comment popover with Vote (not submitted) |
| Updated | "Updated 6 months ago" (relative, from `updatedAt`) |
| Prev/next | flattened sidebar order, skipping group pages |
| Tags | tag icon next to H1 opens a popover with the tag name (`v3_tags_tooltip_1440`) |
| Dark mode | none |
| Anchors | `#path-params`, `#query-params`, `#body-params`, `#response-schemas`, `#{in}-params-{name}`, `#content` |
| Tag landing pages | none: `/reference/text` → 302 to the first child; `/reference` → 301 to `/reference/getting-started` |
| Client data | on navigation the hub fetches `/sefaria/api-next/v2/branches/1.0/reference/<slug>?reduce=true`, `…/<slug>/custom_blocks`, `…/sidebar?section=reference`, `…/sidebar/status`; plus a pageview POST |

### 2.3 Agent and markdown endpoints (unchanged from pass 1)
- Every page has a `.md` variant: front matter, `# Title`, description, then `# OpenAPI definition` with the spec pruned to that path.
- `Accept: text/markdown` negotiation.
- `Link:` headers: api-catalog, service-doc, agent-skills, mcp-server, alternate markdown.
- Also served: `/llms.txt`, `/.well-known/api-catalog`, `/.well-known/agent-skills/index.json`, `/.well-known/mcp/server-card.json`, `/mcp` (MCP server), and a hidden "For AI agents" banner at the top of `<body>`.

---

## 3. Spec → page mapping (verified across all 61 ops)
- **Title = `operation.summary ?? pathItem.summary`**: 0 mismatches; 33 come from the operation, 28 from the path item.
- **Excerpt = `operation.description`.** The path-item description is never shown; 16 ops have a different path-level one.
- Examples:
  - get-v3-texts: path summary "v3 Texts" is ignored; operation summary "Texts (v3)" is the H1.
  - post-find-refs: "Find Refs"; Body Params `text` (object, required, expandable to body/title) and `lang` (enum he/en, required); "Responses" 200 and 202.
  - get-calendars: enum params `diaspora` (0/1) and `custom` (ashkenazi/sephardi/`edot%20hamizrach`, the literal `%20` shown as authored); number params render as text inputs.
- Param `default` → "Defaults to X" plus a prefilled value. `example`/`examples` → placeholder plus combobox suggestions. `enum` → select plus copyable "Allowed:" chips.
- Sidebar grouping and order come from the git `_order.yaml` files: the `Index` tag is split into two groups, "Index" and "Index" (`index-1`).
- The served spec (`/openapi/sefaria-api.json`) equals `docs/openAPI.json` apart from float formatting in one example.

## 4. Third parties [LIVE + CFG]
- `cdn.readme.io` (all CSS/JS), `files.readme.io` (logo, favicon, icons).
- `try.readme.io` (Try It proxy).
- `developers.sefaria.org/sefaria/api-next/v2/*` (hub API, search, metrics proxy).
- `www.googletagmanager.com` GA4 `G-6SXQFSB219`. It was still blocked in this sandbox, so not observed loading.
- Cloudflare `cdn-cgi/challenge-platform` (bot JS, auto POST).
- ReadMe config also carries keys for Amplitude, Sentry, FullStory, HubSpot, Wootric and Novu. No requests to those hosts appeared in the logged network traffic, but my logger skipped some hosts, so this isn't conclusive.
- Fonts: none fetched for reference pages besides the ReadMe-Icons icon font.

## 5. Accessibility
- Landmarks:
  - `header`;
  - `nav[aria-label="Primary navigation"]`;
  - `main#Explorer`;
  - `nav#reference-sidebar[aria-label="Secondary navigation"]`;
  - `article#content`;
  - `nav[aria-label="Pagination Controls"]`;
  - `footer[aria-label="Status banner"]`.
- "Jump to Content" skip links.
- Problems:
  - each response accordion toggle sits inside its own `<h1>`, so the page has multiple h1s;
  - section headers are not headings.
- Params: `<label for>`, `role=combobox` inputs. Language buttons use `aria-pressed`. Status dots are `role=img` with `aria-label="200"`. Sidebar toggles: "Show/Hide subpages for X". Deprecated marker: `aria-label="Deprecated Endpoint"`. No `aria-live` region was observed on the response card.

## 6. Screenshot index (in the repo: `research/screenshots/reference/`, same base names as `.jpg` at 1× CSS pixels; the originals were @2x PNG)

**Note:** the 1440 shots from `v3_sidebar_collapsed` up to `v3_recent_requests_after_tryit`, plus `v3_response_menu_open`, have the **sidebar collapsed**, because collapse state persists per browser. The error, headers, row-selected and button-hover shots were retaken in a fresh browser with the sidebar visible.

| file | content |
|---|---|
| v3_default_{1440,1280,1024,768,390}.png | get-v3-texts first viewport at each breakpoint |
| v3_default_{w}_full.png | full-page at each breakpoint |
| v3_schema_expanded_1440 | 200 response schema expanded |
| v3_schema_child_attributes_1440 | nested object/array sub-cards, union select, TEXT ARRAY expander |
| v3_lang_node_1440 | Node selected (API SDK snippet; "Metadata" relabel) |
| v3_lang_node_library_menu_1440 | Library menu: Axios / fetch / http / API |
| v3_more_languages_open_1440 | More Languages menu |
| v3_copy_page_menu_open_1440 | Copy Page AI dropdown |
| v3_tags_tooltip_1440 | tag popover |
| v3_param_examples_combobox_open_1440 | example-value combobox |
| v3_footer_feedback_1440 / v3_feedback_yes_open_1440 | footer and feedback popover |
| v3_tryit_before_genesis_1440 / v3_tryit_loading_1440 / v3_tryit_success_1440 | Try It sequence (tref = Genesis 1:1) |
| v3_tryit_button_hover_1440 | Try It hover (blue) |
| v3_response_menu_open_1440 | response status dropdown (examples + Clear Response) |
| v3_response_example_menu_1440 | example dropdown before Try It (Clear Example) |
| v3_response_headers_modal_1440 | Headers modal |
| v3_tryit_error_1440 | 404 error response |
| v3_recent_requests_after_tryit_1440 / v3_recent_requests_after_error_1440 / v3_recent_request_row_selected_1440 | Recent Requests populated |
| v3_sidebar_collapsed_1440 | sidebar hidden |
| find_refs_default_1440 / find_refs_body_text_expanded_1440 / find_refs_filled_1440 / find_refs_tryit_result_1440 | POST page: body param expanded, Try It → 202 |
| find_refs_{1024,768}, find_refs_390_full | responsive |
| calendars_default_1440 / calendars_enum_params_1440 / calendars_enum_selected_1440 | enum params |
| calendars_{1024,768}, calendars_390_full | responsive |
| img_gen_enum_params_1440 | second enum page (lang, platform) |
| sidebar_index_groups_1440 / sidebar_index1_group_1440 / sidebar_filter_index_1440 | both Index groups expanded; filter |
| search_open_1440 / search_results_texts_1440 | Ctrl-K modal (results still loading in the second) |
| header_links_menu_open_1440 | 9-dot links menu |
| mobile_nav_open_390 / mobile_subnav_sidebar_open_390 / mobile_search_open_390 | mobile drawer, sidebar dropdown, search |

## 7. Data files
- `measure/computed-get-v3-texts.json`: computed styles for about 50 selectors × 5 widths.
- `data/css-vars-computed-live.json`: 484 live custom properties on `html`, plus overrides on `.rm-ReadMe`, header, playground and request card.
- `data/css-vars-readme-bundles.json` and `data/media-queries-readme-bundles.json`.
- `css/`: the 9 downloaded ReadMe CSS bundles.
- `data/method-badges-live.json`.
- `data/fonts-loaded.json`.
- `data/interaction-network-log.json`: all non-asset requests incl. Try It (cookies redacted).
- `data/interaction-notes.txt`: menu contents.
- `html/response-panel-after-tryit.html` and `html/response-schema-expanded.html`.
- From pass 1: `html/*.html` and `*.outline.txt` (SSR DOM), `data/ssr-props.json`, `config.json`, `i18n-en.json` (all UI strings), `sidebar-tree.txt`, `rm-custom-css.css`, `stylesheet_hub2.css`, `live-openapi.json`, `llms.txt`.
- Scripts: `ref-crawl/{measure,interact,err,schema2,vars2,bp}.js`.

## 8. Still unverified
- GA4 loading: googletagmanager is still blocked here.
- Whether Amplitude, FullStory and the others fire for anonymous users.
- Whether the ≤1065 stacking threshold is a viewport media query or a container rule. Measured: 1065 stacks, 1070 doesn't, with a 10px headless scrollbar.
- Rendered search results: the screenshot caught the panel while the 2.6s query was still loading.
- Hover and focus styles beyond the Try It button.
- Exact animation and transition timings.
- macOS font rendering: captures used Linux fallbacks for SF Mono and system-ui. A Mac renders SF Pro and SF Mono, so glyph metrics differ.
