# Plan: rebuild developers.sefaria.org inside Sefaria-Project

You are planning a project. You are not implementing it. Your plan will go to an implementing agent (Claude Opus in Claude Code), which will execute it on auto mode with sub-agents. Your job is to turn the research and decisions below into an execution plan that can't be misread.

**Do not re-open the decisions in this brief.** If a decision blocks the plan or is technically unsound, say so in a short "Blockers" section at the top and suggest the smallest change that fixes it. Otherwise, plan around it.

---

## 1. Goal

developers.sefaria.org is hosted on ReadMe.io (about $300/month). We are rebuilding it inside the main Sefaria-Project repo (Django + MongoDB + Postgres + React) and retiring ReadMe.

The site has six parts:

- a homepage
- Markdown docs and guides
- an interactive OpenAPI reference with "Try It"
- AI/agent features: `.md` versions of every page, `llms.txt`, a docs MCP server
- third-party forms
- the Powered by Sefaria project gallery, currently a separate app

**Target:** a working cauldron (Sefaria's per-branch staging environment, `*.cauldron.sefaria.org`) as early as possible. That leaves about 6 weeks for review before the decision to cut over by the **end of Q4 2026**.

**Delivery:** one PR on branch `feature/sc-48158/rebuild-self-hosted-readme-for-developer` (Shortcut story sc-48158), with clean commits per phase.

---

## 2. Rules that apply everywhere

1. **The live site wins.** When docs, design files, prototypes or this brief disagree with live developers.sefaria.org, copy live. There are two deliberate exceptions, listed in §4.
2. **The header redesign is out of scope.** Copy the live portal header exactly (purple bar, logo, nav, search field, 9-dot product switcher), but build it as one self-contained component so it can be swapped later.
3. **The API reference must match live, pixel for pixel and behavior for behavior.** The plan must include **looping agents that check pixel parity**: automated visual diffs against live screenshots that keep running until they pass.
4. **Try It and every other live call must be free of security holes.** This is critical; see §5.
5. **Follow the Sefaria design system** (claude.ai artifact `https://claude.ai/artifact/YHFAd6iicPGAUPcyEosR77`; a copy is in `docs/dev-portal/research/design/design-system/`) for anything new that live doesn't have.
6. **Code wins over docs.** The repo has agent docs in `AGENTS.md` and `docs/agent_docs/`. Follow its conventions:
   - Ruff for Python; ESLint, Prettier and Stylelint for JS/CSS.
   - Celery for slow work.
   - Never write text versions directly.
   - Update `docs/agent_docs/` for the new app, but don't bump `agent_docs/.stamp`.

---

## 3. Architecture (decided)

- **Hosting.** Django serves developers.sefaria.org as a **third django-hosts host**, alongside library and voices (`sefaria/hosts.py`, `settings.DOMAIN_MODULES`, `sefaria/constants/model.py`, middleware setting `request.active_module`). If the DevOps cost of this turns out to be very high, flag it as a blocker.
  - **Trap:** many places in the existing code are written as `library ? A : B` (e.g. `Header.jsx`). A third module silently falls into the Voices branch. The plan must audit every place the module is checked.
- **Frontend: option A + A1.**
  - The portal is a **separate Vite + React 19 + TypeScript bundle inside Sefaria-Project**, built in the existing Docker image and served by Django templates.
  - The main site stays on React 16 + webpack 5 + Babel (`node/webpack.*.js`) and must not be touched or upgraded.
  - **A1:** Django renders each page's content as real HTML on the server, so search engines and the `.md` versions see real content (docs Markdown → HTML; endpoint title, description and parameters from the spec). React then enhances the page with Try It, search, the sidebar, the editor and so on.
  - Plan how the two renderings stay identical: Python Markdown rendering vs. the React renderer. Shared test fixtures are one option.
- **Content storage.** Postgres, through Django models, with full revision history. **The `Sefaria/developer-docs` Git repo is retired**; no export back to Git is needed. The source of truth for the spec stays `docs/openAPI.json` in Git.
- **Editors.** Any Sefaria staff member (`is_staff`) can edit and publish. There is no review step. The editor offers "save draft" and "publish".
- **Images.** Store them in the existing Google Cloud Storage media bucket under a `developers/` prefix. Migrate the 39 images that are currently hot-linked from `files.readme.io` **before** ReadMe is cancelled.

---

## 4. Feature requirements

### 4.1 Homepage

Copy the live homepage. It is one custom HTML block with about 31 KB of CSS and no JS:

- a typing animation of `Ref("Shabbat 4b").all_segment_refs()` over wavy lines, with "Expand Digital Torah" and a subtitle
- a CSS-only carousel of 3 featured projects (Machzor app, Koveah, Hadran), with a button to the gallery
- six tool tiles
- a newsletter band that links to ActiveCampaign form 46
- a Sefaria footer

Notes:

- Use the designer's vector assets in `docs/dev-portal/research/design/`: the white "Developers on Sefaria" logo SVG and the wavy-lines SVGs for desktop (1440×130) and mobile (737×100). The design PNGs there contain placeholder copy, so take all copy from live.
- **Live mobile bug to fix:** about 300px of empty purple above the hero title. Use the hero spacing from the mobile design file instead.
- Make the carousel cards and tool tiles editable in the admin.

### 4.2 Docs (migrated from `Sefaria/developer-docs`)

Migrate **everything**, including hidden pages, test pages and the unfinished news page. Keep their hidden, deprecated and link-only flags.

Inventory:

- 151 Markdown files:
  - docs: 65 pages in 5 sidebar categories
  - reference section: 7 hand-written pages, plus 73 endpoint and tag stub files with empty bodies
  - 4 custom pages, including `contact-us.html`
- Page order comes from the `_order.yaml` files. A folder with `index.md` is a parent page. Pages nest up to 4 levels.
- Two slugs are Hebrew, and folder names contain spaces.

Frontmatter fields:

- `title`, `excerpt`, `hidden`, `deprecated`
- `metadata{title,description,robots}`
- `next{description,pages[]}`
- `link{url,new_tab}`
- `api{file,operationId}`
- `api_config`, `fullscreen`

Components to support (renderer **and** editor):

- `<Callout icon theme>`, and blockquote emoji callouts
- `<Image align width caption border framed>` and Markdown images
- `<Table align>` and pipe (GFM) tables
- `<Embed>` (YouTube)
- `<HTMLBlock>` with inline `<style>`, including a full RTL Hebrew page
- raw HTML (`<br>` in 34 files)
- code fences with ReadMe tab titles (e.g. ` ```javascript React `)
- emoji shortcodes
- Hebrew/RTL text (29 files)

Not used, so skip: tabs, accordions, cards, glossary, variables, mermaid.

Rewrite every internal link:

- 35 `(doc:slug)`, 56 `(ref:…)`, 6 `(page:…)`, and 86 absolute developers.sefaria.org URLs
- slugs are unique only per namespace (docs, reference, custom pages)
- **fix the known broken targets:** `doc:each-book-is-an-index`, `doc:default-nodes`, `doc:the-schema-of-a-complex-text`, `doc:terms-for-internal-use`, `ref:get_api-shape-title`, `ref:get_api-v3-texts-tref-1`, and the malformed `<doc: shape-api>`

Page layout:

- title and subtitle, a right-hand table of contents, "Updated N ago", prev/next links
- "Did this page help you?" Yes/No with an optional comment, stored in Postgres and viewable in admin

### 4.3 API reference (pixel parity)

**Source:** `docs/openAPI.json`. It is OpenAPI 3.0.2 with 61 operations (59 GET, 2 POST: `/api/find-refs` and `/api/search-wrapper`), 11 tags, no security schemes and no `x-readme` extensions.

**Rules:**

- **Title** = the operation's `summary`, falling back to the path-level `summary`. **Description** = the operation's `description` only (checked on all 61).
- There are no tag landing pages. `/reference/<tag>` redirects to the tag's first endpoint, and `/reference` redirects to `/reference/getting-started`.
- Sidebar order comes from the migrated `_order.yaml` data. That order splits the Index tag into two groups, `index` and `index-1`; keep the split.
- Texts (v1) and Topic (v1) are shown as deprecated.

**Editor overlay.** Editors can change each endpoint's sidebar name and position, title and description, and add free Markdown next to the spec-generated content. These edits are stored in an overlay keyed by `operationId` and are **never written back** to `openAPI.json`. The `.md` versions, `llms.txt`, search and the MCP all read the overlay. Everything else on an endpoint page comes from the spec and is read-only. There are no custom code samples and no custom response examples.

**Measured layout:**

- The sidebar is 288px and stays fixed while scrolling. Groups collapse, with only the current one open. The whole sidebar can be collapsed, and that choice is remembered in the browser (localStorage).
- The centre column has 32px padding and a max width of 800px.
- The Try It panel is 480px wide.
- Breakpoints:
  - 1066–1299px: the centre column shrinks, down to a minimum of 292px
  - 1065px and below: the Try It panel moves below the article
  - 768px and below: mobile layout, with a 103px header, a hamburger menu and a sidebar dropdown
- Colours: primary `#612854` (keep it, per the live-wins rule); links `#666`, hover `#333`.
  - Method badges: GET `#008756`, POST `#0222c6`, PUT `#6d5ba6`, PATCH `#df7d03`, DELETE `#cb4452`.
  - Code samples use the CodeMirror material-palenight theme.
- **Deliberate deviation:** the font is the design system's **Roboto** (with Heebo for Hebrew), not live's system font stack. Pixel checks compare against baselines that account for the font change.

**Parameters:**

- Inputs use the first example as the placeholder and are prefilled with the `default`.
- Enums get a select plus clickable "Allowed:" chips. Clicking a chip copies the value.
- Labels show "Defaults to X", "required" and "enum".
- Object bodies expand with "+".
- Each parameter has an anchor such as `#query-params-<name>`.

**Responses:**

- The first example ("200 – Esther 1.1") is shown on load.
- The response schema accordion starts collapsed and has "child attributes" expanders.
- The heading reads "Response" for one status code and "Responses" for more.

**Code samples:**

- Use `@readme/httpsnippet`, which is open source.
- Shell is the default; Node, Ruby, PHP and Python are also shown.
- The Node libraries are Axios, fetch and http. **fetch replaces ReadMe's "api" SDK as the default.**
- The "More Languages" menu lists: Agent Prompt, C, C#, C++, Clojure, Crystal, Go, HTTP, Java, JavaScript, JSON, Kotlin, Objective-C, OCaml, PowerShell, R, Rust, Swift.

**Try It.** The browser calls `https://www.sefaria.org` **directly**. Our API already returns `Access-Control-Allow-Origin: *` and answers the POST preflight. There is no proxy.

- After a call, the response panel shows: a coloured status dot, a status dropdown (examples and "Clear Response"), a "Headers" modal showing request and response headers, a copy button, and the JSON with line numbers. There is no timing display.
- "Recent Requests" is stored per browser.

**Keep from live:**

- prev/next links and "Updated N ago"
- the feedback widget
- Cmd-/ to focus the sidebar filter

**Fix two invisible bugs from live:**

- each response accordion is wrapped in an `<h1>`
- an unscoped CSS rule puts coloured dots on the first three items of the Copy Page menu

### 4.4 Search

Search runs entirely in the browser over docs, reference (including overlay edits) and custom pages, using something like MiniSearch. The index is rebuilt whenever content is published.

- Opens with Cmd/Ctrl-K, as a popup with tabs: All, Docs, API Reference, Pages.
- Shows result counts and GET/POST badges, with 15 results per page and keyboard navigation.
- Estimated at about 2–3 days. No Elasticsearch.
- There is **no "Ask AI"**.

### 4.5 AI and agent surface (must match live)

- **Copy Page menu on every page:**
  - Copy Markdown
  - View as Markdown
  - Open in ChatGPT
  - Open in Claude
  - Connect to Cursor
  - Connect to VS Code
  - Copy MCP Config
  - Copy MCP Command
- **`.md` versions:**
  - Every page is also available as `<path>.md`.
  - Requests sent with `Accept: text/markdown` also get Markdown.
  - An endpoint's `.md` includes that endpoint's slice of the spec.
- **`llms.txt`:** one for the whole site and one per section. Add `llms-full.txt`, which is a 404 today. Our own `static/llms.txt` links to these slugs, so they must keep working.
- **Other machine-readable files:**
  - `Link` headers on every page, pointing to `/.well-known/api-catalog`, `/.well-known/agent-skills/index.json` (one skill, `read-the-docs`), `/.well-known/mcp/server-card.json`, and the page's `.md` version
  - a hidden "For AI agents" banner on each page
  - the spec, downloadable at `/openapi/sefaria-api.json`
- **Docs MCP server: rebuild it here** (decided as the easiest option; the team will give guidance later). Serve it at `developers.sefaria.org/mcp` (streamable HTTP, no auth) and keep the server card at `/.well-known/mcp/server-card.json`. Copy the live tool surface from `research/site/machine/mcp-tools-list.json`. It has four tools:
  - `list-endpoints` (read-only)
  - `get-endpoint` (`path`, `method`; read-only)
  - `search-endpoints` (`pattern`; read-only)
  - `execute-request`, which takes a HAR request object and **can call any URL** (`destructiveHint: true`). **Do not copy it as-is: run server-side, it is an SSRF hole.** Lock it to `https://www.sefaria.org` and the methods and paths in the spec, send no cookies or credentials, cap timeouts and response size, and rate-limit it.

  Its tools read the spec and the editor overlay. Build it as a small, self-contained module with tests, and write a maintenance note: who owns it, how it follows MCP spec updates, and how it stays in sync with `openAPI.json`. ReadMe maintains it for us today.

- There is a second MCP at `chat.sefaria.org/mcp/`, which the docs link to. Leave it alone.

### 4.6 Admin editor (match ReadMe's editor; screenshots described in the atlas)

Include at launch:

- a page tree per section (Docs, API Reference, Custom Pages), with nesting, drag to reorder, "+ New", and "+ add child" on each row
- a View/Edit toggle, with WYSIWYG editing in place that renders exactly like the live page
- a "/" slash menu for inserting blocks, covering every component in §4.2
- a page settings panel: page type, visibility (public or hidden), subtitle, SEO metadata, next pages, link URL
- endpoint pages with the overlay fields from §4.3
- revision history with restore
- Save draft and Publish
- image upload to GCS

**Deferred:** Edit with AI, the AI linter, comments, branches and versions, reusable content, glossary.

Pick an editor library (e.g. TipTap or Lexical) that can round-trip the ReadMe component syntax **without loss**. Prove the round trip with a test over all 151 migrated files.

### 4.7 Forms and Discord

- **Keep the Formstack forms:**
  - contact: an iframe of `sefaria.formstack.com/forms/developer_contact` on `/page/contact-us`
  - project submission: `powered_by_sefaria_submission_form`, which posts by webhook to `/api/powered-by`, HMAC-signed with `POWERED_BY_FORMSTACK_HMAC_SECRET`
  - Discord signup: `sefaria_developer_discord_community`
- **Keep the ActiveCampaign newsletter** (form 46) for now.
- **New: "Join the Discord" buttons in 6 places, linking to the Formstack Discord signup form:**
  1. homepage hero (secondary button)
  2. homepage community band (primary button)
  3. one footer slot in the sidebar shared by docs and reference
  4. end of each docs page, next to the feedback widget
  5. the reference request panel ("Questions about this endpoint?")
  6. the contact page
- The buttons are text only (no Discord logo; it isn't in the design system's Lucide icon set).
- Styling: per the design system, use `action-primary` navy `#18345d` with `text-inverse`, Roboto labels (`en-system-body-strong`), and a focus ring of `2px solid var(--functional-focus-blue)` with a 2px offset.
- English and Hebrew strings already exist: `developer.common.discord_signup.url` and `developer.about_you.community.discord.*`.

### 4.8 Powered by Sefaria gallery

Move it from `Sefaria/powered-by` to `developers.sefaria.org/powered-by`.

- Redirect `powered-by.sefaria.org` and `sefaria.org/powered-by` there; the latter currently 301s in `sites/sefaria/urls.py`.
- Keep `/powered-by/charts` unlisted and noindex.
- Keep the layout and features:
  - browse page with search, filters (OR within a facet, AND across facets), known-issues toggle, sort, grid/list view, and all state in the URL
  - project page at `/projects/:id-name`, with canonical-slug redirects and a real 404
- Move it onto the shared tokens.
- The backend already exists: `powered_by/` app, `GET /api/powered-by`. Switch the hardcoded API URL to a same-origin path.
- Bring its Vitest, Playwright and axe tests along.
- React 19.2 features like `useEffectEvent` work because the portal bundle is React 19.
- The Amiri-Taamey-Frank font is in the design system, so its licence is fine.

### 4.9 Analytics

- Keep GA4 property **DevPortal, `G-6SXQFSB219`**.
- **Keep every page's `document.title` exactly as live**, because reports are keyed on page title. The homepage title is "Sefaria"; endpoint titles are the spec summaries.
- Send exactly one `page_view` per client-side navigation.
- Keep the enhanced-measurement events: scroll, click, form_start.
- **Add key events:**
  - Discord button click, with a `placement` parameter
  - Try It run
  - Copy Page / Open in LLM / MCP actions
  - contact form start
- The gallery keeps its own analytics for now. Make the property configurable per section.
- "404 Not Found" is among the most-viewed titles, so log 404 paths so redirects can be added.

### 4.10 Redirects and URLs

Every live URL must keep working at the same path: `/docs/<slug>`, `/reference/<operationId>`, `/page/<slug>`, `.md` variants, `llms.txt`.

Copy ReadMe's built-in redirects:

- `/docs` → `/docs/welcome`
- `/reference` → `/reference/getting-started`
- `/docs/getting-started` → `/docs/welcome`
- `/v1.0/...` → the unversioned path

Update links elsewhere in the repo:

- `sites/sefaria/urls.py` (`/developers`, `/wiki`)
- `Header.jsx` and `StaticPages.jsx`
- the helm `helpURL`
- `powered_by/tests/developer_routes_removed_test.py`

### 4.11 CI

- Add a GitHub Action that runs **Spectral** on any change to `docs/openAPI.json` and blocks merging on failure. `docs/.spectral.yaml` exists but nothing runs it today.
- Retire `.github/workflows/readme-openapi-docs-sync.yml` at cutover, not before.

### 4.12 Tests: very comprehensive, and compatible with the new pipeline (PR #4064)

The product owner wants **very comprehensive Playwright coverage**. Tests are a first-class deliverable in every phase, not a final phase.

Everything must fit the behavior-test pipeline in [Sefaria/Sefaria-Project#4064](https://github.com/Sefaria/Sefaria-Project/pull/4064) (sc-48207), which is about to become the standard. It may not have merged when work starts. If it hasn't, build against its conventions anyway and rebase once it lands. The PR's branch is `chore/sc-48207/deterministic-behaviorial-test-driven`, and its docs are `e2e-tests/CLAUDE.md`, `e2e-tests/feature-specs/README.md` and `e2e-tests/Sanity/README.md` §6a.

**What the pipeline requires:**

- **Every PR gets a sandbox** at `sandbox-<sha>.cauldron.sefaria.org`. CI then runs:
  - product's BDD stories (Gherkin `.feature` files under `e2e-tests/feature-specs/features/<area>/`, run through `playwright-bdd` 9.2.1, pinned). These block the merge.
  - the `@pr` tag set through the `chrome-pr` project. It warns until `E2E_PR_BLOCKING=true`.
- **`.feature` files are locked.** Only people listed in `SPEC_EDITORS` may change them. A CI check (Feature Spec Lock) and a Claude Code hook enforce this. **Agents must never create or edit `.feature` files.** Engineers and agents write only the step definitions (`steps/<area>/*.steps.ts`, importing from `steps/fixtures.ts`, using the `visitor` fixture), page objects and fixtures.
- **The product owner is a spec editor.** The plan must include a step where they write `.feature` stories for the portal's key behaviors: Try It, Copy Page, editing and publishing, search, the gallery, and the Discord buttons. Use the `write-feature-spec` skill and hand off on this branch. Agents then bind the steps that CI stubs out. Plan the work so these specs come early and the agents work red to green.
- **House rules from `e2e-tests/CLAUDE.md`:**
  - page objects extend `HelperBase` and are mounted in `PageManager`
  - every timeout is wrapped in `t()`
  - the first navigation goes through `goToPageWithLang`/`goToPageWithUser`
  - locator priority is `getByRole` > `getByLabel` > `getByText` > `getByTestId` > CSS
  - no `waitForTimeout` for waiting on state
  - adapt to the data instead of `test.skip`
  - intercept destructive requests with `page.route` (editor save/publish, feedback POST, Formstack)
  - pass at full parallelism
- **`@pr` tests must be read-only and on the English domain.** PR sandboxes share the dev database and have no `.org.il` host.

**What the plan must add to the pipeline:**

- **A third host in the test harness:**
  - `MODULE_URLS` gets a developers entry
  - an `E2E_DEVELOPERS_URL` override, alongside `E2E_LIBRARY_URL`/`E2E_VOICES_URL` in `playwright.config.ts`
  - **confirm that PR sandboxes and cauldrons actually serve the developers host** (DNS, ingress, helm). If they don't, the whole CI story fails, so this is a phase-1 item.
- **New Playwright projects for the portal:** desktop Chrome, Firefox and WebKit, plus a mobile project in `playwright.mobileweb.config.ts`.
  - Tag the read-only core journeys `@pr` and `@sanity`: home loads; docs page renders; reference page renders; Try It against a read-only GET; search; `.md` and `llms.txt`; gallery browse and project page; redirects.
- **Feature-area suites that match the existing ones**, with a README and ID scheme per area (e.g. DEV-REF-001…). Cover:
  - every reference interaction in §4.3
  - search, the AI/agent surface and Copy Page
  - the editor end to end (tree, every component, overlay fields, revisions, draft and publish), with writes intercepted or run on a throwaway dataset
  - homepage and Discord placements, including the GA4 events with `placement`
  - every gallery behavior (port the existing Playwright, Vitest and axe tests)
  - forms
  - redirects and the full URL-parity crawl
  - axe accessibility
  - the security checks from §5: no cookies on Try It, a locked server URL, HTML in responses not executed, CSP present
- **A visual-parity suite** in its own project, not `@pr`. It runs `toHaveScreenshot` at 1440, 1280, 1024, 768 and 390 for every page type and every state captured in `REFERENCE_SPEC.md`.
  - **Baselines are captured from live ReadMe now and committed,** because ReadMe goes away at cutover.
  - The planned font change to Roboto is handled with a documented adjustment: re-render the baselines with Roboto injected, or apply per-region thresholds.
  - The implementing agents **loop on this suite until it is green or they escalate**.
- **Unit tests:** Vitest for the portal bundle. pytest for the new Django apps, covering models, the migration script, Markdown → HTML parity, the editor's component round trip over all 151 files, the overlay, `.md` and `llms.txt` generation, and the permissions. The existing Jest and pytest suites stay green.

---

## 5. Security requirements (critical)

**Try It:**

- No server-side proxy, so there is no SSRF surface.
- Requests are sent with `credentials: 'omit'`. developers.sefaria.org and www.sefaria.org are the same site, so without this, staff session cookies would be sent.
- The server URL is locked to `https://www.sefaria.org` and cannot be edited.
- Responses are rendered as text only, never as HTML.

**API keys (upcoming):** all Sefaria API calls will soon require an API key. Design Try It and the code samples to use a **public demo key**: rate-limited, read-only and clearly labelled, which users can replace with their own. List what the backend team must provide.

**Editor content:**

- Content is sanitized on render, with an allow-list for components.
- `HTMLBlock` is staff-only and sandboxed, or rendered in a way that limits stored XSS.
- CSRF protection on every editor API. Staff-only permissions are checked on the server.

**Site-wide:**

- A strict Content Security Policy for the portal.
- A security review pass (e.g. `/security-review`) before the PR is marked ready.

---

## 6. Out of scope / later

**Post-cauldron questions:**

- the newsletter provider (ActiveCampaign vs. the CRM newsletter service)
- the header redesign with the designer: a shared sefaria.org header, Roboto/purple alignment, and the 17 questions in `docs/dev-portal/research/ux/UX_BRIEF.md`
- login, the account menu and API keys inside the portal
- merging the gallery's analytics into DevPortal

**Future improvements:**

- dark mode
- a Hebrew page
- `featured_order` on gallery projects, with the homepage carousel driven by featured projects
- the `/api/async/{task_id}` spec question
- the hidden in-app developer settings (`powered_by/developer*.py`; leave them untouched)

**Note for the team:** the docs MCP is rebuilt here as the easiest option for now. Ask the team for guidance on its long-term home (here vs. `mcp.sefaria.org`) and ownership.

---

## 7. Research in the repo

Everything is committed on the branch under **`docs/dev-portal/`**. Read it before planning. Cite exact files in the plan.

| Path                                   | Contents                                                                                                                                                                                                                                                                                                                                      |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DECISIONS.md`                         | Every product decision, the post-cauldron question list, follow-ups and team notes                                                                                                                                                                                                                                                            |
| `research/reference/REFERENCE_SPEC.md` | **Reference parity spec**: measured layout, breakpoints, colours, every interaction, the Try It flow, and a screenshot index                                                                                                                                                                                                                  |
| `research/reference/data/`             | Computed styles (`computed-get-v3-texts.json`), all CSS variables (live, and from ReadMe's bundles), media queries, method badges, the live sidebar tree, UI strings (`i18n-en.json`), Sefaria's custom CSS on ReadMe (`rm-custom-css.css`), the Try It network log (cookies removed), and the live `.md` for get-v3-texts                    |
| `research/reference/dom-outlines/`     | Readable DOM outlines of the live reference pages                                                                                                                                                                                                                                                                                             |
| `research/site/SITE_ATLAS.md`          | Site atlas: URL inventory, global chrome, homepage, docs components, forms, redirects                                                                                                                                                                                                                                                         |
| `research/site/` (other files)         | `pages.json` (every page), `landing-custom.html` + `custom-css.css` (the **live homepage source**), computed root CSS variables                                                                                                                                                                                                               |
| `research/site/live-markdown/`         | The live `.md` output of every docs page, which is the expected output for our `.md` versions                                                                                                                                                                                                                                                 |
| `research/site/machine/`               | `llms.txt` (site, docs and reference), sitemap, robots, the `.well-known` files, the MCP server card, the **MCP `tools/list` response**, and the agent skill                                                                                                                                                                                  |
| `research/ux/UX_BRIEF.md`              | How the main-site header and modules work, entry points, and the design questions for post-launch                                                                                                                                                                                                                                             |
| `research/design/`                     | Homepage designs (desktop and mobile), the logo and wavy-line SVGs, and design-system tokens (`tokens.css`, README)                                                                                                                                                                                                                           |
| `research/screenshots/`                | About 200 screenshots: `reference/` (55 states and breakpoints), `site/` (components, home, docs, contact, mobile nav), `site-pages/` (every docs page at 1440), `ux/` (sefaria.org, Voices, portal and gallery headers). JPEG at 1× CSS pixels. These are for reference only; the visual-parity baselines must be recaptured at full quality |
| `research/notes/`                      | Working notes: content audit, editor screenshots, reference crawl, GA4, design system, Discord, UX                                                                                                                                                                                                                                            |

The content to migrate is in **`github.com/Sefaria/developer-docs`** (public; clone it). The gallery is in **`github.com/Sefaria/powered-by`** (public; clone it). The full atlas, with open-question history, is published at `https://claude.ai/artifact/5N4HSLV9j3pKGu6979xccM`.

These hosts are reachable from the implementer's environment: developers.sefaria.org, `cdn.readme.io`, `files.readme.io`, `try.readme.io`, and sefaria.org over GET. `sefaria.formstack.com` and `sefaria.activehosted.com` are not.

---

## 8. What your plan must contain

1. **Blockers.** Only if any; see the top of this brief.
2. **Architecture.** Files and dirs to create or modify, the Django apps and models (docs pages, revisions, endpoint overlay, feedback, homepage blocks), URL routing for the new host, how Vite is built in Docker/CI/helm, and how A1 server rendering and React stay identical.
3. **Phases, in commit order,** front-loading a deployable cauldron. Suggested order:
   1. host + shell + live header
   2. reference
   3. docs + migration
   4. agent surface
   5. homepage + Discord + analytics
   6. gallery
   7. editor
   8. redirects + CI + hardening

   Reorder if a better path to an early cauldron exists.

4. **Agent orchestration: maximum parallelism, with constant verification.** The product owner wants agents doing as much as possible **in parallel**, with **verifier agents running continuously** to check pixel parity and that tests pass. Design this explicitly:
   - **Dependency graph.** Which workstreams can start on day one (e.g. content migration, the Spectral CI, the gallery port, test-harness setup, baseline screenshot capture, design tokens) and which must wait (and on what). Maximise how much runs at the same time.
   - **Builder agents.** One per workstream, each owning a disjoint set of files or directories so they never edit the same file. Give each its inputs (files under `docs/dev-portal/research/`), what it must not touch, and its definition of done (named tests passing, not "looks done").
   - **Shared contracts first.** Before builders fan out, settle the interfaces between them: Django models and API shapes, the page-object API, design tokens, component names. Builders then work against stubs.
   - **Verifier agents running on a loop alongside the builders:**
     - (a) a **pixel-parity verifier** that re-runs the visual-diff suite against the committed baselines after each builder commit and files exact diffs (page, state, breakpoint, region, diff image) back to the owning builder
     - (b) a **test verifier** that runs lint, Vitest, pytest, the existing Jest and pytest suites, and the Playwright projects, and reports failures to the owner
     - (c) a **behavior-parity verifier** that walks the interaction checklists against live developers.sefaria.org and the local build side by side
     - (d) a **security verifier** for §5

     Say how often each runs, what triggers it, and how its reports reach builders.

   - **Loop and escalation rules.** A builder isn't done until the verifiers are green for its area. Set retry limits. Escalate to the human (the product owner) when a parity gap can't be closed, or when it would mean editing a locked `.feature` file or re-opening a decision.
   - **Integration cadence.** How parallel work merges into the single PR branch: worktrees or sub-branches merged in, an integration order, and a full verifier pass after each merge. The cauldron is updated at each milestone.
   - **Sizing.** How many agents run at once per phase, and the expected wall-clock time.
5. **Test plan per §4.12:** test files and projects per phase, which tests are tagged `@pr` and `@sanity`, the `.feature` stories the product owner needs to write (as a list of behaviors for them to draft; never written by agents), and how this fits PR #4064's CI.
6. **Verification loops:**
   - **pixel parity:** Playwright visual diffs against live at 1440/1280/1024/768/390, with thresholds, a Roboto-adjusted baseline, a "loop until green or escalate" rule, and the list of pages and states to cover
   - **behavior parity:** checklists for every interaction in §4.3–4.5
   - **migration:** every one of the 151 pages renders, every internal link resolves, and the editor round-trips every file without loss
   - **URL parity:** crawl every live URL and assert 200 or the intended redirect
   - **GA4:** titles and events
   - **accessibility:** axe
   - **security:** §5
   - **existing tests:** the main site's lint, Jest and pytest stay green
7. **Migration script:** idempotent; it imports `developer-docs` and the ReadMe images and rewrites links. Plus the re-run procedure until cutover, while staff keep editing in ReadMe.
8. **Cauldron launch checklist and production cutover runbook:** DNS, redirects for powered-by.sefaria.org, retiring the rdme workflow, cancelling ReadMe only after the images are migrated.
9. **Risks and mitigations,** with size estimates per phase.
10. **Instructions to the implementer:** what to do when blocked, when to ask the human (the product owner), and the rule that decisions in this brief are not to be re-opened.

Write the plan so the implementer can follow it start to finish without needing this conversation.
