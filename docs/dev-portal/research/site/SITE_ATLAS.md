# developers.sefaria.org — Site Atlas (non-reference surfaces)

Crawled 2026-11-18 (ReadMe deploy `5.968.3`, project subdomain `sefaria`, git branch `1.0` @ `b661899c`, plan `business-annual-2024`, "SuperHub" + `mdxish` renderer).
Scope: everything except the internals of `/reference/*` pages (covered by another agent). Read-only: GETs only, no form submits, no feedback clicks.

Paths below were relative to the crawl workspace; in the repo, data files are in `research/site/`, raw machine files in `research/site/machine/`, live markdown in `research/site/live-markdown/`, and screenshots in `research/screenshots/site/` and `site-pages/` (JPEG, same base names).

| Artifact | File |
|---|---|
| Per-page crawl data (title, excerpt, TOC, pagination, component classes, links, iframes) | `pages.json` |
| Docs sidebar tree (from ReadMe sidebar API) | `sidebar-tree.txt`, `raw/sidebar-docs.json`, `raw/sidebar-reference.json`, `raw/sidebar-custom_pages.json` |
| Markdown source of every docs page (`.md` variants) | `raw/md/*.md` |
| Full SSR project config (appearance, flags, AI, MCP, nav) | `raw/ssr-props-home.json` |
| Custom CSS currently live (`<style title="rm-custom-css">`) | `custom-css.css` |
| Legacy "hub2" stylesheet still in config | `stylesheet_hub2_legacy.css` |
| Homepage custom HTML block (landing page) | `landing-custom.html` |
| CSS custom properties: `:root` rules from same-origin sheets (19) / all computed vars on `<html>` (514) | `root-css-vars.json` / `root-css-vars-computed.json` |
| Machine endpoints | `raw/llms.txt`, `raw/wk_docs_llms.txt`, `raw/wk_reference_llms.txt`, `raw/sitemap.xml`, `raw/robots.txt`, `raw/mcp-server-card.json`, `raw/wk_.well-known_api-catalog`, `raw/wk_.well-known_agent-skills_index.json`, `raw/read-the-docs-SKILL.md`, `raw/openapi-sefaria-api.json` |
| Interaction dumps (search, AI menu, switcher) | `interact.json`, `shots-components.json`, `chrome.json` |
| Screenshots (deviceScaleFactor 2) | `shots/` (global + components), `shots/pages/` (1440x900 viewport of each page) |

Crawl scripts (not committed) (`crawl.js`, `shots.js`, `homefull.js`, `interact.js`, `lib.js`).
Crawl note: inside this sandbox, Playwright `route.fetch` caching broke `cdn.readme.io` CSS; the working path is plain navigation with `NOCACHE=1` and a "stylesheets loaded" check (`lib.js:gotoStyled`). Some early screenshots were overwritten after this fix. `sefaria.formstack.com`, `sefaria.activehosted.com` and `www.googletagmanager.com` are blocked by the sandbox egress proxy, so those were not inspected.

---

## 1. URL inventory

### 1.1 Top-level sections and modules

ReadMe modules enabled (`context.project.modules`): `landing`, `docs`, `reference`, `examples`, `custompages`. Disabled: `changelog`, `discuss`, `suggested_edits`, `tutorials` (recipes), `graphql`. One version only (`1.0`), no i18n beyond `en`.

| Path | Status | What |
|---|---|---|
| `/` | 200 | Custom landing page (one HTML block, see §3) |
| `/docs` | 301 → `/docs/welcome` | Guides hub |
| `/docs/<slug>` | 200 | 60 guide pages (table below) |
| `/reference` | 301 → `/reference/getting-started` | API reference (other agent). Note: the reference sidebar's first category, **"welcome"**, holds guide-like pages: Getting Started, **Tutorials** (Dvar Torah Outliner, Tanakh Trivia Game, Data Visualization, Writing Playwright Tests), and FAQ ("others-have-asked"). The homepage links to `/reference/data-visualization`. |
| `/page/contact-us` | 200 | The only custom page ("Get in Touch") |
| `/changelog`, `/recipes`, `/discuss`, `/blog` | 404 | Modules off. SSR props still carry 3 old unpublished changelog stubs ("Welcome to Sefaria", "We're playing with the system", "Regarding Custom HTML") — dead content, not reachable. |
| `/login` | 302 → `https://dash.readme.com/to/sefaria` | ReadMe admin login |
| `/logout` | 302 → `/` | |
| `/suggested-edits/` | 302 → `/login?...` | Module off; still redirects to login |

### 1.2 Docs pages (sidebar order, from `sidebar-docs.json`)

Five sidebar categories. Columns: TOC = count of right-rail TOC entries; Pag = prev/next pagination block rendered; Components = ReadMe markdown blocks detected.

| Category | Page | Path | TOC | Pag | Components |
|---|---|---|---|---|---|
| TECHNICAL DOCS | Welcome to Sefaria's Technical Documentation | `/docs/welcome` | 6 | no | callout |
| TECHNICAL DOCS | Projects Powered By Sefaria | `/docs/powered-by-sefaria` | 0 | yes | html-block |
| TECHNICAL DOCS | ↳ Project Acceptance Criteria | `/docs/powered-by-sefaria-acceptance-criteria` | 0 | yes |  |
| TECHNICAL DOCS | Copyright and Data Use | `/docs/usage-of-our-name-and-logo` | 3 | yes | image |
| TECHNICAL DOCS | The Structure of a Book in the Sefaria Library | `/docs/the-structure-of-a-text-on-sefaria` | 0 | no |  |
| TECHNICAL DOCS | ↳ Index and Versions | `/docs/index-and-versions` | 5 | no | table |
| TECHNICAL DOCS | ↳ The Index Schema | `/docs/the-index-schema` | 3 | no | image |
| TECHNICAL DOCS | ↳ ↳ JaggedArray and JaggedArray Nodes | `/docs/jaggedarray-and-jaggedarray-nodes` | 4 | no | code-tabs, code |
| TECHNICAL DOCS | ↳ ↳ SchemaNode | `/docs/schemanode` | 3 | no |  |
| TECHNICAL DOCS | ↳ ↳ The Structure of a Simple Text | `/docs/the-structure-of-a-simple-text` | 4 | no | code-tabs, code, table, image |
| TECHNICAL DOCS | ↳ ↳ The Structure of a Complex Text | `/docs/the-structure-of-a-complex-text` | 5 | no | code-tabs, code, image |
| TECHNICAL DOCS | ↳ ↳ Node Titles | `/docs/node-titles` | 5 | no | code-tabs, code, table |
| TECHNICAL DOCS | ↳ Alternate Structures | `/docs/alternate-structures` | 3 | no |  |
| TECHNICAL DOCS | ↳ Commentaries | `/docs/commentaries` | 2 | no | table |
| TECHNICAL DOCS | ↳ Terms | `/docs/terms` | 3 | no | code-tabs, code |
| TECHNICAL DOCS | ↳ Lexicon | `/docs/lexicon-docs` | 4 | yes |  |
| TECHNICAL DOCS | Text References | `/docs/text-references` | 8 | no | table, image |
| TECHNICAL DOCS | Categories | `/docs/categories` | 4 | no | code-tabs, code, table |
| TECHNICAL DOCS | Topic Ontology | `/docs/topic-ontology` | 9 | no | table |
| TECHNICAL DOCS | ↳ Linear Integer Programming For Topic Page Sources Selection | `/docs/linear-integer-programming-for-topic-pages-sources-selection` | 6 | yes | image |
| TECHNICAL DOCS | Formatting within Sefaria Texts | `/docs/text-formatting-beyond-the-segment-level` | 4 | no | table |
| TECHNICAL DOCS | Additional API Endpoints | `/docs/api-wiki` | 21 | no | code |
| TECHNICAL DOCS | ↳ ElasticSearch Proxy API | `/docs/search-api` | 7 | no | code |
| TECHNICAL DOCS | The Sefaria Linker | `/docs/linker` | 2 | yes |  |
| TECHNICAL DOCS | ↳ Embed Linker v2 In Your Site (**deprecated** badge) | `/docs/linker-v2` | 12 | yes | code, table |
| TECHNICAL DOCS | ↳ Embed Linker v3 on Your Site | `/docs/linker-v3` | 16 | yes | code-tabs, code |
| TECHNICAL DOCS | ↳ How to Format Citations for the Linker | `/docs/how-to-format-citations-for-the-linker` | 6 | yes |  |
| TECHNICAL DOCS | ↳ איך ליצור מראי מקורות להפניה - How to Format Citations (HE) | `/docs/איך-ליצור-מראי-מקורות-להפניה` (percent-encoded in sitemap) | 0 | yes | html-block (RTL) |
| TECHNICAL DOCS | ↳ The Sefaria Linker API | `/docs/linker-api` | 10 | yes | code-tabs, code, table |
| TECHNICAL DOCS | ↳ The Sefaria Linker Async Task API | `/docs/async-task-api` | 4 | yes | code-tabs, code, table |
| TECHNICAL DOCS | ↳ Websites Using the Linker | `/docs/sites-using-the-linker` | 0 | yes |  |
| TECHNICAL DOCS | Sefaria GitHub (sidebar **link item**, slug `helpful-link-somewhere-else`) | → `https://github.com/Sefaria/Sefaria-Project` | — | — | — |
| TECHNICAL DOCS | The Sefaria MCPs | `/docs/the-sefaria-mcp` | 4 | yes | callout (error) |
| TECHNICAL DOCS | The Educator Playbook: A Quick Guide to Vibe-Coding with Sefaria | `/docs/the-educator-playbook-a-quick-guide-to-vibe-coding-with-sefaria` | 6 | yes | code-tabs ("Text" prompt blocks) |
| local installation | Getting Started | `/docs/getting-started-with-local-installation` | 0 | yes |  |
| local installation | Public Contributions | `/docs/contributions-to-sefarias-repositories` | 6 | yes |  |
| local installation | Local Installation Instructions | `/docs/local-installation-instructions` | 17 | yes | callout (warn+error), code, table |
| local installation | ↳ Run Sefaria with Docker-Compose | `/docs/docker-compose-sefaria` | 6 | yes | callout, code |
| local installation | Workflowy | `/docs/workflowy` | 6 | yes | code-tabs (OPML), image |
| local installation | Command-Line-Interface (CLI) | `/docs/cli` | 13 | yes | callout, code-tabs, image |
| local installation | Technical Notes | `/docs/technical-notes` | 0 | yes |  |
| local installation | ↳ Term Creation | `/docs/term-creation` | 2 | yes | code |
| local installation | ↳ Titles for Index | `/docs/titles-for-index` | 0 | yes | code-tabs |
| local installation | ↳ Category Creation | `/docs/category-creation` | 2 | yes | code |
| Dev Digest Archive | The Sefaria Developer Community Archive | `/docs/the-sefaria-developer-community-archive` | 2 | yes |  |
| Dev Digest Archive | All About Texts, Volunteering for Tests (June 2024, Issue 1) | `/docs/june-2024` | 6 | no | image |
| Dev Digest Archive | Celery Queues, Local Install and the Shape API (Sept 2024, Issue 2) | `/docs/september-2024` | 5 | no | image |
| Dev Digest Archive | Linear Programming, Topic Curation, and API Tips (Dec 2024, Issue 3) | `/docs/linear-programming-topic-curation-and-api-tips` | 5 | no | image |
| Dev Digest Archive | Top Tech Tips, New Projects, and More! (Mar 2025, Issue 4) | `/docs/top-tech-tips-new-projects-and-more-march-2025-issue-4` | 5 | yes | image |
| Dev Digest Archive | Calendar API, a User-Requested feature, and More! (Jun 2025, Issue 5) | `/docs/calendar-api-a-user-requested-feature-and-more` | 6 | yes | image |
| Dev Digest Archive | Accessibility, Interns, and the Passages API (Sept 2025, Issue 6) | `/docs/accessibility-interns-and-the-passages-api-september-2025` | 6 | yes | image |
| Dev Digest Archive | Django middleware innovation & MCPs (Jan 2026, Issue 7) | `/docs/django-middleware-innovation-mcps-january-2026-issue-7` | 5 | yes | image |
| Dev Digest Archive | Sefaria-Export, A Data Puzzle and Deep Wiki (Apr 2026, Issue 8) | `/docs/sefaria-export-a-data-puzzle-and-deep-wiki` | 5 | yes | image |
| SEFARIA RESEARCH | The Disambiguator | `/docs/the-disambiguator` | 6 | yes | table, image, image-frame |
| SEFARIA RESEARCH | Patot | `/docs/patot` | 7 | yes | code-tabs (Bash), image |
| SEFARIA RESEARCH | Beyond KMeans - PyCon 2024 | `/docs/sefaria-research-at-pyconn-2024` | 0 | yes | embed (YouTube via Embedly) |
| SEFARIA RESEARCH | Getting Evals Right for a Jewish AI Chatbot | `/docs/getting-evals-right-for-a-jewish-ai-chatbot` | 7 | yes |  |
| about Sefaria | General FAQ | `/docs/general-faq` | 9 | no | image |
| about Sefaria | Guide to Contributing | `/docs/guide-to-contributing` | 3 | no |  |
| about Sefaria | ↳ How to Report a Mistake | `/docs/how-to-report-a-mistake` | 3 | yes | image |

Notes:
- Sidebar category labels are stored in mixed case ("local installation", "about Sefaria") and rendered uppercase by CSS.
- No page is `hidden`. The only `deprecated` page is Linker v2 (shows an info-circle icon button labelled "Deprecated Doc" in the sidebar).
- Prev/next pagination is page-dependent (absent on most "Structure of a Book" subtree pages, Welcome, FAQ, older digests; re-verified, not a crawl artifact). It skips the external link item (MCPs page: prev = "Websites Using the Linker").
- `sitemap.xml` (129 URLs: `/`, `/page/contact-us`, 60 docs, 68 reference) matches `llms.txt` exactly (plus `/`).

### 1.3 Machine / agent endpoints

| Endpoint | Status / type | Notes |
|---|---|---|
| `/robots.txt` | 200 text | `Allow: /`; disallows `/*/api-next`, `/cdn-cgi/`, `/edit/`, `/*/edit/`, `/suggested-edits/`, `/login`, `/logout`; points to sitemap and llms.txt |
| `/sitemap.xml` | 200 xml | 129 URLs (sitemap flag in store says `disabled`, but it is served) |
| `/llms.txt` | 200 text | Full index: docs grouped by sidebar category with excerpts, `## API Reference: …` groups, `## Pages` (Contact Us). Links point to `.md` variants. |
| `/docs/llms.txt`, `/reference/llms.txt` | 200 text | Section-scoped llms.txt ("This file lists one part of the documentation") |
| `/llms-full.txt` | **404** | Not offered |
| `/docs.md` | 302 → `/docs/llms.txt` | |
| `/<any page>.md` (e.g. `/docs/welcome.md`, `/page/contact-us.md`, `/reference/getting-started.md`) | 200 `text/markdown` | Raw MDX-ish source with YAML front matter: `updatedAt`, `agentTools.projectIndex: https://developers.sefaria.org/llms.txt`. Components appear as `<Callout>`, `<Image>`, `<Table>`, `<Embed>`, `<HTMLBlock>{\`…\`}</HTMLBlock>`. |
| Content negotiation | `Accept: text/markdown` on `/docs/welcome` → 200 `text/markdown` | `Vary: Accept` |
| HTTP `Link` header on doc pages | | `rel="api-catalog"` → `/.well-known/api-catalog`; `rel="service-doc"` → site root; `rel="agent-skills"` → `/.well-known/agent-skills/index.json`; `rel="mcp-server"` → `/.well-known/mcp/server-card.json`; `rel="alternate" type="text/markdown"` → `/docs/<slug>.md` |
| `/.well-known/api-catalog` | 200 `application/linkset+json` | service-desc → `/openapi/sefaria-api.json`, service-doc → `/reference` |
| `/openapi/sefaria-api.json` | 200 JSON (567 KB) | OpenAPI 3.0.2 "Sefaria API" 1.0.0. (`/openapi.json` 404; `showOpenAPIDownload=false` so no UI download button) |
| `/.well-known/agent-skills/index.json` | 200 | One skill `read-the-docs` (type `skill-md`) → `/.well-known/agent-skills/read-the-docs/SKILL.md` (tells agents to fetch llms.txt) |
| `/.well-known/mcp/server-card.json` | 200 | `name: com.readme/sefaria`, `remotes: [{type: "streamable-http", url: "https://developers.sefaria.org/mcp"}]`. No tool list in the card. |
| `/mcp` | 200 `text/html`, 48 bytes on plain GET | Body: "This URL can only be accessed with a MCP client." CORS `*`, allows `GET, POST, PUT, DELETE, OPTIONS`, plus `x-readme-*` headers. Streamable-HTTP transport; tools only discoverable via a JSON-RPC POST (`tools/list`), which was **not** sent. Config: `mcp.state=enabled`, no custom/disabled tools, no auth (`oauth.type=none`, `require_oauth_sign_in=false`), callback `/mcp/oauth/callback` reserved. ReadMe's generated MCP server normally exposes doc search/read and OpenAPI endpoint-inspection tools (unverified here). |
| Second MCP (not ReadMe) | | Docs advertise "Sefaria Texts MCP" at `http://chat.sefaria.org/mcp/`; source at `github.com/Sefaria/sefaria-mcp` |
| `/site.webmanifest`, `/favicon.ico`, `/apple-touch-icon.png`, `/icon-192.png`, `/icon-512.png` | 200 | Favicon set, manifest `name: "Sefaria"` |
| RSS / `/feed` / `/changelog.rss` | 404 | None |
| `/.well-known/llms.txt`, `/.well-known/security.txt`, `/.well-known/oauth-*` | 404 | |
| Internal JSON (used by the SPA, disallowed in robots) | 200 | `/sefaria/api-next/v2/branches/1.0/sidebar?section=docs|reference|custom_pages`, `/sefaria/api-next/v2/search?query=…&page=1&per_page=15&version=1.0`, `/sefaria/api-next/v2/search/sections`, `/sefaria/api-next/v2/search/not_found_suggestions?pathname=…`, `POST …/metrics-proxy/create/pageview` |

AI discovery config (`ai.discovery`): `link_headers`, `markdown_negotiation`, `agent_hint_banner`, `api_catalog`, `agent_skills_index`, `mcp_server_card`, `webmcp` all **true**; `content_signal` `{ai_train:false, search:false, ai_input:false}`.

---

## 2. Global chrome

Screenshots: `shots/component-header.png`, `shots/header-product-switcher-open.png`, `shots/mobile-nav-flyout.png`, `shots/mobile-sidebar-open.png`, `shots/search-modal-empty.png`, `shots/search-modal-results.png`, `shots/component-ai-dropdown-open.png`, `shots/404-desktop.png`.

### Header
- **Solid purple bar** (`#612854`, `theme=solid`, `header.style=solid`, compact layout, not sticky). Logo: SVG wordmark "Developers on Sefaria" (`files.readme.io/97150ac8…-Frame_2609333.svg`), links to `/`.
- **Primary nav** ("links" subheader style, button look, active tab gets a lighter pill): Home `/`, Docs `/docs`, API Reference `/reference`, GitHub (Sefaria-Project repo, new tab), Donate (`https://donate.sefaria.org/give/451346/#!/donation/checkout?c_src=HeaderDev`, new tab), Get in Touch (`/page/contact-us`, custom-page link).
- On mobile, `topnav.bottom` also includes Sefaria Library and Voices on Sefaria (hidden/duplicated in the desktop DOM).
- **Product switcher ("module switcher")** at far right: ReadMe's "Open links menu" (`more-vertical`) icon is replaced by custom CSS with a 3x3 dot grid. Opens a dropdown with a Sefaria logo banner (`sefaria.org/static/img/logo.svg` injected via `::before`) and colored-dot items: Sefaria Library (navy) → `sefaria.org`, Voices at Sefaria (green) → `voices.sefaria.org`, Developers (purple) → `developers.sefaria.org`, More from Sefaria › → `sefaria.org/products`. This is ReadMe's `topnav.right` restyled; it mirrors the shared Sefaria product header used across sefaria.org sites.
- "Jump to Content" skip link.
- **Search box** in the header (placeholder "Search", shortcut chip `CTRL-K` / `⌘K`).

### Search (Cmd/Ctrl-K)
- Modal (`rm-SearchModal_classic`) with tabs **All / Docs / API Reference / Pages** and live counts (e.g. "Ref" → Docs 36, API Reference 43, Pages 0). Results show method badges (GET/POST) for endpoints, path or matched "Response Body • 200" snippet, highlighted matches, pagination "Back · 1 of 6 · Next" (15 per page).
- Index covers guide body text, reference endpoints (title, path, param/response descriptions), reference "welcome" tutorials, and custom pages. Backed by ReadMe's own search API (`/sefaria/api-next/v2/search`), not client-side Algolia (`appId` empty; index name `readme_search_v2`).
- Empty state: "Start typing to search…".

### "Ask AI"
- **Off.** `ai_options.ask_ai=disabled`, `owlbot.enabled=false`. There is no Ask AI button in the header or search. (The scroll container is still ReadMe's `ContentWithOwlbot-content`.)

### Page-level AI actions (`rm-AIDropdown`, top of right rail on every doc/reference page)
Split button: **Copy Page** (copies the page markdown) + chevron menu:
- Open in ChatGPT → `https://chat.openai.com/?q=Hi ChatGPT! Can you please read [this page](https://developers.sefaria.org/docs/<slug>.md) and prepare to answer questions about it?`
- Open in Claude → `https://claude.ai/new?q=Hi Claude! Can you please read [this page](…/<slug>.md) and prepare to answer questions about it?`
- **MCP** group: Connect to Cursor, Connect to VS Code, Copy MCP Config, Copy MCP Command (all target `https://developers.sefaria.org/mcp`)
- View as Markdown (→ `/docs/<slug>.md`)
- Config also has `copilot: enabled`, but no Copilot item was rendered. `print_button: disabled`.
- Visual bug: the custom CSS rule `.Menu-Item_link:nth-of-type(n)::before` meant for the product switcher's colored dots is unscoped, so the first three AI-menu items also get navy/green/purple dots.

### Theme / dark mode
- **No toggle and no dark mode.** `colorScheme: light`; the inline boot script hard-codes `scheme='light'` and `data-color-mode="light"` regardless of `prefers-color-scheme`. Dark-scheme screenshots (`*-dark*.png`) are identical to light ones. (`header.colorSchemeToggle: "dropdown"` is configured but has no effect while the scheme is forced to light.)

### Footer
- **None on docs/reference/custom pages.** The only footer is part of the homepage's custom HTML (see §3): purple "Stay in the loop with the Sefaria Developer Newsletter" band with a "Sign Up →" button (`https://sefaria.activehosted.com/f/46`, ActiveCampaign, new tab) and a white "Developers on Sefaria" logo.

### 404 page
- HTTP 404, ReadMe default: header + "Page Not Found" + "Maybe you were looking for one of these:" with 3 suggestions from `/sefaria/api-next/v2/search/not_found_suggestions` (`notFoundSuggestions.suggested_links=true`, no logo, no custom 404 body). `shots/404-desktop.png`.

### Favicon / branding / meta
- `/favicon.ico` (32x32), apple-touch-icon, 192/512 PNGs, manifest. OG/Twitter image generated by `cdn.readme.io/og-image/create?type=home&title=…&color=%23612854`. `<title>` = page title (homepage = "Sefaria"); meta description = page excerpt.

### Fonts
- Docs chrome and body: ReadMe system stack, `"Twemoji Country Flags", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, …` (18px body, 31px H1, 22.5px H2, sidebar 14px). Code: `"SF Mono", SFMono-Regular, ui-monospace, "DejaVu Sans Mono", Menlo, Consolas, monospace` 13.5px.
- Configured typography "Open Sans" (headline+body) is **not** actually applied/loaded.
- Homepage custom HTML loads Google Fonts **Inter** (all weights/italics) and **Noto Sans** (variable); custom CSS uses `Inter,sans-serif` and `'Source Code Pro','Courier New',monospace` for the typing animation.
- Icon fonts: Font Awesome 7 Pro / 6 Pro, `ReadMe-Icons`.

### CSS custom properties
- Project-level `:root` (from custom CSS): `--project-color-primary:#612854`, `--project-color-inverse:#fff`, `--recipe-button-color:#666` (+hover/active/focus/disabled), and landing vars `--primary:#612854`, `--text-primary:#2d3748`, `--text-secondary:#718096`, `--project-blurb:#666666`, `--background-color:#fbfbfa`, `--indicator-off/-hover/-on`, `--card-radius:20px`, `--transition`, `--min-display-width:390px`, `--nav-link-hover:#999999`. Full: `root-css-vars.json`.
- ReadMe design tokens (502 non-FontAwesome vars) in `root-css-vars-computed.json`: e.g. `--color-text-default:#32343a`, `--color-text-muted:#484c58`, `--color-text-minimum:#666b79`, `--color-border-default:rgba(0,0,0,.1)`, `--color-bg-page-sunken:#f9fafb`, `--hub-sidebar-width:288px`, `--hub-main-max-width:800px`, `--hub-content-max-width:1280px`, `--font-size-*`, `--color-bg-callout-muted`, `--ReadmeSyntax-*` (syntax highlight palette).
- Brand: primary `#612854`, link color `#666`, TOC variant `line`, border radius default.

### Analytics and third-party domains (observed requests + config)
- Sefaria-owned: Google Analytics 4 `G-6SXQFSB219` via `www.googletagmanager.com` (inline gtag).
- ReadMe platform: `cdn.readme.io` (JS/CSS chunks, og-image), `files.readme.io` (logos, images), ReadMe pageview metrics `POST /sefaria/api-next/v2/versions/1.0/metrics-proxy/create/pageview`, Cloudflare (`/cdn-cgi/challenge-platform` bot JS; site is served by Cloudflare → Render origin, `cf-cache-status`, `s-maxage=1800`).
- ReadMe SSR config also lists vendor keys for Amplitude (session replay 10%), FullStory, Sentry, HubSpot, Wootric, Novu, TipTap Cloud — these are ReadMe's own (mostly dashboard-side) integrations; in the public page session only the domains above were requested.
- Content embeds: `fonts.googleapis.com` / `fonts.gstatic.com` (homepage), `cdn.embedly.com` (YouTube embed), `sefaria.formstack.com` (iframe on contact page), `www.sefaria.org/static/img/logo.svg` (switcher banner).
- No Segment, Intercom, Zendesk, Heap, Koala, Typekit configured.

---

## 3. Homepage (`/`)

Built entirely as **one ReadMe landing "html" block** (`landing-custom.html`, ~15 KB) plus ~31 KB of global custom CSS (`custom-css.css`, which contains all `.hero-*`, `.carousel-*`, `.developer-tool*`, `.footer-*` rules, keyframes and breakpoints). No custom JavaScript (`javascript` fields empty; carousel is pure CSS radio buttons). An in-block `<style>` (credited "FROM CLAUDE" in a comment) zeroes ReadMe's landing gaps/margins to make the HTML full-bleed.

Screenshots: `shots/home-desktop-light-fold.png`, `shots/home-desktop-full.png`, `shots/home-mobile-light-fold.png`, `shots/home-mobile-full.png` (in the `*-full.png` captures the animated hero text is not visible because the scroll container had to be unlocked; use the `fold` shots for the hero). Dark variants are identical.

1. **Header** (global, Home tab active).
2. **Hero** (full-width purple `#612854`): a monospace **typing animation** of `Ref("Shabbat 4b").all_segment_refs()` with blinking cursor (`@keyframes typing`, `cursor-blink`, `cursorMove`, `codeAppear`, `contentAppear`), then H1 "Expand Digital Torah" and subtitle "Leverage the largest open-source database of Jewish texts in history to build apps and services for the People of the Book." Background: animated-looking multicolor **wavy lines** SVG along the bottom (`wavy_lines_mobile1.svg` + `image_1.png`).
3. **Featured Projects carousel** (off-white `#fbfbfa` band): CSS-only 3-slide carousel (hidden radio inputs + `<label>` cards, next-arrow inside each card, 3 dot indicators). Cards (white, 20px radius, title / blurb / CTA → / phone-mockup image):
   - Yamim Noraim Machzor → Google Play ("Download the App Now")
   - Koveah.org → koveah.org ("Sign Up Now")
   - Hadran.com → hadran.org.il ("Learn Today's Daf")
   - Button **"All Sefaria-Powered Projects"** → `https://powered-by.sefaria.org`.
4. **Developer tools grid** (2 rows x 3 on desktop, stacked on mobile; each tile = colored square icon + title + blurb, whole tile is a link):
   - Download Sefaria Data (`#802F3E`) → github.com/Sefaria/Sefaria-Export
   - AI & ML Assets (`#00827F`) → huggingface.co/Sefaria
   - Tutorial: Build a Data Visualization (`#4B71B7`) → `/reference/data-visualization`
   - API Reference (`#18345D`) → `/reference/getting-started`
   - AI at Sefaria (`#CCB479`) → `https://www.sefaria.org.il/ai`
   - Documentation (`#CB6158`) → `/docs/welcome`
5. **Newsletter footer** (purple): "**Stay in the loop** with the Sefaria Developer Newsletter" / "Get quarterly tech updates + behind-the-scenes content from Sefaria's own team of developers." / white "Sign Up →" → ActiveCampaign form 46 / white Developers logo.

Responsive breakpoints in custom CSS: 737, 796, 1070/1071, 1279/1280, 1399, 1440, 1599/1600 px. `--min-display-width: 390px`.

Also note `stylesheet_hub2_legacy.css` (45 KB) is an older un-minified copy of the same landing CSS kept in the `stylesheet_hub2` field; the live CSS is `custom-css.css`.

---

## 4. Docs pages

Reference screenshots: `shots/docs-page-anatomy-linker-v3.png` (viewport), `shots/docs-page-anatomy-linker-v3-full.png`, `shots/docs-mcp-desktop-full.png`, `shots/docs-welcome-{desktop,mobile}-light.png`, `shots/pages/_docs_<slug>.png` for every page.

### Layout (desktop 1440)
Three columns under the header: **left sidebar** (288px, own scroll), **article** (max ~800px), **right rail** (AI dropdown + TOC). No breadcrumbs (`showBreadcrumbs=false`), no page icons, no version picker.

- **Page header** (`rm-PageHeader`): H1 title + large grey excerpt (from front-matter description), then a hairline divider.
- **Sidebar** (`rm-Sidebar_guides`): uppercase category headings (TECHNICAL DOCS, LOCAL INSTALLATION, DEV DIGEST ARCHIVE, SEFARIA RESEARCH, ABOUT SEFARIA); nested items up to 3 levels with chevron toggles ("Show subpages for …"); active item has grey pill background; external link items show a ↗ icon; deprecated item shows an info-circle icon; "Hide sidebar navigation" collapse button at the bottom. `shots/component-sidebar.png`.
- **Right rail**: `Copy Page | ▾` split button (see §2), then **TOC** (`tocVariant=line`: vertical line with purple active-section indicator, H2 + indented H3 entries; scroll-spy). `shots/component-toc.png`, `shots/component-ai-dropdown-button.png`.
- **Headings** have hover anchor-link icons (`heading-anchor`). `shots/component-heading-anchor.png`.
- **Footer of article**: "🕓 Updated N days/months ago" (relative; `showExactDate=false`), prev/next **pagination** cards (← previous title / next title →) where present (`shots/component-pagination.png`), then the centered **feedback widget** "Did this page help you? 👍 Yes 👎 No" (`metrics.thumbsEnabled=true`; on click ReadMe asks for an optional comment — not clicked). `shots/component-feedback-thumbs.png`.
- **No** edit-this-page / suggest-edits link (`suggested_edits` disabled), no print button, no "What's next" blocks, no comments.
- **Mobile (390)**: header collapses to logo + hamburger ("Toggle navigation menu" flyout with all nav links + logo) + search icon + switcher; sidebar becomes a collapsible "current page title ⌃⌄" selector button below the header; TOC hidden; AI dropdown stays above content. `shots/mobile-nav-flyout.png`, `shots/mobile-sidebar-open.png`, `shots/docs-welcome-mobile-light.png`.
- Custom page (`/page/contact-us`) uses the same chrome with no sidebar, no TOC, no AI dropdown; still shows the feedback widget.

### Markdown components found (rendered)

| Component | Where | Screenshot |
|---|---|---|
| Callout, warn (❗/⚠️ emoji icons, `icon_font: emojis`) | welcome, cli, docker-compose, local-installation, reference/getting-started | `shots/component-callout-warn.png` |
| Callout, error (red) | the-sefaria-mcp ("Second-Party Requirements"), local-installation | `shots/component-callout-error.png` |
| Code block (single, with copy button, syntax highlight) | 37 pages | `shots/component-code-block.png` |
| Code tabs (`CodeTabs`, language-labelled tabs: JSON, Python, JavaScript, cURL, Bash, OPML, "Text") | 14 pages | `shots/component-codetabs.png`, `shots/component-codetabs-multi-lang.png` (linker-api: JavaScript/cURL), `shots/component-codetabs-json.png` |
| Table (`rdmd-table`, from `<Table>` and GFM) | 13 pages | `shots/component-table.png` |
| Image with lightbox (click to zoom) | 20 pages | `shots/component-image-lightbox.png`, `shots/component-image-lightbox-open.png` |
| Framed/centered image (`img-frame`) | the-disambiguator | `shots/component-image-frame.png` |
| Embed (YouTube via Embedly iframe) | sefaria-research-at-pyconn-2024 | `shots/component-embed-youtube.png` |
| HTMLBlock (raw HTML/CSS) | powered-by-sefaria (purple "Community showcase — See what people have built with Sefaria / Explore the projects ↗" CTA → powered-by.sefaria.org); Hebrew citation guide (RTL HTML) | `shots/component-htmlblock-powered-by.png`, `shots/component-htmlblock-hebrew-rtl.png` |
| Inline HTML in markdown (`<div>`, `<br/>`, `<iframe>`) | contact-us, dev digests | `shots/contact-us-desktop-full.png` |

**Not used anywhere** (checked rendered DOM and all `.md` sources): Tabs (non-code), Accordion, Cards/Columns, Mermaid, Recipes, Glossary tooltips (one placeholder glossary term "parliament" exists in config, unused), Variables, reusable content, Tutorial tiles.

`.md` source conventions to preserve on migration: YAML front matter (`updatedAt`, `agentTools`), `<Callout icon="❗️" theme="error">`, `<Image align="center" src=… />`, `<Table align=[…]>`, `<Embed url=… />`, `<HTMLBlock>{\`…\`}</HTMLBlock>`, fenced code groups (consecutive fences become CodeTabs).

---

## 5. Forms and outbound signups (not submitted)

All forms are **third-party, linked or iframed**; there are no native `<form>` elements on any page.

| Form | Vendor | Where it appears | Endpoint |
|---|---|---|---|
| Developer contact | **Formstack** iframe (`<iframe src="https://sefaria.formstack.com/forms/developer_contact" height="1000" frameborder="0" style="background:yellowwww;width:100%">`) | `/page/contact-us` (header "Get in Touch") | Formstack-hosted, posts to Formstack |
| Powered-by-Sefaria project submission | **Formstack** link `https://sefaria.formstack.com/forms/powered_by_sefaria_submission_form` | contact-us intro ("click here"), 4 Dev Digest issues | Formstack |
| Developer Discord community signup | **Formstack** link `https://sefaria.formstack.com/forms/sefaria_developer_discord_community` ("Join us inside!") | `/docs/the-sefaria-developer-community-archive` | Formstack (then Discord server id `1240573950182817792`, also linked directly in one digest) |
| Developer newsletter | **ActiveCampaign** hosted form `https://sefaria.activehosted.com/f/46` | homepage footer "Sign Up", dev-digest pages (10 links) | ActiveCampaign; digest links also go through `newsletter.sefaria.org/lt.php?...` click-tracking |
| General inquiries | `mailto`-style text: "please email hello@sefaria.org" | contact-us | — |

Contact page copy: "Use this form to contact Sefaria's engineering team with engineering-related questions, inquiries or clarifications. **If you have a general question about Sefaria.org, please email hello@sefaria.org instead.** If you want your project to be featured on our Powered-By-Sefaria page, click here. Thanks!" followed by `<hr>` and the iframe.

Field lists for the Formstack and ActiveCampaign forms could **not** be captured: both hosts (and `sefaria.formstack.com` via WebFetch) are blocked by this sandbox's network policy, so the iframe rendered blank. To finish this, allow `sefaria.formstack.com` and `sefaria.activehosted.com` and run a GET-only DOM read of the three Formstack forms + AC form 46.

**powered-by.sefaria.org**: separate site, 200, `<title>Powered by Sefaria: projects built on the open Jewish library</title>`. Linked from the homepage carousel button, the `/docs/powered-by-sefaria` HTMLBlock CTA, and the Project Acceptance Criteria flow. The docs page `/docs/powered-by-sefaria` is now essentially just that CTA (the project gallery moved off-site).

---

## 6. Redirects and legacy URLs

| Request | Status | Location |
|---|---|---|
| `/docs` | 301 | `/docs/welcome` |
| `/docs/` | 301 | `/docs` |
| `/docs/welcome/` | 301 | `/docs/welcome` |
| `/docs/getting-started` | 301 | `/docs/welcome` |
| `/reference` | 301 | `/reference/getting-started` |
| `/v1.0` | 302 | `/` |
| `/v1.0/docs/welcome` | 302 | `/docs/welcome` (versioned-URL fallback) |
| `/page/contact-us/` | 200 | (trailing slash served directly) |
| `/docs.md` | 302 | `/docs/llms.txt` |
| `/login` | 302 | `https://dash.readme.com/to/sefaria` |
| `/logout` | 302 | `/` |
| `/suggested-edits/` | 302 | `/login?redirect=%2Fsuggested-edits%2F` |
| `/DOCS/WELCOME` | 404 | (case-sensitive) |
| `/docs/api`, `/docs/get-text`, `/docs/text-api`, `/docs/sefaria-mcp`, `/docs/the-sefaria-mcps`, `/docs/linker-v1` | 404 | |
| `/page/contact`, `/contact-us`, `/home`, `/index.html`, `/mcp/` | 404 | |
| `/changelog`, `/recipes`, `/discuss`, `/openapi.json`, `/llms-full.txt`, `/docs/welcome.json` | 404 | |

The project's custom redirect table is empty (`redirects: []`, `git.renamedSlugs: []`); all redirects above are ReadMe platform behavior. Note `/docs/the-sefaria-mcp` is the canonical slug although the page title is "The Sefaria MCPs".
