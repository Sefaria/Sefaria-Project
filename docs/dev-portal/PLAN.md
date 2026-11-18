# Execution plan: rebuild developers.sefaria.org inside Sefaria-Project (sc-48158)

This is the execution plan for [PLANNING_BRIEF.md](PLANNING_BRIEF.md). It is written for the implementing agent, which works on branch `feature/sc-48158/rebuild-self-hosted-readme-for-developer` with parallel builder agents and continuous verifier agents. Follow it from top to bottom. Nothing here is implemented yet.

Written 2026-11-18 against repo commit `1c5cc81`, `Sefaria/developer-docs` branch `v1.0` at `b661899`, and `Sefaria/powered-by` at `2b32da5`.

## At a glance

- **Blockers: none.** Three things need confirming on day one (§1.1). The main one is that sandboxes and cauldrons answer on a developers hostname, which the Helm chart already supports with one values entry.
- **Shape.** A new Django app, `devportal/`, serves developers.sefaria.org as a third host. A new Vite + React 19 + TypeScript package, `devportal-ui/`, is built in its own Docker stage. The main site's own code changes in about a dozen small places (§2.2, Phase 8).
- **How the third module stays safe.** The developers host serves no main-site view, and the React 16 app never learns the module exists, so none of the "library, otherwise voices" checks can misfire (§2.2, Appendix A).
- **One renderer per thing.** Markdown is rendered only in Python and the browser adopts that HTML. The header and the endpoint articles are prerendered at build time from the same React components the browser runs. Where two implementations remain (the editor), committed golden files tie them together (§2.5).
- **Order.** Phase 0 contracts, 1 host and header (first cauldron), 2 reference, 3 docs and migration, 4 search, agent surface and MCP, 5 homepage, Discord and analytics, 6 gallery, 7 editor, 8 redirects and hardening (§3).
- **Parallelism.** Eight lanes start on day one, with about ten builders and four verifiers at peak. Builders own disjoint files and are done only when their verifier inbox is empty (§4).
- **Estimated timing,** not a commitment: first cauldron in about 2 working days, the read-only portal in 6 to 8, the editor in 9 to 11, the PR ready in 11 to 14 (§4.7).
- **What people need to do** is in Appendix C. Two matter first: DevOps confirms the hostname and creates the review cauldron (`H-1`), and the product owner writes the `.feature` stories (`H-3`; the behaviors are listed in §5.4).

## 0. How to read this plan

**Order of authority.** The decisions in the brief come first, then this plan, then the research notes. When any of them disagrees with the live site, the live site wins, except for the deliberate deviations registered in §6.1.5.

**Vocabulary used throughout.**

| Term                 | Meaning                                                                                                                                                                                  |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Portal               | The new developers site: the Django app `devportal/` plus the frontend package `devportal-ui/`                                                                                           |
| Library host         | `www.sefaria.org` and its staging equivalents, served by `sefaria/urls_library.py`                                                                                                       |
| Developers host      | `developers.sefaria.org` and its staging equivalents, served by the new `sefaria/urls_developers.py`                                                                                     |
| Cauldron             | A named, long-lived staging environment at `<name>.cauldron.sefaria.org`                                                                                                                 |
| Sandbox              | The short-lived environment CI creates per PR commit at `sandbox-<sha>.cauldron.sefaria.org`                                                                                             |
| Integrator           | The lead implementing agent. It owns shared files, merges builders' work and talks to the product owner                                                                                  |
| Builder              | A sub-agent that owns one workstream (`W1`…`W17`) and a disjoint set of files                                                                                                            |
| Verifier             | A sub-agent that only checks: `V-pixel`, `V-test`, `V-behavior`, `V-security`                                                                                                            |
| Contract             | An interface settled before builders fan out (`C1`…`C10`, §4.3)                                                                                                                          |
| Golden               | A committed expected-output file that two implementations must both reproduce                                                                                                            |
| Live                 | Today's ReadMe-hosted developers.sefaria.org                                                                                                                                             |
| Product owner        | The person who owns this project's decisions and is a spec editor for `.feature` files                                                                                                   |
| `H-n`, `I-n`, `DC-n` | A request to a human (Appendix C), an interpretation this plan makes where the brief leaves room (§1.3), and a day-one confirmation (§1.1). Each `H-n` has a default so work never waits |

**Three rules that apply to every agent, always.**

1. **Never create or edit a `.feature` file**, never squash, rebase, cherry-pick or re-author a commit that touches one, and never run a shell command that writes under `e2e-tests/feature-specs/features/`. Only the product owner writes them.
2. **Treat live as read-only.** Send only GET requests to developers.sefaria.org. Block `**/metrics-proxy/**` in every browser session that loads live (ReadMe's own scripts POST there). Never click "Vote", never submit a form, never send `tools/call` to the live MCP unless `H-6` is answered yes.
3. **Do not re-open a decision in the brief.** If a decision cannot be met, stop that item, report it under §10.3, and continue with everything else.

---

## 1. Blockers

**None.** No decision in the brief is blocked or technically unsound. Three things must be confirmed in the first hours because the rest of the plan stands on them; each has a named owner and a fallback.

### 1.1 Day-one confirmations

**DC-1. PR sandboxes and cauldrons serve a developers host.**

- What the repo shows: the DevOps cost is low. The chart is already generic over modules: one entry in `domains.modules` (`helm-chart/sefaria/values.yaml:452-474`) produces the Gateway listeners (`templates/gateway/gateway.yaml:48-66`), the HTTPRoute hostname (`templates/gateway/httproute.yaml:29-35`), the nginx server block (`conf/nginx.template.conf.tpl`, the `range $.Values.domains.modules` block) and the `DOMAIN_MODULES` entry (`templates/_helpers.tpl:256-281`). The host shape is `developers.<env>.cauldron.sefaria.org`, the same shape Voices uses.
- How to confirm: After the Phase 1 push, `curl -sI https://developers.sandbox-<sha>.cauldron.sefaria.org/healthz` returns 200. DNS and certificate issuance for the extra hostname live outside this repo, so this cannot be proven from code.
- If it fails: Escalate the same day (`H-1`). There is no code fallback: serving the portal under a path on the library host would change every URL and the security model.

**DC-2. The behavior-test pipeline of PR #4064 is available on this branch.**

- What the repo shows: PR #4064 is open and unmerged (checked 2026-11-17). Nothing of it is on master: no `e2e-tests/feature-specs/`, no `playwright.bdd.config.ts`, no `E2E_LIBRARY_URL`. Its branch conflicts with master in `.github/workflows/continuous.yaml` (the `continuous-branch-protection` block).
- How to confirm: `git merge-base --is-ancestor origin/chore/sc-48207/deterministic-behaviorial-test-driven origin/master`.
- If it has not landed: merge its branch into this branch in Phase 0 (§3, step 0.1). Use a merge commit, never a rebase, so the product owner's `.feature` commits keep their author.

**DC-3. The merge-queue Playwright run does not break when portal projects are added.**

- What the repo shows: `.github/workflows/integration-testing.yaml:214` runs `npx playwright test`, which is every project in `playwright.config.ts`, against an in-cluster URL (`http://nginx-integration-<sha>.<namespace>/texts`). No developers hostname is routable there.
- How to confirm: Read how that run reaches Voices today, then ask DevOps whether `developers.integration-<sha>…` can resolve (`H-1`).
- If it fails: Register the `*-developers` projects in `playwright.config.ts` only when a developers URL is known (§5.2). The merge-queue run then skips them without failing, and the PR-level run from #4064 still covers the portal.

### 1.2 Facts found while planning that differ from, or add to, the brief

None of these changes a decision. Each changes how something must be built.

- **F-1.** The agent docs are in `docs/agent_docs/`. `AGENTS.md` links to `agent_docs/`, which does not exist. _Consequence:_ New app docs go in `docs/agent_docs/apps/`. Do not fix the `AGENTS.md` links in this PR.
- **F-2.** The content inventory is 151 `.md` files plus `custom_pages/contact-us.html`, 152 source files: docs 65; reference 83 (7 hand-written, 61 endpoint stubs, 12 tag stubs, 3 hidden `ReadMeConfig` stubs); custom pages 3 `.md` + 1 `.html`. `custom_blocks/ReuseMe1.md` is an unused reusable-content placeholder. 11 pages are hidden, 1 is deprecated, 1 is a real link page. _Consequence:_ "All 151 files" in the brief means these 152 inputs. `ReuseMe1.md` is listed in the import report and not imported (reusable content is deferred).
- **F-3.** More broken internal links exist than the brief lists (§7.4). _Consequence:_ Fixed by the same rule; see `I-7`.
- **F-4.** The source has no adjacent code fences. Live still shows tabbed chrome on single fences on 14 pages. _Consequence:_ The tab rule is derived from live HTML, not assumed (§2.6).
- **F-5.** PR #4064 sets `E2E_VOICES_URL=https://sheets.sandbox-<sha>…`, but the chart serves Voices at `voices.sandbox-<sha>…`. The `sheets` value in `build/ci/sandbox-values.yaml:51` is dead configuration. _Consequence:_ Not ours to fix. Tell the product owner so it reaches that PR's author.
- **F-6.** `powered_by/tests/developer_routes_removed_test.py` expects `/powered-by` to redirect to `https://developers.sefaria.org/docs/powered-by-sefaria`, but `sites/sefaria/urls.py:104-107` redirects to `https://powered-by.sefaria.org`. _Consequence:_ The test is rewritten in Phase 8 for the new targets.
- **F-7.** The gallery's router path is `/projects/:slug`, parsed as `<id>-<name>`. It assumes it is served from `/` in about 15 places. It uses GA4 `G-44RHV2ZWQ1` and optional Plausible events. Toolchain: Vite 8, React 19.2, TypeScript 6, Vitest 5, React Router 7. It has 32 unit-test files and 7 Playwright specs. Its type expects `featured_order` and `consent_to_display`, which `GET /api/powered-by` does not send. _Consequence:_ The portal package uses the same toolchain so the port is a move, not a rewrite (§2.14).
- **F-8.** Calling the API directly means the browser can read only CORS-safelisted response headers. Live shows every upstream header because ReadMe's proxy exposes them. _Consequence:_ The "Headers" modal shows fewer response headers than live. Registered deviation `D-8`. Optional backend ask in `H-5`.
- **F-9.** `REFERENCE_SPEC.md` §7 names files that are not in the repo (the 9 ReadMe CSS bundles, `html/`, `ssr-props.json`, `config.json`, `fonts-loaded.json`). _Consequence:_ W3 and W15 re-fetch what they need from live and `cdn.readme.io` with GET requests.
- **F-10.** In deployed environments `STATIC_URL` is absolute to the library host (`sefaria/settings.py:64-70`). _Consequence:_ The portal references its assets as same-origin `/static/bundles/devportal/…`. Every module server block in nginx already aliases `/static/`.
- **F-11.** nginx serves one shared `robots.txt` on every host (`location /robots.txt` in each server block). _Consequence:_ One chart flag lets the developers host serve its own (§2.15).
- **F-12.** The repo has no Markdown renderer, no CSP, no rate limiter and no MCP code. _Consequence:_ New Python dependencies are listed in §2.3; the rate limiter and the MCP server are small in-repo modules.
- **F-13.** `build/web/Dockerfile` builds JS with whatever Node the `base-web` image got from Debian's `apt`. _Consequence:_ The portal builds in its own `node:22` stage and does not depend on that Node.
- **F-14.** `pytest.ini` collects tests through an explicit `python_files` allowlist, and CI passes directories explicitly in `build/ci/createJobFromRollout.sh:27`. _Consequence:_ Both must name `devportal`.
- **F-15.** Cauldrons and sandboxes share one Postgres database (`sefaria_auth`), and every web pod runs `python manage.py migrate` on start (`helm-chart/sefaria/templates/rollout/web.yaml:92`). _Consequence:_ Migration discipline (§2.3.4) and automatic content seeding (§7.6).
- **F-16.** No workflow in this repo creates a named cauldron. _Consequence:_ Creating the review cauldron is a human step (`H-1`).
- **F-17.** Live `.md` output rewrites `doc:`/`ref:`/`page:` links to absolute `https://developers.sefaria.org/…` URLs. _Consequence:_ The `.md` generator does the same (§2.10).
- **F-18.** The repo does not use Git LFS. _Consequence:_ Visual baselines are committed as optimized PNG files, about 60 MB (`H-9`).
- **F-19.** Sixty of the 65 docs pages are visible on live. The other five are hidden. _Consequence:_ `research/site/live-markdown/` holds 60 files; hidden pages have no live reference output.
- **F-20.** Anonymous requests on any Sefaria host pass through `LocaleMiddleware` and `LanguageSettingsMiddleware`, which can set `Content-Language: he` for visitors from Israel. _Consequence:_ The portal forces English on its own responses (§2.2).

### 1.3 Interpretations

Where the brief leaves room, this plan picks one reading and builds on it. The product owner can overrule any of these on the cauldron; none needs an answer before work starts.

- **I-1, "round-trip without loss".** Two tests over all 152 files. Opening a file in the editor and saving it without edits returns the same bytes. Forcing every block through the serializer returns Markdown whose rendered HTML equals the original's. Byte equality after an edit is promised only for the blocks that were not edited (§2.11).
- **I-2, visual-parity coverage.** Every page type and every state in `REFERENCE_SPEC.md` §6, at all five widths wherever the state exists at that width. A state that cannot exist at a width (for example sidebar collapse at 390) is listed with its reason.
- **I-3, Discord placements 1 and 2.** Placement 2 is a new slim "community" band on the homepage between the tools grid and the newsletter band, on an off-white surface, with a navy primary button. Placement 1, on the purple hero, is a white button with dark text, the treatment live already uses for "Sign Up →" on purple. The label is the existing string `developer.about_you.community.discord.join_discord_link`.
- **I-4, `.feature` file layout.** The product owner chooses how many files and their names. §5.4 lists the behaviors.
- **I-5, "editable in the admin".** Carousel cards and tool tiles are edited in the Django admin on the library host. Docs and endpoint pages are edited in the portal's own editor.
- **I-6, hidden pages.** A hidden page answers at its URL exactly as live does today (the URL-parity crawl records what live returns), and is left out of navigation, sitemap, `llms.txt` and search.
- **I-7, extra broken links.** Links with one unambiguous target are fixed like the brief's list. Placeholder links (`](🔗)`) are reported to the product owner and left as they are.
- **I-8, what "pixel parity" passes.** Exact computed styles and geometry within 0.5px, then pixel differences under the thresholds in §6.1.4, with every exception registered as a deviation.
- **I-9, `execute-request` annotations.** Names, titles and input schemas are copied byte for byte. The description gains one sentence stating the lock. Annotations become `readOnlyHint: true`, `destructiveHint: false`, because every allowed operation only reads.
- **I-10, "clean commits per phase".** Squash commits on the PR branch, each one a workstream's verified increment and each prefixed with its phase, landing in the order of §3. No history rewrite at the end, because that would re-author the product owner's `.feature` commits and fail the spec lock.
- **I-11, "the existing GCS media bucket".** `SITE_SETTINGS["TOPICS_BUCKET"]`, the bucket staff already upload topic images to, behind a `DEVPORTAL_MEDIA_BUCKET` setting (`H-4` can change it).
- **I-12, ReadMe-only elements.** "Log in to see full request history" and "Powered by ReadMe" have no function here. The first is omitted; the second is replaced by the Discord button of placement 3. Both are registered deviations.
- **I-13, search ranking.** The modal's structure, tabs, counts, badges, paging and keys match live. The order of results does not have to, because the engine differs.
- **I-14, the 404 page.** Copies live: "Page Not Found" and three suggestions, chosen here by slug similarity.

---

## 2. Architecture

### 2.1 Names and layout

```
devportal/                         Django app (Python). Label "devportal"
  apps.py  urls.py  middleware.py  tasks.py
  admin/                           One module per area: homepage.py feedback.py pages.py routing.py
  models/                          pages.py feedback.py homepage.py media.py routing.py state.py audit.py
  views/                           pages.py reference.py machine.py api.py editor_api.py gallery.py htmlblock.py errors.py
  markdown/                        Pure Python. Parser, components, renderer, sanitizer, TOC, links, plain text
  spec/                            Pure Python. OpenAPI loader, operation index, per-path slice, overlay merge
  mcp/                             Self-contained MCP server: server.py tools.py execute.py ratelimit.py README.md
  services/                        nav.py publish.py search_index.py llms.py md_export.py images.py seed.py editor.py
  security/                        csp.py headers.py permissions.py
  adapters/                        storage.py tasks.py (the only places that import sefaria.* lazily)
  templatetags/devportal_assets.py Reads the Vite manifest
  templates/devportal/             base.html, sidebar.html, page_*.html, home.html, gallery_*.html, 404.html, htmlblock_frame.html
  management/commands/             devportal_import, devportal_mirror_images, devportal_rebuild, devportal_sync_spec,
                                   devportal_check_links, devportal_purge_e2e
  migration_source/                Vendored snapshot of Sefaria/developer-docs plus SOURCE.json (repo, ref, sha, date)
  contracts/                       JSON Schemas and the fixture corpus shared with devportal-ui
  dev/                             settings_standalone.py, urls_standalone.py, README.md
  tests/                           *_test.py, plus tests/pure/ for tests that need no Django
devportal-ui/                      Vite + React 19 + TypeScript package with its own package.json and lockfile
  src/app/                         Router, data loader, root mount
  src/shell/                       PortalHeader (self-contained), Sidebar, RightRail, PageFooter, CopyPageMenu, Feedback
  src/reference/                   Endpoint article, params, schemas, playground, snippets, Try It, recent requests
  src/docs/                        Article enhancers: code tabs, copy, lightbox, TOC spy, anchors, embeds, HTMLBlock frame
  src/search/  src/home/  src/discord/  src/analytics/  src/gallery/  src/editor/
  src/styles/                      tokens.css (design system), readme-tokens.css (measured live values), article.css
  src/contracts/                   TypeScript types mirroring devportal/contracts
  scripts/                         prerender.ts, build-spec.ts, roundtrip-corpus.ts
  public/                          Brand SVGs, favicons, fonts
sefaria/urls_developers.py         URLconf of the developers host; includes devportal.urls
e2e-tests/developers/              Functional Playwright suites, one folder per area, each with a README
e2e-tests/developers-visual/       Visual-parity suite: states, adapters, baselines, deviations, capture tools
e2e-tests/mobile web/developers/   Mobile suites
e2e-tests/pages/developers/        Page objects, mounted in PageManager
e2e-tests/feature-specs/steps/developers/   Step definitions (agents write these; never the .feature files)
docs/agent_docs/apps/devportal.md  Agent documentation for the new app
```

Fixed names: module constant `DEVELOPERS_MODULE = "developers"`; settings prefix `DEVPORTAL_`; internal endpoint prefix `/_portal/`; CSS class prefix `dp-`; build output `static/bundles/devportal/` (already ignored by `/static/bundles` in `.gitignore:138`); working directory for agent reports `.devportal-run/` (add to `.gitignore`).

### 2.2 Host wiring and the module quarantine

**Wiring.** Four edits make the third host exist:

1. `sefaria/constants/model.py`: add `DEVELOPERS_MODULE = "developers"` after line 64.
2. `sefaria/hosts.py`: replace the two hard-coded lists (lines 22-36) with a loop over a mapping `{LIBRARY_MODULE: "sefaria.urls_library", VOICES_MODULE: "sefaria.urls_sheets", DEVELOPERS_MODULE: "sefaria.urls_developers"}`. For each language read each module with `.get()`, skip modules a language does not define, de-duplicate hostnames, and emit one `host()` per module that has at least one hostname. Keep library first and keep `DEFAULT_HOST = "library"` (`sefaria/settings.py:466-467`). The `NAME_SERVICE` branch is unchanged. Today a language without a `voices` key raises `KeyError` at import; the loop removes that.
3. `sefaria/local_settings_example.py:55-65` and `sefaria/local_settings_ci.py:26-37`: add `"developers": "http://developers.localhost:8000"` under `"en"` only, and add `developers.localhost` to `ALLOWED_HOSTS`.
4. `helm-chart/sefaria/values.yaml`, under `domains.modules`: add `{name: developers, subdomains: {en: developers}, redirects: [], appRobots: true}`. The developers module exists only under `en`, in every environment.

**The trap, and the rule that defuses it.** The module audit (Appendix A) found about 35 checks in Python and templates and about 266 lines in 43 JS files that read the active module. Roughly a dozen are written as "library, otherwise voices" or the reverse, and three fail hard on an unknown module (`get_page_title` raises `KeyError`, `HeaderAutocomplete.jsx` throws, `/favicon.ico` raises `FileNotFoundError`). Instead of patching each one, the plan keeps the third module away from all of them:

- **Q1. `sefaria/urls_developers.py` includes no main-site view.** It includes `devportal.urls`, the existing `powered_by.views.powered_by_api` at `/api/powered-by`, and the health views. It does not include `shared_patterns`, `site_urlpatterns` or the catch-all. It defines its own `handler404` and `handler500`. The React 16 app, `templates/base.html` and every `reader`/`sourcesheets` view are therefore unreachable on the developers host.
- **Q2. The React 16 app never learns about the module.** `reader/views.py:461` passes `settings.DOMAIN_MODULES` to the client as `domainModules`. Change it to pass only the `library` and `voices` keys, and add two new props: `developersURL` (the `en` developers URL, or `https://developers.sefaria.org` when not configured) and `poweredByURL` (`<developersURL>/powered-by` when the setting `DEVPORTAL_CUTOVER_DONE` is true, otherwise today's `https://powered-by.sefaria.org`). Every existing loop in `static/js/sefaria/sefaria.js:577-619` then behaves exactly as today. The place where the client unpacks its props (`static/js/sefaria/sefaria.js`, near line 4419) reads the two new ones.
- **Q3. Python helpers that loop over `DOMAIN_MODULES` are reviewed one by one** in Appendix A. Most are correct as they are (cookie domain, language pinning). Two need a decision, both made here: `_known_domain_hostnames()` in `sefaria/utils/domains_and_languages.py:64-71` excludes the developers module, so `/wiki` and `/developers` redirects keep their current behavior and `sefaria/system/tests/test_middleware.py:975-979` stays green unchanged; and `module_context` (`sefaria/system/context_processors.py:103`) is left alone because portal templates do not run context processors (next point).
- **Q4. Portal templates render without `request`.** Views call `render_to_string(template, context)` and build the context themselves, so none of the eight Sefaria context processors (`sefaria/settings.py:132-139`) runs. Two of them query MongoDB on every render.
- **Q5. One new middleware, `devportal.middleware.DevportalMiddleware`,** is added to `MIDDLEWARE` after `LanguageSettingsMiddleware`. It does nothing unless `request.active_module == DEVELOPERS_MODULE`. For portal requests it activates English and sets `Content-Language: en`, adds the CSP and `Link` headers, and records 404s. `/api/` paths never reach it as portal requests because `ModuleMiddleware` assigns them to the library module (`sefaria/system/middleware.py:603-640`).

A test file, `devportal/tests/module_quarantine_test.py`, pins all of this down (§5.3).

**Cookies and sessions.** `SessionCookieDomainMiddleware` (`sefaria/system/middleware.py:296-412`) already gives every host in a language the shared cookie domain, so a staff member logged in on the library host is logged in on the developers host. This is why Try It must send `credentials: 'omit'` (§2.12). Public portal pages must not set any cookie: views never touch `request.session`, and the CSRF token is fetched on demand from `GET /_portal/csrf` the first time a visitor uses the feedback widget or the editor.

### 2.3 The Django app

#### 2.3.1 Import isolation

`devportal` must be importable without MongoDB, Redis or the library. It may import Django, its own code, `sefaria.constants.model` and `powered_by.models`. Every other use of `sefaria.*` (Google Cloud Storage, Celery) goes through `devportal/adapters/` with the import inside the function. `devportal/markdown/`, `devportal/spec/` and the core of `devportal/mcp/` import no Django at all.

This buys two things the verification loops depend on:

- **A standalone dev server.** `python manage.py runserver --settings=devportal.dev.settings_standalone` starts the portal on SQLite in seconds, with `ROOT_URLCONF = "devportal.dev.urls_standalone"` and `/api/powered-by` answered from the gallery's fixture file. Builders and verifiers loop against this, not against a full Sefaria stack.
- **A cheap CI job.** Pure tests and the cross-language golden checks run on a plain GitHub runner (§2.15).

`devportal/tests/isolation_test.py` imports `devportal.urls` in a subprocess with the standalone settings and fails if `sefaria.model`, `reader` or `pymongo` appears in `sys.modules`.

#### 2.3.2 New Python dependencies (`requirements.txt`)

`markdown-it-py`, `linkify-it-py` (Markdown, chosen because the editor uses its JavaScript original, `markdown-it`, so both sides tokenize the same way), and `nh3` (HTML sanitizer; `bleach` is in the repo but deprecated upstream). Pin exact versions. `pyyaml`, `requests`, `pillow`, `lxml` and `google-cloud-storage` are already present. Do not add `django-csp`, `django-ratelimit` or an MCP SDK to runtime dependencies; the `mcp` SDK is a test-only dependency (§2.10).

#### 2.3.3 Models

All models use `BigAutoField`. No `django.contrib.postgres` fields, so the standalone SQLite mode works.

**`Page`** is one row per node of the three navigation trees. Endpoint pages are rows too: the row keyed by `operation_id` is the editor overlay the brief asks for, and nothing in it is ever written to `docs/openAPI.json`.

| Field                                      | Notes                                                                                                                                                                                           |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `section`                                  | `docs`, `reference` or `page`. These are also the URL prefixes                                                                                                                                  |
| `kind`                                     | `category` (a sidebar heading such as "TECHNICAL DOCS"; no URL), `page`, `link`, `tag_group` (for example `text`, `index`, `index-1`), `endpoint`, `api_config` (the three hidden ReadMe stubs) |
| `slug`                                     | Unicode. Unique per `section` among rows whose kind is not `category` (partial unique constraint). Case-sensitive, as on live                                                                   |
| `parent`, `position`                       | Adjacency list. Maximum depth is category plus three levels                                                                                                                                     |
| `operation_id`                             | Unique, set only for `endpoint`                                                                                                                                                                 |
| `published_revision`, `draft_revision`     | Foreign keys to `PageRevision`. The public site reads only `published_revision`. A page with none is a 404                                                                                      |
| `content_updated_at`                       | Feeds "Updated N ago". Set from ReadMe's `updatedAt` at import, then on each publish                                                                                                            |
| `spec_slice_sha`, `spec_updated_at`        | For endpoints: hash of the operation's slice of the spec, and when that hash last changed                                                                                                       |
| `origin`, `origin_path`, `origin_body_sha` | `import` or `editor`; the source file path; the hash of the last imported body. The re-import uses these to tell whether staff edited a page in the new editor (§7.2)                           |
| `deleted_at`                               | Soft delete                                                                                                                                                                                     |

**`PageRevision`** is an immutable snapshot: `page`, `number`, `author` (null for imports), `source` (`import`, `editor`, `restore`), `created_at`, and the content: `title`, `excerpt`, `body_md`, `hidden`, `deprecated`, `metadata` (JSON: `title`, `description`, `robots`), `next` (JSON: `description`, `pages[]`), `link_url`, `link_new_tab`, `fullscreen`, `api_config`, and for endpoints `sidebar_label`, `title_override`, `description_override_md`. For an endpoint, `body_md` is the free Markdown shown after the description. Rendered output is cached on the revision: `rendered_html`, `rendered_toc`, `search_text`, `renderer_version`.

Tree position is not versioned per page; moves are recorded in `EditorAuditLog`.

**The other models.**

| Model                                      | Purpose                                                                                                                                                                                                                        |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `Feedback`                                 | `path`, `page` (nullable), `helpful`, `comment`, `created_at`, `user` (nullable), `visitor_hash` (a salted daily hash used only to limit repeats). Read-only list in the Django admin with filters and CSV export              |
| `HomepageCarouselCard`, `HomepageToolTile` | Title, blurb, link, image or icon, color, `position`, `is_active`. Edited in the Django admin with `adminsortable`, which the repo already uses in `guides/`. Seeded by a data migration with live's three cards and six tiles |
| `MediaAsset`                               | `gcs_path`, `url`, `content_type`, `size`, `width`, `height`, `sha256`, `source_url` (unique; the original `files.readme.io` URL, which makes mirroring idempotent), `uploaded_by`                                             |
| `Redirect`                                 | `from_path` (unique), `to_path`, `status`. Consulted by the 404 handler. Created automatically when an editor changes a slug                                                                                                   |
| `NotFoundLog`                              | `path`, `count`, `first_seen`, `last_seen`, `last_referrer`. Upserted on each 404, capped by a rate limit, shown in the admin sorted by count                                                                                  |
| `EditorAuditLog`                           | Who did what in the editor: create, move, delete, publish, restore, upload                                                                                                                                                     |
| `PortalState`                              | One row: `generation` (bumped on every publish or tree change; caches key on it), `snapshot_sha`, `spec_sha`                                                                                                                   |
| `PortalArtifact`                           | Built files keyed by name: the search documents, the three `llms.txt` files, `llms-full.txt`, the sitemap and the two sidebar trees. Rebuilt by the publish pipeline                                                           |

#### 2.3.4 Migration discipline

Because every sandbox pod migrates the shared development database (F-15):

- Settle the models in contract `C2` before the first push that contains a `devportal` migration.
- After a migration has been pushed, never edit, rename, delete or squash it. Add a new one.
- Use only additive operations until the PR merges.

#### 2.3.5 Permissions and CSRF

Every view under `/_portal/editor/` is wrapped by `devportal.security.permissions.staff_api`: 401 JSON for anonymous users, 403 for non-staff, and no `csrf_exempt`. The only `csrf_exempt` view in the app is `/mcp`. A test walks the URL patterns and asserts both properties for every editor route (§5.3).

### 2.4 URL map of the developers host

| Path                                                                                                                                                                                   | Behavior                                                                                                                               |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `/`                                                                                                                                                                                    | Homepage. `document.title` is "Sefaria"                                                                                                |
| `/docs` → 301 `/docs/welcome`; `/docs/` → 301 `/docs`; `/docs/getting-started` → 301 `/docs/welcome`                                                                                   | ReadMe's built-in redirects                                                                                                            |
| `/docs/<slug>`                                                                                                                                                                         | Docs page. A trailing slash redirects 301 to the path without it                                                                       |
| `/reference` → 301 `/reference/getting-started`                                                                                                                                        |                                                                                                                                        |
| `/reference/<slug>`                                                                                                                                                                    | Hand-written page, endpoint page, or tag group. A tag group answers 302 to its first visible child                                     |
| `/page/<slug>`                                                                                                                                                                         | Custom page. A trailing slash is served directly, as on live                                                                           |
| `<any page path>.md`                                                                                                                                                                   | Markdown version. Also returned for the plain path when the request's `Accept` prefers `text/markdown`; responses carry `Vary: Accept` |
| `/docs.md` → 302 `/docs/llms.txt`                                                                                                                                                      | As live                                                                                                                                |
| `/v1.0` → 302 `/`; `/v1.0/<rest>` → 302 `/<rest>`                                                                                                                                      |                                                                                                                                        |
| `/llms.txt`, `/docs/llms.txt`, `/reference/llms.txt`, `/llms-full.txt`                                                                                                                 | The last one is new                                                                                                                    |
| `/sitemap.xml`, `/robots.txt`, `/openapi/sefaria-api.json`                                                                                                                             |                                                                                                                                        |
| `/.well-known/api-catalog`, `/.well-known/agent-skills/index.json`, `/.well-known/agent-skills/read-the-docs/SKILL.md`, `/.well-known/mcp/server-card.json`                            | Copied from `research/site/machine/`, with the host taken from the request                                                             |
| `/mcp`                                                                                                                                                                                 | MCP server (§2.10)                                                                                                                     |
| `/powered-by`, `/powered-by/projects/<id>-<name>`, `/powered-by/charts`                                                                                                                | Gallery. A non-canonical project slug redirects 301. An unknown id is a real 404. `/charts` is unlisted and `noindex`                  |
| `/api/powered-by`                                                                                                                                                                      | The existing view, now also on this host                                                                                               |
| `/favicon.ico`, `/apple-touch-icon.png`, `/icon-192.png`, `/icon-512.png`, `/site.webmanifest`                                                                                         | Copied from live                                                                                                                       |
| `/healthz`, `/health-check`                                                                                                                                                            | The existing health view                                                                                                               |
| `/login`                                                                                                                                                                               | 302 to the library host's `/login`                                                                                                     |
| `/editor`, `/editor/<section>/<slug>`                                                                                                                                                  | Staff-only editor shell                                                                                                                |
| `/_portal/page.json`, `/_portal/nav/<section>.json`, `/_portal/search-docs.<sha>.json`, `/_portal/csrf`, `/_portal/feedback`, `/_portal/htmlblock/<revision>/<n>`, `/_portal/editor/…` | Internal. Disallowed in `robots.txt`                                                                                                   |
| anything else                                                                                                                                                                          | `Redirect` table, then `NotFoundLog`, then the 404 page with status 404                                                                |

Do not put any portal endpoint under `/api/`. nginx sends `/api/search/` to Elasticsearch, Varnish caches several `/api/` prefixes for a day with a key that ignores the host (`helm-chart/sefaria/templates/configmap/varnish-config.yaml`), and `ModuleMiddleware` treats `/api/` as the library module. Everything else on the developers host passes through Varnish uncached, so publishing needs no purge.

### 2.5 Rendering model (A1) and how the renderings stay identical

**Principle: every piece of the page has exactly one renderer, or two that are tied together by a golden file.**

| Region                                                | On the server                                                                                                                | In the browser                                                                          | What keeps them identical                                                                                                                        |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Docs, custom-page and homepage body                   | `devportal.markdown` renders Markdown to HTML at publish time; the homepage body is a Django template                        | React does not render Markdown. It adopts the server's HTML and attaches behavior to it | One renderer. Nothing to keep in sync                                                                                                            |
| Header                                                | Django includes a file that the Vite build prerendered from the React `PortalHeader` component, one file per active tab      | The same component                                                                      | Same component on both sides                                                                                                                     |
| Endpoint article: URL line, parameters, response list | Django includes a file the Vite build prerendered from the React components, one per `operationId`, from `docs/openAPI.json` | The same components                                                                     | Same components on both sides. The spec changes only with a deploy, so build time is the right time                                              |
| Endpoint title, description, extra Markdown           | Django, from the overlay and the Python spec layer                                                                           | React, from the same payload                                                            | Golden `operations.json` listing title, description, method, path, tag and deprecation for all 61 operations, asserted by both pytest and Vitest |
| Sidebar, table of contents, "Updated", prev/next      | Small Django templates                                                                                                       | React components                                                                        | Golden HTML fixtures rendered by both, plus a no-JavaScript screenshot test                                                                      |
| Editor canvas                                         | Not applicable                                                                                                               | TipTap renders the document                                                             | Golden HTML for the whole fixture corpus: TipTap's `generateHTML` output must normalize to the Python renderer's output (§2.11)                  |
| Gallery pages                                         | A Django template lists the real projects, for search engines and the 404 status                                             | The gallery's React app replaces it                                                     | A text-content test: every project name on the server page appears in the client page                                                            |

**How the browser takes over.** The page ships its data in `<script type="application/json" id="dp-data">` (written with Django's `json_script`). The bundle calls `createRoot` on `#dp-root`, not `hydrateRoot`: React replaces the server markup with its own in one commit. Because both sides produce the same DOM with the same CSS, nothing moves. For the body, the component takes the existing server-rendered element's child nodes and moves them into its own container instead of re-parsing a string, so images do not reload. After mount it restores the scroll position for a `#hash`.

**Client-side navigation.** In-portal links are handled by React Router. The route loader fetches `GET /_portal/page.json?path=<path>`, which returns the same payload the server would have embedded, including the body HTML. A payload of kind `redirect` navigates; kind `notfound` renders the 404 page.

**The golden mechanism.** `devportal/contracts/fixtures/` holds inputs (Markdown files, a navigation tree, operations) and `devportal/contracts/golden/` holds expected HTML. Pytest asserts the Python side reproduces each golden. Vitest asserts the TypeScript side does. Both use the same normalization, specified in `devportal/contracts/NORMALIZE.md` and implemented twice with a shared self-test: parse the HTML, drop whitespace-only text between block elements, sort attributes, sort class tokens, and remove the editor-only attributes listed there. Goldens are regenerated only by `python -m devportal.contracts.regenerate`, and a regenerated golden is a reviewed change, never a way to make a test pass.

### 2.6 Markdown: dialect, rendering, sanitizing

The dialect is "ReadMe-flavoured Markdown as used in these 152 files", written down in contract `C4` (`devportal/contracts/DIALECT.md`) with one fixture per construct.

**Pipeline (Python).** Split front matter (many files have no newline after the closing `---`; match it with `\n---(\n|$)`). Parse with `markdown-it-py`: CommonMark, GFM tables, strikethrough, linkify, `html: true`, typographer off. Custom rules handle the ReadMe components. Render to HTML with the class names fixed in `C4`. Sanitize. Build the table of contents from H2 and H3. Extract plain text for search.

**Constructs to support** (counts from the source repo):

| Construct                                     | Count                 | Notes                                                                                                                                                                                              |
| --------------------------------------------- | --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `<Callout icon theme>`                        | 10 in 8 files         | Pairs seen: 🎉/`default`, 🚧/`warn`, ❗️/`error`. Markdown inside is parsed                                                                                                                         |
| Blockquote emoji callout                      | 3                     | `> 🚧 Title`, `> ⚠️ **Note:** …`. Also `> ### :warning: …`                                                                                                                                         |
| `<Image … />`                                 | 29 in 19 files        | Attributes: `src`, `alt`, `align`, `width` (values such as `"70% "` with a trailing space), `caption`, `border={true\|false}`, `framed`. Clicking opens a lightbox                                 |
| Markdown image                                | 17 in 10 files        |                                                                                                                                                                                                    |
| `<Table align={[…]}>`                         | 7                     | With `<thead>`, `<tbody>`, `<tr>`, `<th>`, `<td>`; Markdown inside cells                                                                                                                           |
| Pipe table                                    | 9 files               |                                                                                                                                                                                                    |
| `<Embed … />`                                 | 2                     | YouTube only. Rendered as an iframe to `https://www.youtube-nocookie.com/embed/<id>`. The `html="%3Ciframe…"` attribute is preserved in the source and never rendered                              |
| `<HTMLBlock>` (body in a JS template literal) | 4 files               | See below                                                                                                                                                                                          |
| Raw HTML                                      | `<br>` 90 in 34 files | Also `div`, `span`, `a`, `p`, `b`, `hr`, `code`, `iframe` (contact page), entities such as `&#x20;`                                                                                                |
| Code fence with a title                       | 7                     | Info strings such as `javascript React`, `text JSON`, `html OPML`, `python python`                                                                                                                 |
| Code fence                                    | 200                   | 86 have no language                                                                                                                                                                                |
| Emoji shortcode                               | 4                     | `:warning:`, `:handshake:`, `:wrench:`                                                                                                                                                             |
| Hebrew and RTL text                           | 29 files              | Emit `dir="auto"` on paragraphs, headings, list items and table cells                                                                                                                              |
| Heading anchors                               | all                   | Ids must equal live's, because `#fragment` links exist in the content and on the homepage. Derive the slug rule from live HTML and prove it against the `toc` arrays in `research/site/pages.json` |

**Rules that must be derived from live, not guessed.** W5 fetches the live HTML of all 60 visible docs pages plus the 7 reference guide pages (GET only) into `.devportal-run/live-html/` and derives: which fences get tab chrome and what the tab label is (F-4); the heading-id algorithm; the exact markup of callouts, image figures and tables. Each derived rule becomes a fixture and a line in `DIALECT.md`.

**Sanitizing.** After rendering, `nh3` filters the HTML against an allow-list: the tags the renderer itself emits, the raw tags in the table above, `class` only with a `dp-` prefix, `href`/`src` only with `http`, `https`, `mailto` or a relative URL, and `iframe` only when `src` starts with `https://sefaria.formstack.com/` or `https://www.youtube-nocookie.com/`. No `style` attribute, no event handlers, no `script`, `object`, `form`. The one legitimate inline style in the corpus is on the contact page's iframe, which CSS replaces.

**`HTMLBlock`.** These four blocks carry inline `<style>` and, in one case, a whole RTL Hebrew page. They cannot be allowed inline under a strict CSP, so each renders as `<iframe sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox" src="/_portal/htmlblock/<revision>/<n>">`. That endpoint returns the block's HTML wrapped in a minimal document that links `article.css`, with its own header `Content-Security-Policy: sandbox allow-same-origin allow-popups allow-popups-to-escape-sandbox; default-src 'none'; style-src 'self' 'unsafe-inline'; img-src 'self' https://storage.googleapis.com data:; font-src 'self'`. Scripts cannot run there (no `allow-scripts`, and `default-src 'none'`). `allow-same-origin` without `allow-scripts` is safe and lets the parent page read the frame's height to size it. The Markdown source of the block still appears in the page's `.md` version, as on live. Only staff can author one because only staff can edit at all.

### 2.7 The OpenAPI layer and the overlay

`devportal/spec/` loads `docs/openAPI.json` once per process and exposes:

- **The operation index.** For each of the 61 operations: `operationId`, method, path, tag, `deprecated`, **title = `operation.summary`, falling back to the path item's `summary`**, **description = `operation.description` only**, and parameters merged from the path item and the operation (24 path-level path parameters and 16 path-level query parameters exist and must be merged).
- **The slice.** The spec pruned to one path: `openapi`, `info`, `servers`, only the tags that operation uses, that path item, and the components it references. This is the `# OpenAPI definition` block of an endpoint's `.md` page; `research/reference/data/get-v3-texts.live.md` is the expected output for that endpoint.
- **The merged view.** Title is `title_override or spec title`. Sidebar label is `sidebar_label or title`. Description is the overlay's Markdown when set, otherwise the spec's.

`devportal_sync_spec` runs after every import and at deploy (from the seeding hook, §7.6). It creates an endpoint `Page` for any `operationId` that has none (appended to its tag's group; a new tag gets a new group at the end), hides the page of an operation that left the spec and reports it, and updates `spec_slice_sha` and `spec_updated_at`.

The browser gets its spec data from static files written at build time by `devportal-ui/scripts/build-spec.ts`: one dereferenced JSON per operation plus an index. The Python layer and these files come from the same commit of the spec, and the golden `operations.json` proves they agree.

### 2.8 The frontend package

**Stack.** `devportal-ui/` has its own `package.json`, lockfile and `node_modules`: React 19.2, React Router 7 with `createBrowserRouter`, TypeScript 6 in strict mode, Vite 8, Vitest 5 with Testing Library and `vitest-axe`, ESLint with `typescript-eslint`, `eslint-plugin-react-hooks` and `eslint-plugin-jsx-a11y`, and Stylelint. These are the gallery's versions (F-7). Formatting follows the repo's root `.prettierrc.json`. The main site's `package.json`, webpack configs, Babel config and React 16 are not touched, with one exception: add `"<rootDir>/devportal-ui/"` to `jest.testPathIgnorePatterns` in the root `package.json` (line 198), because Jest 24 would otherwise collect the portal's TypeScript tests and fail.

**Styling.** CSS Modules per component, plus three global files: `tokens.css` (the design system's tokens with `data-theme="devportal"`; use the `@sefaria/design-system` package at the tag the root `package.json` pins if it ships these token names, otherwise vendor `research/design/design-system/tokens.css` with a header naming its source), `readme-tokens.css` (the measured live values for the reference and docs chrome, from `research/reference/data/css-vars-computed-live.json`, since live wins there), and `article.css` (the body styles shared by public pages, the HTMLBlock frame and the editor canvas). Roboto and Heebo are self-hosted from `public/fonts/`; monospace keeps live's system stack. No Google Fonts request.

**Build.** `vite.config.ts` sets `base: '/static/bundles/devportal/'` and `build.manifest: true`, with one entry, `src/app/main.tsx`. The playground, search, gallery, charts and editor are lazy chunks. `npm run build` runs, in order: type check, `build-spec.ts`, `vite build`, then `prerender.ts`, which renders the header (one file per active tab) and the 61 endpoint articles with `react-dom/server` into `dist/prerender/` and writes `dist/prerender/manifest.json`.

**How Django finds the assets.** `{% devportal_entry %}` in `devportal/templatetags/devportal_assets.py` reads `static/bundles/devportal/.vite/manifest.json` once (re-read on change when `DEBUG`) and emits the entry's `<script type="module" nonce>` tag, its CSS links and its `modulepreload` links, all as same-origin `/static/bundles/devportal/…` paths. When `DEVPORTAL_VITE_DEV_SERVER` is set it emits the Vite dev client instead. `{% devportal_prerendered "header" active %}` and `{% devportal_prerendered "endpoint" operation_id %}` include prerendered files; if one is missing they emit a plain semantic fallback and log a warning.

**Docker.** In `build/web/Dockerfile`, add a first stage and one copy line:

```dockerfile
FROM node:22-bookworm-slim AS devportal-ui
WORKDIR /src/devportal-ui
COPY devportal-ui/package.json devportal-ui/package-lock.json ./
RUN npm ci
COPY devportal-ui/ ./
COPY docs/openAPI.json /src/docs/openAPI.json
RUN npm run build
```

and, after the existing `COPY . /app/` and before `RUN python manage.py collectstatic`:

```dockerfile
COPY --from=devportal-ui /src/devportal-ui/dist /app/static/bundles/devportal
```

The asset image (`build/asset/Dockerfile`) copies `/app/static-collected` from the web image, so nginx serves the bundle with no further change. Add `devportal-ui/node_modules` and `devportal-ui/dist` to `.dockerignore`. The Node SSR image is not involved. The portal build is always a production build, whatever `TYPE` the webpack build uses.

### 2.9 Search

Python builds the search documents at publish time, one per visible page and one per operation: `id`, `section`, `kind`, `title`, `path`, `method`, `excerpt`, `headings`, `body` (plain text), and for operations the parameter names and descriptions and the response descriptions. They are stored as a `PortalArtifact` and served at `/_portal/search-docs.<sha>.json` with a long cache lifetime; the current `<sha>` is in every page payload.

The browser fetches that file the first time search opens and builds a MiniSearch index in memory. Fields and boosts: `title` ×5, `path` ×3, `headings` ×2, `excerpt` ×2, `body`, `params`; prefix matching and light fuzziness.

The modal copies live: opens on Cmd/Ctrl-K and from the header field; tabs All, Docs, API Reference, Pages with counts; GET/POST badges on endpoints; a snippet with the match highlighted; 15 results per page with "Back · 1 of N · Next"; arrow keys, Enter, Escape; the empty state "Start typing to search…". There is no "Ask AI".

### 2.10 The agent surface and the MCP server

**`.md` pages.** Generated by `devportal/services/md_export.py`: front matter with `updatedAt` and `agentTools.projectIndex`, then `# <title>`, the excerpt, and the stored Markdown with its in-portal links (which the import made relative, §7.2) written as absolute URLs on the request's host, as live does (F-17). Endpoint pages: title, description, the overlay's extra Markdown, then `# OpenAPI definition` and the slice in a `json` fence. The expected outputs are the 60 files in `research/site/live-markdown/` and `research/reference/data/get-v3-texts.live.md`.

**`llms.txt`.** Three files in live's format (`research/site/machine/llms.txt`, `wk_docs_llms.txt`, `wk_reference_llms.txt`): a heading per sidebar category, nested bullets, links to `.md` URLs, excerpts after a colon. `llms-full.txt` is new: the same order, with every page's Markdown inlined. Every slug that `static/llms.txt` on the main site links to (30 URLs) must exist; a test reads that file and checks each one.

**Headers and discovery files.** Every HTML and Markdown response carries the `Link` header set live sends: `api-catalog`, `service-doc`, `agent-skills`, `mcp-server`, and `alternate; type="text/markdown"` pointing at the page's `.md`. Each page starts with the visually hidden "For AI agents" banner; copy its text from live. The `.well-known` files are copied from `research/site/machine/` with the server card's `name` changed from `com.readme/sefaria` to `org.sefaria/developers`. The skill file's `digest` in `agent-skills/index.json` is recomputed from our `SKILL.md`.

**The MCP server** lives in `devportal/mcp/` and is written by hand, about 400 lines, because the site runs on WSGI and the official SDK needs ASGI.

- **Transport.** Streamable HTTP in its simplest allowed form: `POST /mcp` takes one JSON-RPC message and answers with `Content-Type: application/json`. No sessions, no server-sent events. `GET /mcp` without `Accept: text/event-stream` returns live's 48-byte HTML notice; with it, 405. `OPTIONS` answers the CORS preflight. The view is `csrf_exempt` and never reads `request.user` or the session.
- **Methods.** `initialize` (negotiates the protocol version from a constant list of supported versions), `notifications/initialized`, `ping`, `tools/list`, `tools/call`.
- **`tools/list`** returns the four tools of `research/site/machine/mcp-tools-list.json`. Names, titles and input schemas are byte-identical to that file, asserted by a test (`I-9` covers the one description and the annotations that change).
- **`list-endpoints`, `get-endpoint`, `search-endpoints`** read `devportal.spec` and the published overlay through an injected provider, so the core is testable without a database. Their output is JSON text. If `H-6` is answered yes, capture live's output for these three tools first and match its shape.
- **`execute-request`** is the dangerous one. Every request goes through `devportal/mcp/execute.py`, which enforces all of the following before any network call:
  1. Parse `url`. Scheme must be `https`. Host must equal the host of `DEVPORTAL_API_ORIGIN` (`https://www.sefaria.org`) exactly. No user info, no port other than 443, no backslash, whitespace or control character. The outgoing URL is rebuilt from the validated parts, never passed through.
  2. The path, percent-decoded once, must match a path template in the spec, with no `.` or `..` segment and no empty segment. The method must be one the spec defines for that path.
  3. Headers: forward only `Accept` and `Content-Type`. Set our own `User-Agent`. Never forward `Cookie`, `Authorization`, `Host` or any `X-Forwarded-*`.
  4. Body: only for the two POST operations, only `application/json`, at most 100 KB. Form `params` are rejected.
  5. Send with `requests`, `allow_redirects=False`, a 3-second connect and 10-second read timeout, a fresh session with no cookie jar. Read at most 1 MB of the response and mark it truncated beyond that.
  6. Rate limits from `devportal/mcp/ratelimit.py`, a fixed-window counter on Django's cache keyed by client IP: 30 `execute-request` calls per minute per IP and 600 per minute overall; 120 per minute per IP for the other tools.
- **Maintenance note.** `devportal/mcp/README.md` states: the owner (to be named by the team, `H-10`); that the protocol version list is the one place to update when the MCP specification changes; that `devportal/tests/mcp_conformance_test.py` drives the server with the official `mcp` Python SDK's client, so bumping that test dependency is how a specification change is detected; and that the tools read `docs/openAPI.json` at process start, so the server is in sync with the spec by construction, with a test that every operation in the spec is listed by `list-endpoints`.

The second MCP at `chat.sefaria.org/mcp/` is not touched.

### 2.11 The editor

**Library: TipTap 3 (ProseMirror), open-source packages only, with `prosemirror-markdown` and `markdown-it` for Markdown.** ReadMe's own editor is built on TipTap, which keeps the editing model close to what staff use today. `markdown-it` is the JavaScript original of the server's `markdown-it-py`, so both sides tokenize alike. No TipTap Cloud or paid extension. The page tree uses `@dnd-kit`.

**Lossless round trip by keeping the source.** The parser records, on every top-level node, the exact source lines it came from, including the blank lines before it. A ProseMirror plugin marks a node dirty when a transaction changes it. The serializer writes a clean node's original source and re-serializes only dirty nodes. Anything the parser does not recognise becomes a `rawMarkdown` node that shows its source in a code box and serializes verbatim, so no construct can be dropped.

This gives the three round-trip tests of `I-1`:

- **RT-1, identity.** For each of the 152 files, `serialize(parse(source)) === source`, byte for byte. Vitest.
- **RT-2, meaning.** With every node forced dirty, the output's rendered HTML equals the original's rendered HTML after normalization, and serializing twice gives the same text. `devportal-ui/scripts/roundtrip-corpus.ts` writes the outputs; a pure pytest renders both sides and compares.
- **RT-3, locality.** Editing one paragraph changes only that block's lines. Vitest, on 20 sampled files.

**What the editor offers at launch** (brief §4.6):

- A page tree per section with nesting, drag to reorder, "+ New" and "+ add child" on each row. Moves are validated on the server: same section, allowed parent kind, depth limit.
- A View/Edit toggle. View shows the draft rendered by the server (`POST /_portal/editor/preview`) inside the normal page layout, so it is the live rendering by construction. Edit shows TipTap with `article.css`.
- A "/" slash menu that inserts every construct in §2.6: callout (icon and theme), image (upload or URL, alignment, width, caption, border), table, embed, HTML block (source editor with a sandboxed preview), code block (language and tab title), and the standard blocks.
- A settings panel: page type, visibility, subtitle, SEO metadata, next pages, link URL and new-tab flag, slug. Changing a slug creates a `Redirect` from the old path.
- Endpoint pages: sidebar label, sidebar position (through the tree), title, description, free Markdown. Everything from the spec is shown read-only.
- Revision history with restore. Restore creates a new draft; it never rewrites history.
- "Save draft" and "Publish". Saving sends the base revision number and the server answers 409 if someone else saved first.
- Image upload to Google Cloud Storage through `GoogleStorageManager.upload_file` (`sefaria/google_storage_manager.py:37-53`), to `developers/<sha256-prefix>-<name>` in `DEVPORTAL_MEDIA_BUCKET`. Staff only; PNG, JPEG, GIF and WebP only, verified by decoding with Pillow; 5 MB limit. Without credentials (local development) a local backend stores files under the media root.

Deferred, as the brief says: Edit with AI, the AI linter, comments, branches and versions, reusable content, glossary.

**Publishing.** `devportal/services/publish.py` renders the revision, stores the HTML, table of contents and search text, bumps `PortalState.generation`, and rebuilds the artifacts (sidebar trees, search documents, `llms` files, sitemap). The rebuild runs as a Celery task when `CELERY_ENABLED` is true and inline otherwise, following the pattern at `sefaria/tracker.py:238`; cauldrons run without workers by default. Add `"devportal"` to `autodiscover_tasks` in `sefaria/celery_setup/app.py`.

### 2.12 Security architecture

**Content Security Policy.** `devportal/security/csp.py` builds the header for every portal response, with a per-request nonce:

```
default-src 'none'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'; form-action 'self';
script-src 'self' 'nonce-<n>' https://www.googletagmanager.com;
style-src 'self';
img-src 'self' data: https://storage.googleapis.com https://www.google-analytics.com https://www.googletagmanager.com;
font-src 'self';
connect-src 'self' https://www.sefaria.org https://www.google-analytics.com https://*.google-analytics.com https://*.analytics.google.com https://www.googletagmanager.com;
frame-src 'self' https://sefaria.formstack.com https://www.youtube-nocookie.com;
manifest-src 'self'
```

Rules: no `'unsafe-inline'` and no `'unsafe-eval'` for scripts, anywhere. No inline `<style>` on public pages. If a pinned library needs inline `style` attributes, add `style-src-attr 'unsafe-inline'` only, record which library in `devportal/security/csp.py`, and never widen `style-src` itself. Editor responses may carry that attribute allowance because ProseMirror sets inline styles. The `connect-src` entry for the API origin comes from `DEVPORTAL_API_ORIGIN`. Until the ReadMe images are mirrored, a setting `DEVPORTAL_ALLOW_README_IMAGES` adds `https://files.readme.io` to `img-src`; cutover requires it to be off (§8.2). Also send `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin` and `Cross-Origin-Opener-Policy: same-origin`.

**Code display without a code editor.** Read-only code (request samples, response bodies, docs code blocks) is tokenized with CodeMirror 5's `runMode` add-on and rendered into our own elements, styled with the `material-palenight` and `neo` theme rules. This gives the same token classes, and so the same colors, as live, and injects no styles. Line numbers and folding in the response viewer are our own markup.

**Try It.** One module, `devportal-ui/src/reference/tryit/send.ts`, makes every call:

```ts
fetch(url, {
  method,
  headers,
  body,
  credentials: 'omit',
  mode: 'cors',
  cache: 'no-store',
  referrerPolicy: 'no-referrer',
});
```

- The origin is a constant read from the page payload (`DEVPORTAL_API_ORIGIN`). There is no input for it. The URL builder takes the path template and encodes each parameter with `encodeURIComponent`; a unit test asserts that for every operation and adversarial parameter values the result starts with the origin followed by `/api/`.
- The response body is put into the DOM as text nodes only. HTML in a response is displayed, not executed.
- "Recent Requests" keeps time, status, method, path and `operationId` in `localStorage` under `dp:recent-requests:v1`, at most 50 entries. It never stores a response body or an API key.
- No server-side proxy exists.

**API keys (upcoming).** The gateway already reads `x-api-key` and the preflight already allows it (`sefaria/system/middleware.py:505-526`). The portal is built ready and switched off:

- `DEVPORTAL_DEMO_API_KEY` is empty by default. While it is empty, Try It sends no key, code samples contain none, and the page looks exactly like live.
- When it is set, Try It sends `X-API-Key`, every code sample includes that header, and the request panel shows a labelled field: "Public demo key: rate-limited and read-only. Replace it with your own key." A visitor's own key is kept in `sessionStorage` only and is never sent to the developers host, put in a URL, or stored in Recent Requests.
- What the backend team must provide is listed in `H-5`.

**Editor content.** Rendered HTML is always produced on the server from Markdown and sanitized (§2.6); HTML sent by a client is never stored. HTML blocks are sandboxed (§2.6). Editor APIs are staff-only with CSRF (§2.3.5). Uploads are type-checked by decoding.

**Before the PR is marked ready,** run `/security-review` on the branch and fix or record every finding (Phase 8).

### 2.13 Analytics

- One module, `devportal-ui/src/analytics/`, loads `gtag` with the property for the current section from `DEVPORTAL_GA4`, a mapping such as `{"default": "G-6SXQFSB219", "gallery": "G-44RHV2ZWQ1"}`. An empty mapping (the default outside production) loads nothing. Merging the gallery later is a one-line settings change.
- `gtag('config', id, { send_page_view: false })`, then exactly one `page_view` on the first load and one per client-side navigation, sent after `document.title` is set. `H-7` asks the analyst to confirm the property's "page changes based on browser history events" setting is off, otherwise navigations count twice.
- `document.title` is the page title with nothing appended: "Sefaria" on the homepage, the summary on endpoint pages, "404 Not Found" on the 404 page. The titles of all live pages are in `research/site/pages.json`; a test compares every one.
- Enhanced measurement stays on in the property (scroll, outbound click, form start).
- Key events, with the names fixed in contract `C8`: `discord_cta_click` with `placement` (one of `home_hero`, `home_community`, `sidebar_footer`, `docs_page_end`, `reference_request_panel`, `contact_page`); `try_it_run` with `operation_id`, `method`, `status`; `copy_page_action` with `action` (`copy_markdown`, `view_markdown`, `open_chatgpt`, `open_claude`, `connect_cursor`, `connect_vscode`, `copy_mcp_config`, `copy_mcp_command`); `contact_form_start`, sent once when focus first moves into the Formstack frame. Parameters never contain parameter values, search text or keys.
- The gallery keeps its own Plausible-style events and its GA4 property.

### 2.14 The gallery port

Move `Sefaria/powered-by` `src/` into `devportal-ui/src/gallery/` and its `public/` files into `devportal-ui/public/gallery/`, keeping the layout and every feature. The changes are exactly these:

1. Routes mount under `/powered-by` inside the portal's router; every place in F-7's list that assumes `/` is updated (`slug.ts`, `RouteEffects.tsx`, `analytics.ts`, the home links, the category-art and font URLs).
2. `PROJECTS_URL` in `lib/api.ts` becomes the same-origin `/api/powered-by`.
3. `SITE` in `ProjectPage.tsx` and the canonical and social URLs use the request origin plus `/powered-by`.
4. Colors and fonts move onto the shared tokens. The gallery's `tokens.css` keeps only what the shared file lacks.
5. The gallery's own header is replaced by the portal header. Its "Submit a project" and "Donate" actions move into the gallery page.
6. The Django view serves each gallery URL with real status codes: 301 for a non-canonical project slug, 404 for an unknown id, and `noindex` for `/powered-by/charts`.
7. Prettier formatting changes to the repo's configuration.

Its 32 Vitest files move with the code. Its 7 Playwright specs are rewritten to the house rules under `e2e-tests/developers/gallery/` (§5.2). `useEffectEvent` works because the bundle is React 19.

### 2.15 Infrastructure touch list

- `sefaria/settings.py`: Add `"devportal.apps.DevportalConfig"` to `INSTALLED_APPS` (line 184) and the middleware to `MIDDLEWARE` (line 149). Defaults for the `DEVPORTAL_*` settings (`API_ORIGIN`, `GA4`, `DEMO_API_KEY`, `MEDIA_BUCKET`, `ALLOW_INDEXING`, `ALLOW_README_IMAGES`, `AUTO_SEED`, `CUTOVER_DONE`, `VITE_DEV_SERVER`), placed before the local-settings import like the search index names.
- `helm-chart/sefaria/values.yaml`: The developers module (§2.2).
- `helm-chart/sefaria/conf/nginx.template.conf.tpl`: In the per-module server block, skip `location /robots.txt` when the module has `appRobots: true`, so Django serves it.
- `helm-chart/sefaria/templates/configmap/local-settings.yaml` and `local-settings-file.yaml`: Pass `DEVPORTAL_ALLOW_INDEXING` (the inverse of `nginx.disableScraping`), `DEVPORTAL_GA4`, `DEVPORTAL_DEMO_API_KEY`, `DEVPORTAL_MEDIA_BUCKET`, `DEVPORTAL_AUTO_SEED`, `DEVPORTAL_CUTOVER_DONE`.
- `helm-chart/sefaria/tests/`: Update `nginx_conf_test.sh`, `render_diff_vs_base.sh` and `auth_service_render_test.py` expectations for the extra module.
- `envs/staging/helmrelease.yaml`, `envs/preprod/helmrelease.yaml`, `build/ci/preprod-values.yaml`: Add the developers module when DevOps is ready (`H-1`). `envs/prod/helmrelease.yaml` only at cutover (§8.2).
- `build/web/Dockerfile`, `.dockerignore`: §2.8.
- `pytest.ini`: Add `devportal/tests/*_test.py` and `devportal/tests/pure/*_test.py` to `python_files`.
- `build/ci/createJobFromRollout.sh:27`: Append `./devportal` to the pytest directories.
- `.github/workflows/continuous.yaml`: A `devportal-ui` job (Node 22: `npm ci`, lint, type check, Vitest, build) and a `devportal-pure` job (Python 3.12 and Node 22: pure pytest, golden checks, the round-trip corpus, MCP conformance). Add both to `continuous-branch-protection`. With #4064: set `E2E_DEVELOPERS_URL` in `e2e-job`.
- `.github/workflows/linting.yaml`: A `lint-devportal` job that runs the portal package's ESLint, Stylelint and Prettier check.
- `.github/workflows/openapi-lint.yaml` (new): Spectral (§3, Phase 0).
- `.github/workflows/devportal-visual.yaml` (new): Manual and nightly run of the visual-parity suite against a given URL. Never blocks a PR.
- `.husky/pre-commit` and `lint-staged` in `package.json`: Add `devportal-ui/**/*.{ts,tsx,css}` entries that call the portal package's linters.
- `.gitignore`: `.devportal-run/`, `devportal-ui/dist/`, `devportal-ui/node_modules/`.

---

## 3. Phases, in commit order

Phases are **integration milestones**: the order in which finished work lands on the PR branch. Workstreams start much earlier than the phase they land in (§4.1). Each phase lists its work, the tests that must pass before it is merged, and its commit prefix. "Existing suites green" always means: `npm run lint`, `npm run lint:py`, the root Jest run, and the sandbox pytest run over `./sefaria ./sso ./reader ./powered_by ./devportal`.

Phases 2 and 3 are independent of each other and may land in either order. Phase 6 depends only on Phase 1.

### Phase 0: foundations and contracts

No visible feature. Everything later depends on it, so the Integrator does it first, with two helpers.

- **0.1** DC-2. If PR #4064 is not on master, `git merge --no-ff origin/chore/sc-48207/deterministic-behaviorial-test-driven`. Resolve the one conflict, in `.github/workflows/continuous.yaml`, by keeping both sides' conditions in `continuous-branch-protection`. If it is on master, merge master instead.
- **0.2** Skeletons: the `devportal` app with `apps.py`, empty `urls.py` and the standalone settings; the `devportal-ui` package with a "hello" entry, lint, type check and Vitest wired; `.gitignore`, `pytest.ini`, the Jest ignore pattern, the Dockerfile stage and the CI jobs from §2.15.
- **0.3** Contracts `C1`…`C10` (§4.3), each a file under `devportal/contracts/` with fixtures.
- **0.4** The third host in the test harness (§5.2.1), page-object stubs with their final method signatures, and the BDD vocabulary additions. After this step the product owner can start writing `.feature` files (`H-3`).
- **0.5** Vendor the content snapshot into `devportal/migration_source/` with `SOURCE.json`.
- **0.6** Spectral in CI: `.github/workflows/openapi-lint.yaml` runs on every pull request, merge group and push to master, with no `paths:` filter so that it can be a required check. Its first step exits successfully when neither `docs/openAPI.json` nor `docs/.spectral.yaml` changed. Otherwise it runs a pinned `@stoplight/spectral-cli` with `--ruleset docs/.spectral.yaml --fail-severity error`. If today's spec already has errors, do not edit the spec in this PR: add narrowly scoped overrides to `docs/.spectral.yaml`, one comment each, and list them in the PR description for the API owners.
- **0.7** Start the day-one workstreams (§4.1), including baseline capture from live.
- **0.8** Send the human requests of Appendix C.

**Must pass:** `devportal/tests/isolation_test.py`; `devportal/tests/pure/contracts_test.py` (every fixture validates against its schema); the `devportal-ui` Vitest run (the same fixtures satisfy the TypeScript types); `npx playwright test --list` shows the new projects when `E2E_DEVELOPERS_URL` is set and does not when it is absent; the Spectral workflow is green on the branch; existing suites green.

**Commits:** `chore(devportal): phase 0, skeleton, contracts and test harness`; `ci: lint docs/openAPI.json with Spectral`.

### Phase 1: host, shell and the live header → milestone M1

| Workstream | Work                                                                                                                                                                                                                                                                                                                                            |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Integrator | The shared-file edits of §2.2: the constant, `hosts.py`, both local-settings files, `sefaria/urls_developers.py`, the `domainModules` filter and the `developersURL` and `poweredByURL` props (`reader/views.py`, `static/js/sefaria/sefaria.js`), `_known_domain_hostnames`, and the `INSTALLED_APPS` and `MIDDLEWARE` entries                 |
| W1         | `DevportalMiddleware`, CSP, `Link` headers, the asset template tags, error handlers, health routes, favicons and manifest (downloaded from live), `robots.txt` (live's content when `DEVPORTAL_ALLOW_INDEXING` is true, `Disallow: /` otherwise), the base template and data island, `/_portal/page.json` and `/_portal/csrf`                   |
| W2         | `PortalHeader` as one self-contained component with no imports from the rest of the shell (so it can be swapped later): desktop bar, nav with active state, search field with the platform key hint, the 9-dot links menu, the mobile header, drawer and sub-nav button. The router, the page-data loader, the three-column frame, the 404 page |
| W16        | The helm values entry and the nginx `appRobots` flag; chart test updates                                                                                                                                                                                                                                                                        |
| W14        | `DevelopersShellPage` and header page objects; suites `shell/` and `security/` (first tests)                                                                                                                                                                                                                                                    |

Header facts to copy exactly are in `research/reference/REFERENCE_SPEC.md` §1.1 and `research/site/SITE_ATLAS.md` §2: 65px bar, `#612854`, the 295×40 logo (`research/design/logo-developers-on-sefaria-white.svg`), six nav links with their targets, the 150×32 search toggle, the four links-menu items with their dot colors, the 103px mobile header, the drawer's eight links. Copy the header's inconsistencies too ("Voices at Sefaria" in the menu, "Voices on Sefaria" in the drawer, links to bare `sefaria.org`); the header redesign is out of scope.

**Must pass:** pytest `host_routing_test`, `module_quarantine_test`, `csp_test`, `asset_tag_test`, `robots_test`; Vitest header tests including `vitest-axe` and the prerender test; Playwright `DEV-HDR-001`…`012`, `DEV-SEC-001` (CSP header present, no violation reported during a full page load), `DEV-SEC-002` (public pages set no cookie); V-pixel green for the header states (`component-header`, `header_links_menu_open_1440`, `mobile_nav_open_390`); existing suites green, including `sefaria/system/tests/test_middleware.py` unchanged.

**Milestone M1:** the PR's sandbox answers on the developers host (DC-1) and shows the header and frame. Ask for the review cauldron now (`H-1`).

**Commit prefix:** `feat(devportal): phase 1`.

### Phase 2: API reference

| Workstream | Work                                                                                                                                                                                                                                                                                                                                                         |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| W4         | `devportal/spec/` (§2.7), the reference views, tag-group redirects, the reference sidebar tree with methods and deprecation, `devportal_sync_spec`                                                                                                                                                                                                           |
| W6         | First deliverable only: import of the tree structure of all three sections from the `_order.yaml` files, so the sidebar is real                                                                                                                                                                                                                              |
| W3         | The endpoint article and playground: every item of §4.3 of the brief, measured values from `REFERENCE_SPEC.md` §1.2-1.6 and `research/reference/data/computed-get-v3-texts.json`; `build-spec.ts` and the endpoint prerender; Try It (§2.12); code samples with `@readme/httpsnippet`; Recent Requests                                                       |
| W2         | The sidebar (288px, sticky, collapsible groups with only the current one open, filter with Cmd-/, method pills, deprecated icon, whole-sidebar collapse remembered in `localStorage`), the mobile sidebar dropdown, the page footer ("Updated N ago", prev/next), the Copy Page split button and menu (visuals now, actions in Phase 4), the feedback widget |
| W1         | `/_portal/nav/<section>.json`, `POST /_portal/feedback`, and the server-side sidebar, table-of-contents and page-footer templates with their goldens                                                                                                                                                                                                         |
| W14, W15   | Suites `reference/`, `try-it/`; page objects; the reference states of Appendix B                                                                                                                                                                                                                                                                             |

Points that are easy to get wrong:

- **Code samples.** Shell is the default; then Node, Ruby, PHP, Python; then the "More Languages" menu with the 18 entries in the brief. Node offers Axios, fetch and http, with fetch as the default (deviation `D-4`; live defaults to ReadMe's `api` SDK, which also relabels "Path Params" as "Metadata", so that relabel does not exist here). "Agent Prompt" is not an `httpsnippet` target: write it as a small generator. Capture live's generated text for every language on `get-v3-texts`, `get-calendars` and `post-find-refs` (by selecting each language on the live page, GET only) into `devportal-ui/src/reference/snippets/__fixtures__/`, and assert equality in Vitest.
- **The language choice persists** per browser. Live uses cookies (`readme_language`, `readme_library`); use `localStorage`, so the portal stays cookie-free.
- **Two invisible bugs to fix** (brief §4.3): response accordions are not wrapped in `<h1>` (use a button inside an `h3`), and the Copy Page menu items have no colored dots.
- **Breakpoints:** 1300, 1066, 769, 700 and 414, from `REFERENCE_SPEC.md` §1.6. Whether the 1065 stacking is a viewport or container rule is unverified there; measure it on live before choosing.

**Must pass:** pytest `spec_operations_test` (61 operations; title and description rules; merged parameters), `spec_slice_test` (the slice for `get-v3-texts` equals the one in `get-v3-texts.live.md`), `reference_views_test` (`/reference` 301, tag groups 302, the `index` and `index-1` split, the two deprecated operations), `feedback_test`; the golden `operations.json` on both sides; Vitest for parameters, responses, snippets, the URL builder, Try It options, Recent Requests, and prerender-equals-client-render for all 61 operations; Playwright `DEV-REF-*`, `DEV-TRY-*`; V-pixel green or registered for every `R` state; V-behavior checklists A-F (§6.2); V-security Try It checks (§6.7).

**Commit prefix:** `feat(devportal): phase 2`.

### Phase 3: docs and migration

| Workstream | Work                                                                                                                                                                                                                                                         |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| W5         | The Markdown renderer, sanitizer, table of contents, link resolver and plain-text extractor, complete against `C4`                                                                                                                                           |
| W6         | The full import (§7), the image mirror command, the publish pipeline, the seeding hook, the artifacts                                                                                                                                                        |
| W7         | `article.css`; the behaviors attached to server HTML (code-tab chrome, copy buttons, heading anchors, image lightbox, TOC with scroll spy, embeds, HTML-block frame sizing); the docs sidebar; the docs page layout; custom pages including the contact page |
| W14, W15   | Suites `docs/`, `forms/`; the page-type states of Appendix B                                                                                                                                                                                                 |

Prev/next links appear on some live pages and not others. `research/site/pages.json` records, for every page, whether they appear and where they point. Derive the rule from that file and the front matter (`next.pages`), and prove it with a test over all 60 pages rather than assuming it.

**Must pass:** pytest (pure) `markdown_golden_test`, `sanitize_test`, `heading_ids_test`; pytest `import_test` (§7.5), `links_test` (every internal link resolves; the known broken ones are fixed), `render_all_pages_test` (all 152 render; the sanitizer removes nothing that is not on the expected-removals list), `toc_parity_test`, `pagination_parity_test` and `titles_parity_test` (against `pages.json`), `htmlblock_frame_test`; Vitest for the enhancers; Playwright `DEV-DOC-*`, `DEV-FORM-*`; V-pixel for page types `P01`-`P11`; V-behavior checklist G.

**Commit prefix:** `feat(devportal): phase 3`.

### Phase 4: search, the agent surface and the MCP server

| Workstream | Work                                                                                      |
| ---------- | ----------------------------------------------------------------------------------------- |
| W10        | Search documents and the search modal (§2.9)                                              |
| W8         | `.md` pages, `Accept` negotiation, the `llms` files, discovery files, the sitemap (§2.10) |
| W9         | The MCP server (§2.10)                                                                    |
| W2         | The eight Copy Page actions, wired                                                        |
| W14        | Suites `search/`, `agent/`                                                                |

Copy Page actions, from `SITE_ATLAS.md` §2: "Copy Page" copies the page's Markdown; "View as Markdown" opens the `.md` URL; "Open in ChatGPT" and "Open in Claude" open the two prompt URLs quoted there with this page's `.md` URL; the four MCP items target `<origin>/mcp`. Capture the exact Cursor and VS Code deep links and the config and command strings from live's menu and keep them as fixtures.

**Must pass:** pytest `md_export_test` (our output equals each of the 60 files in `research/site/live-markdown/` and the endpoint sample, after normalizing `updatedAt`, the host and mirrored image URLs), `accept_negotiation_test`, `llms_test` (structure and order equal the three captured files), `llms_full_test`, `wellknown_test`, `link_header_test`, `main_site_llms_links_test`, `sitemap_test` (the 129 live URLs are all present), `search_docs_test`, and the MCP tests of §5.3; Vitest for the search modal and the Copy Page actions; Playwright `DEV-SRCH-*`, `DEV-AI-*`, `DEV-MCP-*`; V-behavior checklists H and I; V-security MCP checks.

**Commit prefix:** `feat(devportal): phase 4`.

### Phase 5: homepage, Discord and analytics

| Workstream | Work                                                                                                                                                                                                                                                                           |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| W11        | The homepage as a Django template plus `home.css`, ported from `research/site/landing-custom.html` and `research/site/custom-css.css`; the homepage models, their admin and seed migration; the `DiscordButton` component and its six placements; the analytics module (§2.13) |
| W14, W15   | Suites `home/`, `analytics/`; the home states                                                                                                                                                                                                                                  |

Homepage rules: all copy comes from live, never from the design PNGs. Use the designer's vectors: `research/design/wavy-lines-desktop-1440.svg`, `wavy-lines-mobile-737.svg` and the logo. Keep the typing animation, the carousel and the tiles free of JavaScript, as on live; the carousel's CSS must work for one to six cards because the count is now editable. No inline `<style>` (CSP): everything moves into `home.css`, scoped under `.dp-home`. Fix the mobile bug: remove the roughly 300px of empty purple above the hero title and use the hero spacing of `research/design/homepage-design-mobile.webp` (deviation `D-11`). The carousel's "All Sefaria-Powered Projects" button and the docs page's CTA now point to `/powered-by`.

Discord buttons (brief §4.7, `I-3`): text only, no logo; link to `developer.common.discord_signup.url`, opening in a new tab; primary style is `--action-primary` with `--text-inverse`, Roboto `en-system-body-strong`; focus ring `2px solid var(--functional-focus-blue)` with a 2px offset. The portal keeps its own copy of the three strings it needs, and a Vitest test asserts they equal the values in `static/js/sefaria/i18n/interface/en.json`.

**Must pass:** pytest `home_view_test`, `homepage_admin_test`; Vitest for `DiscordButton` (tokens, focus ring, `rel`), the analytics module (exactly one `page_view` per navigation; each key event and its parameters) and the string-sync test; Playwright `DEV-HOME-*`, `DEV-GA-*`, and one Discord test per placement; V-pixel for `P12` at all widths.

**Commit prefix:** `feat(devportal): phase 5`.

### Phase 6: the gallery

W12 does §2.14. **Must pass:** the 32 ported Vitest files; pytest `gallery_views_test` (301, 404, `noindex`, same-origin API); Playwright `DEV-GAL-*`, which re-expresses all 64 of the gallery's Playwright tests under the house rules, including its axe checks; existing `powered_by` tests green.

**Commit prefix:** `feat(devportal): phase 6`.

### Phase 7: the editor

W13 does §2.11, with W5 and W6 supporting the preview and publish endpoints. **Must pass:** Vitest `RT-1` and `RT-3` and the slash-menu and node-view tests; the pure pytest `roundtrip_test` (`RT-2`) and `editor_golden_test` (TipTap's HTML for the fixture corpus equals the Python renderer's); pytest `editor_api_test`, `permissions_test`, `revisions_test`, `publish_pipeline_test`, `upload_test`, `slug_redirect_test`; Playwright `DEV-EDIT-*`; V-security editor checks; a V-pixel comparison of the editor canvas against the public page for the same content.

**Commit prefix:** `feat(devportal): phase 7`.

### Phase 8: redirects, links elsewhere, CI and hardening

- **URL parity.** Run the crawl of §6.4 and add whatever it shows is missing.
- **Main-site links.** Everything must be correct both before and after the DNS cutover, so the gallery's new address is switched by the setting `DEVPORTAL_CUTOVER_DONE` (false by default, true on cauldrons). `sites/sefaria/urls.py:104-109`: `/wiki` → `<developers>/docs/welcome` and `/developers` → `<developers>`, where `<developers>` comes from `DOMAIN_MODULES` with `https://developers.sefaria.org` as the fallback (in production this is today's target); `/powered-by` → 301 to `<developers>/powered-by` when the setting is true and to today's `https://powered-by.sefaria.org` when it is false. `static/js/Header.jsx:233-238` and `:672` use `Sefaria.developersURL`. `static/js/StaticPages.jsx:1966,1968` use `Sefaria.developersURL`, and `:3288,3292` use `Sefaria.poweredByURL`. The i18n value `developer.common.powered_by_gallery.url` is a static string, so it changes in the retirement PR at cutover (§8.2), not here.
- **Tests that move.** `powered_by/tests/developer_routes_removed_test.py` (assert both values of `DEVPORTAL_CUTOVER_DONE` with `override_settings`). `e2e-tests/constants.ts` `EXTERNAL_URLS.DEVELOPERS` must match the configured developers host, not only production; check `library/header.spec.ts` (MOD-H006, tagged `@pr` by #4064), `User Menu/user-menu.spec.ts` (UMN-006) and `mobile web/hamburger-menu.spec.ts` (HAM-M002).
- **helm `helpURL`.** `helm-chart/sefaria/values.yaml:206` is `https://developers.sefaria.org/#`; the auth service appends words such as `rate_limited`. Leave the value, confirm the URL still answers 200, and ask the backend team which page it should point to (`H-5`).
- **Docs.** `docs/agent_docs/apps/devportal.md`, a row in `docs/agent_docs/apps/README.md`, a row in the `AGENTS.md` navigation table. Do not bump `docs/agent_docs/.stamp`.
- **Security.** Run `/security-review`; fix or record every finding; run the full V-security list.
- **Accessibility.** The axe suite over every page type (§6.6).
- **Not yet.** Do not delete `.github/workflows/readme-openapi-docs-sync.yml`. It is retired at cutover (§8.2).
- **PR.** A final full pass of all four verifiers on the integrated head, then the PR description: what was built, the deviations registry, the Spectral overrides, the open `H-n` items, the cutover runbook link.

**Must pass:** everything above, all earlier phases' tests, the whole of §6.

**Commit prefix:** `feat(devportal): phase 8`.

---

## 4. Agent orchestration

### 4.1 Dependency graph

What can start on day one, and what waits.

| Workstream                              | Can start                       | Waits for                                              | Lands in phase |
| --------------------------------------- | ------------------------------- | ------------------------------------------------------ | -------------- |
| W-INT Integrator: skeleton, contracts   | Immediately                     | Nothing                                                | 0              |
| W16 Infra and CI (Spectral first)       | Immediately                     | Nothing for Spectral; `C1` for the rest                | 0, 1           |
| W15 Visual baselines and parity harness | Immediately (capture from live) | Nothing for capture; `C6` for the local adapters       | 0 onward       |
| W12 Gallery port                        | Immediately                     | The package skeleton (step 0.2); Phase 1 to integrate  | 6              |
| W6 Content, import, publish             | Immediately (snapshot, parsing) | `C2` for models                                        | 2 (tree), 3    |
| W5 Markdown renderer                    | Immediately (live HTML study)   | `C4`                                                   | 3              |
| W4 Spec layer                           | Immediately                     | `C3`                                                   | 2              |
| W9 MCP server                           | Immediately (pure core)         | `C3`; W4's operation index                             | 4              |
| W14 Test harness and suites             | After step 0.4                  | `C6`, `C7`; each suite goes green as its feature lands | every phase    |
| W1 Host and shell backend               | After `C1`, `C10`               |                                                        | 1              |
| W2 Shell UI                             | After `C3`, `C5`, `C6`          | Works against fixtures until W1 and W4 land            | 1, 2, 4        |
| W3 Reference UI                         | After `C3`, `C5`, `C6`          | Works against fixtures and the spec file               | 2              |
| W7 Docs UI                              | After `C4`, `C5`                | W5's golden HTML                                       | 3              |
| W10 Search                              | After `C3`                      | W5's plain text, W4's index                            | 4              |
| W8 Agent surface                        | After `C3`, `C9`                | W5, W4, W6                                             | 4              |
| W11 Homepage, Discord, analytics        | After `C5`, `C8`                | Phase 1                                                | 5              |
| W13 Editor                              | After `C4` and W5's renderer    | W6's publish pipeline                                  | 7              |
| W17 Redirects and main-site links       | After Phase 4                   | The URL crawl                                          | 8              |

So on day one, after the skeleton exists, eight lanes run at once: W16, W15, W12, W6, W5, W4, W9 and the contract work. From the end of Phase 0, W1, W2, W3, W7, W14 join.

### 4.2 Builders: what each owns

A builder edits only the paths it owns. Shared files (everything in §2.15, `sefaria/**`, `e2e-tests/constants.ts`, `e2e-tests/utils.ts`, `e2e-tests/pages/pageManager.ts`, both Playwright configs, the root `package.json`, `devportal/urls.py`, `devportal/models/__init__.py`, `devportal/contracts/**`, `devportal-ui/package.json`, `devportal-ui/src/app/routes.tsx`) belong to the Integrator; a builder asks for a change with a note in `.devportal-run/inbox/W-INT.md`. Each file in `devportal/tests/` belongs to the workstream whose code it tests. A builder is done when its named tests pass **and** its verifier inbox has no open item.

**W1, Host and shell backend**

- Owns: `devportal/{middleware.py,security/,templatetags/,dev/}`, `devportal/views/{pages,api,errors}.py`, `devportal/admin/` except `homepage.py`, and every template under `devportal/templates/devportal/` that no other workstream owns.
- Reads: §2.2-2.5, `research/site/machine/robots.txt`.
- Done when: Phase 1 tests.

**W2, Shell UI**

- Owns: `devportal-ui/src/{app,shell,ui}/` except `routes.tsx`.
- Reads: `REFERENCE_SPEC.md` §1.1, 1.2, 1.4, 5; `research/reference/data/{sidebar-tree.txt,i18n-en.json,rm-custom-css.css}`; `research/reference/dom-outlines/`; `research/screenshots/{reference,site}/`.
- Done when: Phase 1, 2, 4 shell tests; V-pixel shell states.

**W3, Reference UI**

- Owns: `devportal-ui/src/reference/`, `devportal-ui/scripts/{build-spec,prerender}.ts`.
- Reads: `REFERENCE_SPEC.md` all; `research/reference/data/` all; `docs/openAPI.json`.
- Done when: Phase 2 Vitest; V-pixel `R` states; V-behavior A-F.

**W4, Spec layer**

- Owns: `devportal/spec/`, `devportal/views/reference.py`, `devportal/management/commands/devportal_sync_spec.py`, `devportal/templates/devportal/page_endpoint.html`.
- Reads: `docs/openAPI.json`; `research/reference/data/{get-v3-texts.live.md,sidebar-tree.txt}`; `research/notes/NOTES_reference_crawl.md`.
- Done when: Phase 2 pytest.

**W5, Markdown renderer**

- Owns: `devportal/markdown/`, `devportal/tests/pure/markdown_*`.
- Reads: `devportal/migration_source/`; `research/site/live-markdown/`; `research/site/pages.json`; `research/notes/NOTES_content_audit.md`; `research/screenshots/site/component-*`.
- Done when: Phase 3 pure pytest.

**W6, Content, import, publish**

- Owns: `devportal/models/` except `__init__.py`, `devportal/services/{publish,nav,images,seed}.py`, `devportal/tasks.py`, `devportal/management/commands/devportal_{import,mirror_images,rebuild,check_links,purge_e2e}.py`, `devportal/migration_source/`, `devportal/migrations/`.
- Reads: §7; `research/site/machine/sidebar-*.json`; `research/site/inventory_rows.md`.
- Done when: Phase 3 pytest; §6.3.

**W7, Docs UI**

- Owns: `devportal-ui/src/docs/`, `devportal-ui/src/styles/article.css`, `devportal/views/htmlblock.py`, `devportal/templates/devportal/{page_doc,htmlblock_frame}.html`.
- Reads: `SITE_ATLAS.md` §4; `research/site/root-css-vars-computed.json`; `research/screenshots/{site,site-pages}/`.
- Done when: Phase 3 Vitest; V-pixel `P01`-`P11`.

**W8, Agent surface**

- Owns: `devportal/services/{md_export,llms}.py`, `devportal/views/machine.py`.
- Reads: `research/site/machine/` all; `research/site/live-markdown/`; `static/llms.txt`.
- Done when: Phase 4 pytest.

**W9, MCP server**

- Owns: `devportal/mcp/`, `devportal/tests/mcp_*`.
- Reads: `research/site/machine/{mcp-tools-list.json,mcp-server-card.json}`; §2.10.
- Done when: MCP tests; V-security MCP checks.

**W10, Search**

- Owns: `devportal/services/search_index.py`, `devportal-ui/src/search/`.
- Reads: `SITE_ATLAS.md` §2 "Search"; `research/site/interact.json`; `research/screenshots/site/search-modal-*`, `reference/search_*`.
- Done when: Phase 4 search tests.

**W11, Homepage, Discord, analytics**

- Owns: `devportal-ui/src/{home,discord,analytics}/`, `devportal/models/homepage.py`, `devportal/templates/devportal/home.html`, `devportal/admin/homepage.py`.
- Reads: `research/site/{landing-custom.html,custom-css.css}`; `research/design/`; `research/notes/{NOTES_design_system_and_discord,NOTES_ga4}.md`; `research/screenshots/site/home-*`.
- Done when: Phase 5 tests; V-pixel `P12`.

**W12, Gallery port**

- Owns: `devportal-ui/src/gallery/`, `devportal-ui/public/gallery/`, `devportal/views/gallery.py`, `devportal/templates/devportal/gallery_*.html`, `e2e-tests/developers/gallery/`.
- Reads: The `Sefaria/powered-by` clone (its README and `docs/REDESIGN_SPEC.md`); `powered_by/` (read only); `research/screenshots/ux/poweredby-*`.
- Done when: Phase 6 tests.

**W13, Editor**

- Owns: `devportal-ui/src/editor/`, `devportal/views/editor_api.py`, `devportal/services/editor.py`, `devportal-ui/scripts/roundtrip-corpus.ts`.
- Reads: `research/notes/NOTES_editor_screenshot.md`; `C4`.
- Done when: Phase 7 tests.

**W14, Test harness and suites**

- Owns: `e2e-tests/developers/` except `gallery/`, `e2e-tests/pages/developers/`, `e2e-tests/mobile web/developers/`, `e2e-tests/feature-specs/steps/developers/`.
- Reads: The `.feature` files (read only); `e2e-tests/CLAUDE.md`; `e2e-tests/feature-specs/README.md`; `e2e-tests/full-testing-by-feature/Resource Panel/README.md` as the README template.
- Done when: Each phase's Playwright IDs; the BDD run is green.

**W15, Visual baselines and parity harness**

- Owns: `e2e-tests/developers-visual/`.
- Reads: `REFERENCE_SPEC.md` §6; Appendix B.
- Done when: Baselines committed; the suite runs; §6.1.

**W16, Infra and CI**

- Owns: `.github/workflows/{openapi-lint,devportal-visual}.yaml`, `docs/.spectral.yaml`, `helm-chart/**`, `envs/**`, `build/web/Dockerfile`, `.dockerignore` (through the Integrator's queue).
- Reads: §2.15.
- Done when: CI jobs green; chart tests green.

**W17, Redirects and main-site links**

- Owns: `e2e-tests/developers/redirects/`, and in Phase 8 only, the main-site files named there (the one exception to the shared-file rule; no other workstream edits them in that phase).
- Reads: `SITE_ATLAS.md` §6; `research/site/machine/{sitemap_urls.txt,llms_urls.txt}`; `research/ux/UX_BRIEF.md` §3.
- Done when: Phase 8 tests; §6.4.

### 4.3 Contracts settled before builders fan out

| ID  | Contract                           | Form                                                                                                                                                                                                                                                                                                                         |
| --- | ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C1  | Names, paths, settings             | §2.1 as a checked-in file, plus every `DEVPORTAL_*` setting with its default                                                                                                                                                                                                                                                 |
| C2  | Django models                      | §2.3.3 as real model code and the first migration                                                                                                                                                                                                                                                                            |
| C3  | JSON shapes                        | JSON Schema plus TypeScript types plus fixtures for: the page payload, the sidebar tree, the per-operation spec file, the search documents, the feedback request, and every editor API request and response                                                                                                                  |
| C4  | Markdown dialect and DOM           | `DIALECT.md`, one fixture per construct, and for each construct the exact HTML it renders to (tags, `dp-` classes, attributes)                                                                                                                                                                                               |
| C5  | Design tokens and CSS conventions  | The three token files, the `dp-` prefix rule, CSS Modules for components, the breakpoints                                                                                                                                                                                                                                    |
| C6  | Component names and accessibility  | The component inventory with each one's landmark, role and accessible name. Copy live's where it has them (`REFERENCE_SPEC.md` §5): `nav` "Primary navigation", `nav` "Secondary navigation", `main`, "Pagination Controls", "Try It!", "Copy Page", "Hide sidebar navigation", "Deprecated Endpoint", "Show subpages for X" |
| C7  | Page-object API and BDD vocabulary | Method signatures of every class in `e2e-tests/pages/developers/`, and the new shared sentences                                                                                                                                                                                                                              |
| C8  | Analytics events                   | Names and parameters (§2.13)                                                                                                                                                                                                                                                                                                 |
| C9  | URL map and redirects              | §2.4 as data                                                                                                                                                                                                                                                                                                                 |
| C10 | Security invariants                | The CSP string, the Try It `fetch` options, the `execute-request` rules, the sanitizer allow-list                                                                                                                                                                                                                            |

A contract changes only through the Integrator, who announces the change in every affected inbox.

### 4.4 Verifiers

Verifiers never edit product code or tests. They run, measure and report.

| Verifier   | Checks                                                                                                                                               | Trigger and frequency                                                                                                                                                                                                                                            |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| V-test     | Lint (Ruff, ESLint, Stylelint, Prettier), type check, Vitest, pure pytest, database pytest on the standalone settings, the root Jest run, Playwright | Fast tier (lint and the unit tests of the changed package, under 5 minutes) on every new commit of every builder branch. Full tier on every integration merge and at least hourly while builders are active. All browsers and mobile projects at every milestone |
| V-pixel    | The visual-parity suite against the committed baselines (§6.1)                                                                                       | The states mapped to the changed directory, on every builder commit that touches `devportal-ui/src/**` styles or components or `devportal/templates/`. The whole suite on every integration merge                                                                |
| V-behavior | The interaction checklists (§6.2), walking live and the local build side by side                                                                     | When a builder marks an area ready, after each fix round, and in full at every milestone                                                                                                                                                                         |
| V-security | §6.7                                                                                                                                                 | Every integration merge, and every builder commit that touches `reference/tryit/`, `devportal/mcp/`, `devportal/security/`, `devportal/markdown/sanitize.py`, `devportal/views/editor_api.py` or `devportal/views/htmlblock.py`                                  |

**How reports reach builders.** Each run writes `.devportal-run/reports/<verifier>/<UTC time>-<commit>.md`. Each failure becomes one entry appended to the owning builder's inbox, `.devportal-run/inbox/W<n>.md`, in this form:

```
## PX-0142 | open | 2026-11-20T14:02Z | commit abc1234
where:    state v3_schema_expanded, viewport 1280, region param-card
measured: 2.4% of pixels differ (limit 1.0%); region is 3px lower than baseline
evidence: .devportal-run/reports/V-pixel/20261120T1402Z-abc1234/v3_schema_expanded-1280-diff.png
hint:     row padding should be 11px (computed-get-v3-texts.json); found 14px
```

Prefixes: `PX` pixel, `TS` test, `BH` behavior, `SE` security. A builder reads its inbox at the start of every work loop, fixes, and writes `fixed in <commit>` under the entry. Only the verifier that opened an entry closes it, after re-running. The Integrator keeps `.devportal-run/STATUS.md`: open counts per workstream and per verifier, and the current milestone.

### 4.5 Loop and escalation rules

1. A builder is not done while any entry in its inbox is open.
2. **Retry limit.** At most five fix attempts per entry. If the measured gap has not shrunk after two consecutive attempts, or five attempts are used up, the builder hands the entry to the Integrator with what it tried.
3. The Integrator may reassign it or pair a second builder on it for three more attempts.
4. After that, the Integrator escalates to the product owner with the evidence and a proposed deviation or change (§10.3).
5. **Escalate at once, without retries,** when closing the gap would mean: editing a `.feature` file; re-opening a decision in the brief; adding a deviation that does not trace to the brief or to §1.3; weakening a security rule in `C10`; or needing credentials or infrastructure the agents do not have.
6. A verifier that finds live has changed since the baselines were captured stops and tells the Integrator; baselines are never re-captured silently.
7. Nobody makes a test pass by loosening a threshold, regenerating a golden, masking a region, skipping a test or adding a deviation on their own. Each of those is the Integrator's decision and is written into the PR description.

### 4.6 Integration cadence

- **Worktrees.** Each builder works in its own git worktree on a local branch `w<n>/<topic>` cut from the PR branch. These branches are not pushed (push only the PR branch unless the product owner allows more).
- **Hand-off.** The builder rebases its private branch onto the PR branch's head, runs its own tests, and writes `.devportal-run/handoff/W<n>-<seq>.md` naming the commits and the tests it ran.
- **Merge queue.** The Integrator takes one hand-off at a time: `git merge --squash`, one commit named `feat(devportal): phase <p>, <what> (W<n>) [sc-48158]`, then the full tier of V-test, V-security, and the whole V-pixel suite on the result. Green: push. Red: drop the local commit and return it to the builder with the report.
- **Order inside a phase:** models and contracts, then Python services and views, then UI, then tests, then infrastructure.
- **Frequency.** Every active builder hands off at least twice a day, so branches never drift far.
- **`.feature` commits** arrive on the PR branch from the product owner. The Integrator pulls them with `git merge`, never rebases the PR branch, and never squashes them. Builder branches never contain them as their own changes.
- **Master.** Merge `origin/master` into the PR branch at the start of each phase and before the final pass.
- **Cauldron.** Updated at M1 (Phase 1), M2 (Phases 2 and 3), M3 (Phases 4 to 6), M4 (Phase 7) and M5 (Phase 8). After each update the Integrator posts what is new and what to look at.

### 4.7 Sizing

These are estimates, not commitments. They assume agents run continuously, `H-1` is answered within a working day, and the pixel loop on the reference converges without a structural rework.

| Phase | Builders at once                              | Verifiers                   | Expected wall-clock                          |
| ----- | --------------------------------------------- | --------------------------- | -------------------------------------------- |
| 0     | Integrator + 2 on contracts; 7 day-one lanes  | V-test                      | 4 to 8 hours                                 |
| 1     | 4 (W1, W2, W14, W16) plus the day-one lanes   | V-test, V-pixel, V-security | 6 to 10 hours                                |
| 2     | 5 (W2, W3, W4, W14, W15)                      | all four                    | 2 to 4 days; the pixel loop is the long pole |
| 3     | 4 (W5, W6, W7, W14), in parallel with Phase 2 | all four                    | 1.5 to 3 days                                |
| 4     | 5 (W8, W9, W10, W2, W14)                      | all four                    | 1 to 2 days                                  |
| 5     | 2 (W11, W14)                                  | all four                    | 1 to 1.5 days                                |
| 6     | 1 (W12), running since day one                | V-test                      | 1 to 2 days of work; integrates in an hour   |
| 7     | 2 to 3 (W13 split into tree, canvas, API)     | V-test, V-security, V-pixel | 4 to 6 days, starting on about day 2         |
| 8     | 3 (W17, W14, Integrator)                      | all four                    | 1.5 to 2.5 days                              |

Peak load is about ten builders and four verifiers. In calendar terms: M1 on working day 2; the read-only portal (M3) around day 6 to 8; the editor (M4) around day 9 to 11; the PR ready (M5) around day 11 to 14. With work starting on 2026-11-18, that puts M1 near 19 November, M3 near 25-27 November and M5 near 2-7 December.

---

## 5. Test plan

### 5.1 Layers and where they run

| Layer                                                   | Tool                                            | Runs in                                                                     | Blocks a merge?                    |
| ------------------------------------------------------- | ----------------------------------------------- | --------------------------------------------------------------------------- | ---------------------------------- |
| Portal unit and component tests                         | Vitest, Testing Library, `vitest-axe`           | `continuous.yaml` job `devportal-ui`                                        | Yes                                |
| Pure Python tests, goldens, round trip, MCP conformance | pytest without Django, plus Node for the corpus | `continuous.yaml` job `devportal-pure`                                      | Yes                                |
| Database-backed Python tests                            | pytest-django                                   | The existing sandbox pytest job, with `./devportal` added                   | Yes                                |
| Product's behavior stories                              | `playwright-bdd` 9.2.1, `chrome-bdd` projects   | #4064's `e2e-job` on every PR sandbox                                       | Yes                                |
| Core journeys tagged `@pr`                              | Playwright `chrome-pr`                          | #4064's `e2e-job`                                                           | Warns until `E2E_PR_BLOCKING=true` |
| Full portal suites                                      | Playwright `*-developers` projects              | V-test locally; the merge-queue run when the host is reachable there (DC-3) | In the merge queue, once reachable |
| Visual parity                                           | Playwright, its own config                      | V-pixel locally; `devportal-visual.yaml` on demand and nightly              | No                                 |
| Existing Jest, pytest, lint                             | unchanged                                       | unchanged                                                                   | Yes                                |

### 5.2 Playwright

#### 5.2.1 The third host in the harness

| File                                                   | Change                                                                                                                                                                                                                                                                                                                    |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `e2e-tests/constants.ts`                               | `MODULE_URLS.EN.DEVELOPERS` and `MODULE_URLS.HE.DEVELOPERS` (same value; the portal is English only). Resolution order: `E2E_DEVELOPERS_URL`; for a local `SANDBOX_URL`, the `developers.` local base; otherwise `https://developers.${SANDBOX_DOMAIN}`. Add `'developers'` to `ModuleType`                               |
| `playwright.config.ts`                                 | The same resolution in its own `MODULE_URLS` block. Projects `chrome-developers`, `firefox-developers`, `safari-developers` with `testDir: './e2e-tests/developers'`, registered only when `E2E_DEVELOPERS_URL` is set or `SANDBOX_URL` is a `localhost` or public hostname rather than an in-cluster service name (DC-3) |
| `playwright.mobileweb.config.ts`                       | The URL resolution (this file has no overrides today). Projects `chrome-mobile-developers` (Pixel 5) and `safari-mobile-developers` (iPhone 13) matching `developers/**`; add `testIgnore: '**/developers/**'` to the three existing mobile projects                                                                      |
| `playwright.devportal-visual.config.ts` (new)          | §6.1. A separate config, so that the default `npx playwright test` of the merge queue never runs visual tests                                                                                                                                                                                                             |
| `.github/workflows/continuous.yaml` (`e2e-job`, #4064) | Add `E2E_DEVELOPERS_URL=https://developers.$host`                                                                                                                                                                                                                                                                         |
| `e2e-tests/feature-specs/steps/fixtures.ts`            | `Module` gains `'Developers'` and `urlFor` handles it; `Who` gains `'staff'`, which uses the `enAdmin` profile                                                                                                                                                                                                            |
| `e2e-tests/feature-specs/steps/common.steps.ts`        | Accept "Developers" in `When I open the {word} page {string}`; add `Given I am logged in as staff`                                                                                                                                                                                                                        |
| `e2e-tests/feature-specs/STEP-VOCABULARY.md`           | Document both additions. These three files are not locked; only `features/` and `feature-specs/CLAUDE.md` are                                                                                                                                                                                                             |
| `e2e-tests/utils.ts`                                   | `getModuleFromUrl` recognises the developers host                                                                                                                                                                                                                                                                         |
| `e2e-tests/pages/pageManager.ts`                       | Mount the new page objects: `onDevelopersShell()`, `onDevelopersHome()`, `onDevelopersDocs()`, `onDevelopersReference()`, `onDevelopersTryIt()`, `onDevelopersSearch()`, `onDevelopersCopyPage()`, `onDevelopersGallery()`, `onDevelopersEditor()`                                                                        |
| `e2e-tests/CLAUDE.md`                                  | §1 and the §7 table mention the third module                                                                                                                                                                                                                                                                              |
| root `package.json`                                    | `@axe-core/playwright` as a dev dependency                                                                                                                                                                                                                                                                                |

#### 5.2.2 Suites and IDs

One folder per area under `e2e-tests/developers/`, each with a README that follows the Resource Panel README: purpose, how to run, and a table of IDs. Titles are `'<ID>: <description>'`. Describe strings are `'Developers <Area>, English'`.

| Folder       | Prefix                | Covers                                                                                                                                                                    | Phase |
| ------------ | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| `shell/`     | `DEV-HDR-`            | Header links and targets, active tab, links menu, search field and key hint, skip link, mobile drawer and sub-nav, 404 page                                               | 1     |
| `reference/` | `DEV-REF-`            | Every interaction of brief §4.3 outside Try It: sidebar, parameters, responses, code samples, anchors, tags popover, prev/next, "Updated", feedback, Cmd-/                | 2     |
| `try-it/`    | `DEV-TRY-`            | The Try It flow, success and error, POST with a body, the response panel, the Headers modal, Recent Requests                                                              | 2     |
| `docs/`      | `DEV-DOC-`            | Each component of §2.6 on a real page, TOC and scroll spy, anchors, lightbox, RTL page, hidden and deprecated pages, link pages                                           | 3     |
| `forms/`     | `DEV-FORM-`           | The contact page frame and links, the submission-form links, with Formstack requests intercepted                                                                          | 3     |
| `search/`    | `DEV-SRCH-`           | Open by key and by click, tabs and counts, badges, paging, keyboard, empty state                                                                                          | 4     |
| `agent/`     | `DEV-AI-`, `DEV-MCP-` | `.md` URLs, `Accept` negotiation, the `llms` files, `Link` headers, discovery files, the hidden banner, each Copy Page action, MCP `initialize` and `tools/list`          | 4     |
| `home/`      | `DEV-HOME-`           | Hero, carousel (radio controls), six tiles and targets, newsletter link, the community band, the mobile hero spacing                                                      | 5     |
| `analytics/` | `DEV-GA-`             | One `page_view` per navigation; each key event with its parameters, read from intercepted `**/g/collect*` requests; document titles                                       | 5     |
| `gallery/`   | `DEV-GAL-`            | Every gallery behavior (brief §4.8)                                                                                                                                       | 6     |
| `editor/`    | `DEV-EDIT-`           | Tree, drag reorder, new page and child, every block through the slash menu, settings, overlay fields, revisions and restore, draft and publish, upload, permission denial | 7     |
| `redirects/` | `DEV-RDR-`            | The redirect table and the URL-parity crawl (§6.4)                                                                                                                        | 8     |
| `a11y/`      | `DEV-A11Y-`           | axe on every page type and on open menus and modals; keyboard paths                                                                                                       | 2-8   |
| `security/`  | `DEV-SEC-`            | §6.7 items that need a browser                                                                                                                                            | 1-8   |

Discord placements are tested where they live: `DEV-HOME` (two), `DEV-DOC` (sidebar footer, page end), `DEV-REF` (request panel), `DEV-FORM` (contact page); each test also asserts the `discord_cta_click` event and its `placement`.

House rules from `e2e-tests/CLAUDE.md` apply without exception: page objects extend `HelperBase` and are reached through `PageManager`; every timeout goes through `t()`; the first navigation uses `goToPageWithLang` or `goToPageWithUser`; locators prefer role, then label, then text, then test id, then CSS; no `waitForTimeout` to wait for state; tests adapt to the data rather than `test.skip`; destructive requests are intercepted with `page.route`; everything passes at full parallelism; no `__research__.spec.ts` is committed.

**Writes.** Sandboxes share one database (F-15). Tests tagged `@pr`, and all BDD steps, never write: they intercept editor saves and publishes, the feedback POST and anything bound for Formstack. The `editor/` suite's real-write tests run only in the `*-developers` projects, create hidden pages whose slugs start with `e2e-<run id>-`, and delete them in `afterEach`; `devportal_purge_e2e` removes any left behind after a day.

#### 5.2.3 Tags

Read-only, English-only core journeys carry `{ tag: ['@sanity', '@pr'] }`:

| ID             | Journey                                                                                       |
| -------------- | --------------------------------------------------------------------------------------------- |
| `DEV-HOME-001` | The homepage loads with its hero title and six tiles                                          |
| `DEV-DOC-001`  | `/docs/welcome` renders its title, a callout and the sidebar                                  |
| `DEV-REF-001`  | `/reference/get-v3-texts` renders its title, method badge, parameters and the request panel   |
| `DEV-TRY-001`  | Try It on `get-v3-texts` with `Genesis 1:1` shows status 200 and JSON                         |
| `DEV-SRCH-001` | Cmd/Ctrl-K opens search; a query returns results in the Docs and API Reference tabs           |
| `DEV-AI-001`   | `/docs/welcome.md` returns Markdown with front matter                                         |
| `DEV-AI-002`   | `/llms.txt` lists the docs and reference sections                                             |
| `DEV-GAL-001`  | The gallery lists projects and a filter narrows them                                          |
| `DEV-GAL-002`  | A project page opens from the gallery; an unknown id is a 404                                 |
| `DEV-RDR-001`  | `/docs`, `/reference`, `/docs/getting-started` and `/v1.0/docs/welcome` redirect as specified |

`DEV-TRY-001` calls the production API from CI, as the brief asks. Everything else in the mobile projects that is read-only carries `@sanity`.

### 5.3 pytest

Files live in `devportal/tests/` (database) and `devportal/tests/pure/` (no Django), named `*_test.py`.

- **Host and quarantine.** `host_routing_test`: each configured host resolves to its URLconf; a language without Voices no longer breaks `hosts.py`. `module_quarantine_test`: every pattern in `urls_developers` resolves to a view in `devportal`, `powered_by.views` or the health view; `base_props` returns exactly the `library` and `voices` keys under each language plus `developersURL`; `_known_domain_hostnames()` excludes the developers host; a portal response has `Content-Language: en`. `isolation_test`.
- **Models.** Slug uniqueness per section; tree depth and parent-kind rules; draft, publish and restore semantics; soft delete.
- **Import.** §7.5.
- **Markdown (pure).** One golden per construct; the sanitizer's allow-list and a list of hostile inputs; heading ids; link resolution; plain text.
- **Parity with live data.** Titles, excerpts, TOC entries and prev/next for the 60 visible docs pages equal `research/site/pages.json`; the sidebar trees equal `research/site/machine/sidebar-{docs,reference,custom_pages}.json`.
- **Spec and overlay.** Phase 2 list; overlay precedence; `devportal_sync_spec` with an added and a removed operation.
- **Agent surface.** Phase 4 list.
- **MCP.** `mcp_tools_list_test` (names, titles and input schemas equal the captured file); `mcp_execute_lock_test` (a table of hostile requests, each rejected before any network call: other hosts, look-alike hosts, `user@host` forms, plain `http`, IP literals, `localhost`, the metadata address, encoded dot segments, a method or path not in the spec, an oversized body, header injection; and an upstream redirect that is not followed); `mcp_ratelimit_test`; `mcp_conformance_test` (the official SDK client completes `initialize`, `tools/list` and one call of each tool).
- **Editor.** Phase 7 list. `permissions_test` walks every `/_portal/editor/` route as anonymous (401), non-staff (403) and without a CSRF token (403).
- **Round trip (pure).** `RT-2`.
- **Security.** `csp_test` (the exact policy; a nonce on every script tag; no inline style on public templates); `no_cookie_test` (anonymous GETs of every public route set no cookie); `htmlblock_frame_test` (sandbox attribute and the frame's own CSP).
- **Gallery, homepage, 404.** Phase 5, 6 lists; `notfound_log_test`; `redirect_table_test`.

Tests that need the database follow the repo's two existing styles (`@pytest.mark.django_db`, or `TestCase` with `databases = "__all__"`). CI reuses its database (`--reuse-db`), so seed rows inside tests or fixtures, as `powered_by/tests/conftest.py` does. `sefaria/conftest.py` removes the `vector_db` alias only when `./sefaria` is collected; `devportal/tests/conftest.py` must do the same so the suite also runs alone.

### 5.4 Behaviors for the product owner's `.feature` stories

Agents do not write these. This list is for the product owner to draft from with the `write-feature-spec` skill, committing only `.feature` files to this branch under `e2e-tests/feature-specs/features/developers/`. CI then generates step stubs, and W14 binds them, working from red to green. The stories should arrive by the end of Phase 1; W14 can bind steps for an area as soon as its story exists.

Two constraints to keep in mind while writing: scenarios run on every PR's sandbox, which shares its database with all others, so they must not depend on content that an editor might change, and editing scenarios will have their saves intercepted; and scenarios run on the English site only.

| Area               | Behaviors worth a scenario each                                                                                                                                                                                                                                                                                                                                                                               |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Try It             | A visitor fills in a text reference and runs the request, and sees a successful status and the returned text. A reference that does not exist shows an error status and the error message. A request that needs a body can be filled in and sent. A request the visitor ran appears in their recent requests                                                                                                  |
| Copy Page          | A visitor copies a page as Markdown. A visitor opens the Markdown version of a page. The menu offers opening the page in ChatGPT and in Claude. The menu offers the MCP connection options. All of this is available on a docs page and on an API reference page                                                                                                                                              |
| Editing            | Someone who is not staff cannot reach the editor. A staff member edits a page and saves a draft, and visitors still see the published version. A staff member publishes and visitors see the change. A staff member restores an earlier revision. A staff member changes an endpoint's title and description without changing the API definition. A staff member adds a page under another and reorders pages |
| Search             | A visitor opens search with the keyboard shortcut. Typing shows results grouped under All, Docs, API Reference and Pages with counts. API results show their method. Choosing a result opens that page. A visitor can move through results with the keyboard                                                                                                                                                  |
| Gallery            | A visitor sees the projects. Searching narrows them. Choosing two values in one filter shows projects matching either; choosing values in two filters shows projects matching both. Projects with known issues are hidden until the visitor asks for them. Sorting and the grid/list choice are kept in the address. A project has its own page; an unknown project shows "not found"                         |
| Discord            | Each of the six places shows a "join" button that leads to the signup form: the homepage hero, the homepage community band, the sidebar footer, the end of a docs page, the request panel of an endpoint, and the contact page                                                                                                                                                                                |
| Reading (optional) | A docs page shows its title, table of contents and previous/next links. An endpoint page shows its parameters and a sample request. The old addresses still work                                                                                                                                                                                                                                              |

### 5.5 How this fits PR #4064's CI

- The BDD run (`npm run test:bdd`) blocks merges on every PR, so once this PR merges, every PR's sandbox must serve the portal with content. That is why the developers module goes into the chart's default values and why content is seeded automatically (§7.6).
- `chrome-pr` picks up the ten `@pr` tests by tag; nothing else is needed for them.
- The spec lock (`feature-spec-lock.yaml`) checks every commit that touches a locked path against `SPEC_EDITORS`. It passes as long as only the product owner's own commits touch `.feature` files, which the rules in §0 and §4.6 guarantee.
- The Claude Code hook (`.claude/hooks/guard-feature-specs.sh`) blocks agent writes to locked paths. Agents must not set `SEFARIA_SPEC_EDITOR`.
- If #4064 changes before it lands, re-merge its branch and adapt; the portal's tests depend only on its documented conventions.

---

## 6. Verification loops

### 6.1 Pixel parity

#### 6.1.1 Setup

`playwright.devportal-visual.config.ts`: `testDir: './e2e-tests/developers-visual'`; five Chromium projects, `visual-1440` (1440×900), `visual-1280` (1280×800), `visual-1024` (1024×768), `visual-768` (768×1024), `visual-390` (390×844); `deviceScaleFactor: 1`; `snapshotPathTemplate` pointing at `e2e-tests/developers-visual/baselines/roboto/{arg}-{projectName}.png`; `toHaveScreenshot` with `animations: 'disabled'`, `caret: 'hide'`, `scale: 'css'`.

Rendering depends on the browser build and the installed fonts. W15 records the environment in `baselines/ENV.json` (Playwright version, Chromium revision, operating system image, a hash of the font list). V-pixel refuses to run in an environment whose fingerprint differs. The `devportal-visual.yaml` workflow uses the same container image.

#### 6.1.2 States and adapters

Each state is one entry in `e2e-tests/developers-visual/states.ts`: an id, a path, the widths it applies to, the regions to compare, and a recipe written against an adapter interface (`openCopyPageMenu()`, `expandResponseSchema()`, `selectLanguage('node')`, …). There are two adapters. The **live adapter** drives ReadMe's DOM. The **local adapter** drives the portal through the page objects. The recipe is the same for both, which is what makes the two screenshots comparable.

Network calls made by Try It are fulfilled from recorded responses on both sides (`research/reference/data/interaction-network-log.json`: the Genesis 1:1 success, the `Notabook 99` 404, the find-refs 202). On live that means intercepting `https://try.readme.io/**`. No capture sends a request to the Sefaria API or a POST to live.

Appendix B lists every state.

#### 6.1.3 Baselines

`capture/capture-live.ts` runs every state through the live adapter twice and commits the results:

- `baselines/raw/`: live as it is, JPEG quality 90. A record of what ReadMe looked like; nothing is compared against it.
- `baselines/roboto/`: live with Roboto and Heebo injected, PNG, optimized. The comparison target. Injection sets ReadMe's `--font-family` variable and the homepage's font families to the design system's stack, serves the font files by route interception, and waits for `document.fonts.ready`. Monospace is not overridden on either side.
- `baselines/roboto/*.metrics.json`: from the same run, the bounding box and computed styles of every mapped element, per state and width. Gates 1 and 2 below compare against these files.

Capture starts in Phase 0 and must be finished and committed before Phase 2 is merged. It can be re-run until ReadMe is cancelled; after that the committed files are the only record, so the PR description must state the capture date and the ReadMe deploy version (`5.968.3` at research time; re-read it at capture).

#### 6.1.4 What passes

Three gates per state and width, in this order, because the first two are exact and tell a builder what to fix:

1. **Computed styles.** For each mapped element (start from the roughly 50 selectors in `research/reference/data/computed-get-v3-texts.json`), the portal element has the same font size, weight, line height, color, background, padding, margin, border and radius as the metrics file records. Font family is exempt (Roboto).
2. **Geometry.** The bounding box of each mapped element is within 0.5px of the one the metrics file records.
3. **Pixels.** Per region (header, sidebar, headline, parameter card, response accordion, request card, response card, page footer, each open menu or modal): at most 1.0% of pixels differ at a per-pixel color threshold of 0.2. Per viewport: at most 0.5%.

Dynamic content is masked identically on both sides: "Updated N ago", the time cell of Recent Requests, third-party frames.

#### 6.1.5 Registered deviations

`e2e-tests/developers-visual/deviations.ts` is the only place a known difference may be declared. Each entry has an id, the reason with its source, the states it affects, and the exact region it masks or the alternative assertion it uses. The initial entries:

| ID   | Difference                                                                                      | Source           |
| ---- | ----------------------------------------------------------------------------------------------- | ---------------- |
| D-1  | Roboto and Heebo instead of the system font (handled by the Roboto baselines, not by masking)   | Brief §4.3       |
| D-2  | The sidebar footer shows the Discord button instead of "Powered by ReadMe"                      | Brief §4.7, I-12 |
| D-3  | "Questions about this endpoint?" with a Discord button in the request panel                     | Brief §4.7       |
| D-4  | Node's library menu has three entries and defaults to fetch; no "Metadata" relabel              | Brief §4.3       |
| D-5  | No colored dots on the first three Copy Page menu items                                         | Brief §4.3       |
| D-6  | "Log in to see full request history" is absent                                                  | I-12             |
| D-7  | Discord button at the end of docs pages, next to the feedback widget                            | Brief §4.7       |
| D-8  | The Headers modal lists fewer response headers                                                  | F-8              |
| D-9  | Search results differ in order; only the modal's frame, tabs and result-row layout are compared | I-13             |
| D-10 | Homepage: the Discord button in the hero and the community band                                 | Brief §4.7, I-3  |
| D-11 | Mobile homepage: hero spacing from the mobile design instead of live's 300px gap                | Brief §4.1       |
| D-12 | HTML blocks render inside a frame; compared as a region with a 2% limit                         | Brief §5         |

An agent may add an entry only if it traces to the brief or to §1.3. Anything else goes to the product owner.

#### 6.1.6 The loop

V-pixel runs as §4.4 says and files `PX` entries. Builders fix and V-pixel re-runs until the state is green, under the retry and escalation rules of §4.5. A phase does not merge with an open `PX` entry for its states.

### 6.2 Behavior parity

V-behavior walks these checklists on live and on the local build side by side and files a `BH` entry for each difference that is not a registered deviation. Every line also has at least one Playwright test in the suite named in brackets.

**A. Reference layout and sidebar** [`DEV-REF`]

- The sidebar is 288px wide and stays in place while the article scrolls.
- On load, only the group containing the current page is open; other groups open and close on click; both "Index" groups exist with their own children.
- Section headings ("WELCOME", "SEFARIA API") are uppercase; method pills sit at the right; `get-v1-texts` and `get-topic-slug` show the deprecated icon.
- The filter narrows the tree as you type; Cmd-/ or Ctrl-/ focuses it.
- The collapse control hides the sidebar; the choice survives a reload.
- At 1066-1299 the article narrows, to 292px at 1070; at 1065 and below the playground moves under the article; at 768 and below the mobile header and sidebar dropdown replace the sidebar.

**B. Parameters** [`DEV-REF`]

- A text input shows the first example as its placeholder and is prefilled with the default.
- An enum shows a select and "Allowed:" chips; clicking a chip copies its value and shows "Copy"/"Copied!"; it does not change the select.
- Labels show the type, "required" in red, and "Defaults to X".
- An input with examples opens a list of "Use example value" entries on focus.
- An object body parameter expands with "+" to its fields (`text` → `body`, `title` on find-refs).
- Each parameter has an anchor such as `#query-params-<name>`; the section anchors `#path-params`, `#query-params`, `#body-params`, `#response-schemas` exist.
- Clicking a `{placeholder}` chip in the URL line focuses its input; typing replaces the chip's text; the code sample updates as you type.

**C. Responses** [`DEV-REF`]

- The heading reads "Response" for one status code and "Responses" for several.
- Each status is an accordion, collapsed on load, with a colored dot, the code and the description.
- Expanded: "RESPONSE BODY", the type, and nested properties; arrays of objects in sub-cards; union types with a select; nested arrays behind an expander that closes with ✕.
- The response panel shows the first example ("200 - Esther 1.1") on load; the status dropdown lists the examples and "Clear Example"; after clearing, the empty state with the example chips appears.

**D. Code samples** [`DEV-REF`]

- Shell is selected on load; the five language buttons and the "⋯" menu with its 18 entries are present, with icons.
- The request card's header button opens the library menu for the language.
- The chosen language and library survive a reload.
- The copy button copies the sample and shows "Copied!".
- POST pages show an "Examples" dropdown of request bodies.

**E. Try It** [`DEV-TRY`]

- Clicking Try It shows a loading state, then the status with a colored dot (green for 200, red for 404), "Headers", a copy button, and the JSON with line numbers and fold markers.
- The status dropdown lists the examples and "Clear Response".
- "Headers" opens a modal with RESPONSE and REQUEST sections and a Close button.
- The request fires even when required fields are empty.
- A new row appears at once in Recent Requests ("Less than a minute ago", status); clicking a row selects it; the list survives a reload in the same browser and is empty in another.
- The Try It button is `#612854` and turns blue on hover.
- No elapsed time is shown.

**F. Page chrome** [`DEV-REF`, `DEV-DOC`]

- The tag button next to the title opens a popover naming the operation's tag.
- "Updated N ago" shows a relative time.
- Prev/next follow the flattened sidebar order and skip group rows and external link items.
- "Did this page help you?" with Yes and No; either opens a comment box and a "Vote" button; voting stores the answer.

**G. Docs pages** [`DEV-DOC`]

- Three columns; the right column holds Copy Page and the table of contents with the current section marked while scrolling.
- Headings show an anchor link on hover.
- Code blocks have a copy button; titled or labelled blocks show their tab label.
- Images open a lightbox; framed and captioned images render as on live.
- Callouts show their emoji and theme color.
- The Hebrew page reads right to left.
- A link item in the sidebar shows the external arrow and opens its target in a new tab.
- On mobile the table of contents is hidden and the sidebar becomes the dropdown under the header.

**H. Search** [`DEV-SRCH`]: the items of §2.9.

**I. Agent surface** [`DEV-AI`, `DEV-MCP`]

- Every page answers at `<path>.md` with `text/markdown`; the same page answers Markdown to `Accept: text/markdown`, with `Vary: Accept`.
- An endpoint's `.md` ends with the OpenAPI slice for that endpoint.
- `/llms.txt`, `/docs/llms.txt`, `/reference/llms.txt` have live's structure; `/llms-full.txt` exists.
- Every page sends the five `Link` relations; the four discovery files answer with live's content types.
- The hidden "For AI agents" banner is the first content in `<body>`.
- `/openapi/sefaria-api.json` returns the spec.
- A plain GET of `/mcp` shows the notice; an MCP client can list the four tools.
- Each of the eight Copy Page actions does what live's does.

### 6.3 Migration

All run as pytest (§7.5) and again by `devportal_check_links` on the cauldron's real data:

- All 152 source files import; the report lists each with its section, kind, slug and flags.
- Every published page renders without error; hidden, deprecated and link flags equal the source's.
- Every internal link resolves to a page or to a deliberate external target; the fixes of §7.4 are applied; nothing links to `files.readme.io` after the mirror step.
- The editor round trip holds for every file (`RT-1`, `RT-2`).
- Sidebar order equals live's sidebar files.

### 6.4 URL parity

`e2e-tests/developers/redirects/url-parity.spec.ts` reads a committed list, `e2e-tests/developers/redirects/live-urls.json`, built once by W17 from `research/site/machine/sitemap_urls.txt` (129 URLs), `llms_urls.txt`, the `.md` variant of each, the machine endpoints of `SITE_ATLAS.md` §1.3, the redirect table of §6 there, the 30 URLs in `static/llms.txt`, and the hidden pages' URLs with the status live returns for each (one GET per URL against live, recorded with the date). For every entry the portal must answer with the recorded status, and for redirects the recorded `Location`. Entries the atlas records as 404 on live stay 404, except `/llms-full.txt`, which now answers 200.

### 6.5 GA4

- `titles_parity_test` and `DEV-GA` assert `document.title` for every page in `research/site/pages.json` and for the endpoint pages (the spec summary).
- `DEV-GA` asserts, from intercepted collect requests: one `page_view` on load, one per client-side navigation, none duplicated; each key event with its parameters; no request to Google at all when `DEVPORTAL_GA4` is empty.
- On the cauldron, the product owner or analyst checks the events in GA4's DebugView with a test property (`H-7`).

### 6.6 Accessibility

`DEV-A11Y` runs `@axe-core/playwright` with the WCAG 2.0, 2.1 and 2.2 A and AA tags (the gallery's set) on: the homepage, a docs page, an endpoint page with each menu and modal open, the search modal, the contact page, the gallery list and a project page, the 404 page and the editor. Zero violations, with any exception listed in the suite's README with its reason. It also asserts: one `h1` per page; the landmarks of contract `C6`; the skip link; that every menu and modal can be opened, used and closed with the keyboard and returns focus; and that the response status dot has a text alternative. Component-level `vitest-axe` checks run in Vitest.

### 6.7 Security

V-security runs this list. Items marked (browser) are in `DEV-SEC`; the rest are pytest or Vitest.

| #    | Check                                                                                                                                                                                           |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S-1  | (browser) A Try It call carries no `Cookie` header, even when the browser holds a staff session cookie for the parent domain. Asserted from the intercepted request                             |
| S-2  | The Try It URL builder cannot produce a URL outside `<origin>/api/` for any parameter value. No element lets a visitor edit the origin                                                          |
| S-3  | (browser) A mocked API response containing `<script>` and `<img onerror>` is shown as text; nothing executes; the same for a `text/html` response                                               |
| S-4  | (browser) Every page type sends the exact CSP; a full interactive session of each page type produces no `securitypolicyviolation` event                                                         |
| S-5  | No server-side code path fetches a URL taken from a request, other than `execute-request`. Shown by a search of `devportal/` for HTTP client calls                                              |
| S-6  | `execute-request` rejects every case in `mcp_execute_lock_test` before any network call, follows no redirect, sends no cookie or credential, and is rate limited                                |
| S-7  | `/mcp` behaves identically with and without a staff session cookie                                                                                                                              |
| S-8  | Hostile Markdown (script tags, event handlers, `javascript:` links, `style` attributes, unknown components, nested HTML in callouts and table cells) renders with all of it removed             |
| S-9  | (browser) An HTML block containing a script and an event handler executes nothing; its frame has the sandbox attribute without `allow-scripts`; opening the frame URL directly executes nothing |
| S-10 | Every editor route: 401 anonymous, 403 non-staff, 403 without a CSRF token                                                                                                                      |
| S-11 | Upload rejects SVG, HTML, a file whose bytes do not decode as its claimed image type, and files over the limit; stored names are content-derived                                                |
| S-12 | Anonymous GETs of public routes set no cookie                                                                                                                                                   |
| S-13 | Recent Requests and analytics events contain no response bodies, parameter values or API keys; a visitor's own key never appears in a request to the developers host                            |
| S-14 | The feedback endpoint requires a CSRF token, limits length, and is rate limited per visitor                                                                                                     |
| S-15 | `/security-review` on the final branch reports nothing unaddressed                                                                                                                              |

### 6.8 Existing tests

On every integration merge V-test runs `npm run lint`, `npm run lint:py`, the root Jest run and the standalone pytest run; the sandbox pytest job and #4064's `e2e-job` run on every push. Outside the files named in §2.2, §2.15 and Phase 8, this PR changes nothing under `static/js/`, `static/css/`, `node/`, `templates/`, `reader/` or `sefaria/`; V-test checks that with a diff against master on every integration merge, and checks that `npm run build-prod` still succeeds.

---

## 7. The migration script

### 7.1 Source

The import reads the vendored snapshot in `devportal/migration_source/`: the `docs/`, `reference/`, `custom_pages/` and `custom_blocks/` trees of `Sefaria/developer-docs`, without `reference/sefaria-api.json` (its hash is recorded instead and checked against `docs/openAPI.json`), plus `SOURCE.json` with the repository, ref, commit and date. `python manage.py devportal_fetch_source --ref v1.0` replaces the snapshot with the current state of the upstream branch; a person or agent runs it and commits the result. A copy of live's three sidebar files (`research/site/machine/sidebar-*.json`) sits in `migration_source/live/`, because that is where ReadMe's `updatedAt` per page comes from; the fetch command refreshes them with three GET requests.

### 7.2 What `devportal_import` does

1. **Build the trees** from the `_order.yaml` files.
   - `docs/`: each top-level folder is a `category` (it has no `index.md`); its name is the title exactly as stored ("local installation"; CSS uppercases it). A folder with an `index.md` is a parent `page` whose slug is the folder name. Depth reaches category plus three levels.
   - `reference/`: three categories (`ReadMeConfig`, `welcome`, `Sefaria API`). Under `Sefaria API`, each folder is a `tag_group` whose slug is the folder name (so `index` and `index-1` stay separate) and whose title and excerpt come from its `index.md`. Each endpoint stub is an `endpoint` whose slug, filename and `api.operationId` must all be equal and must exist in `docs/openAPI.json`. The three `ReadMeConfig` stubs are `api_config` pages, hidden.
   - `custom_pages/`: four flat pages, including `contact-us.html`, whose body is stored as raw HTML in Markdown.
   - A file missing from its `_order.yaml` is appended at the end and reported.
2. **Read the front matter** into fields: `title`, `excerpt`, `hidden`, `deprecated`, `metadata`, `next`, `link`, `fullscreen`, `api_config`. The slug is never in the front matter; it is the filename or folder name. A page is a `link` only when `link.url` is non-empty (one page); the six pages with `link: {new_tab: false}` and no URL are ordinary pages.
3. **Rewrite internal links** in link destinations only (Markdown inline and reference links, and `href` in raw HTML), never in code, link text, autolinks or bare URLs: `doc:<slug>` → `/docs/<slug>`, `ref:<slug>` → `/reference/<slug>`, `page:<slug>` → `/page/<slug>`, and `https://developers.sefaria.org/<path>` → `/<path>`. The same for `next.pages[].slug`. Apply the fixes of §7.4. Nothing else in a body changes; bytes are otherwise preserved.
4. **Set `content_updated_at`** from the sidebar files; a page absent from them (hidden pages) gets the snapshot's commit date.
5. **Upsert**, keyed by section and slug, inside one transaction:
   - A page new in the source is created with a revision whose source is `import`, and published.
   - A page whose source changed, and which nobody has edited in the new editor since the last import, gets a new `import` revision and is published.
   - A page that has an `editor` or `restore` revision newer than its last import is **left alone** and reported as "kept local edits", with a diff. `--force <section>/<slug>` overrides this for one page.
   - A page that came from an import and is gone from the source is reported. `--prune` soft-deletes it if it was never edited locally.
   - Tree order is re-applied from the source for a section until the first tree change made in the editor for that section; after that the section's order is left alone and differences are reported.
6. **Finish:** `devportal_sync_spec`, then the publish pipeline for every changed page, then the artifacts, then the generation bump.
7. **Report:** counts by section and kind; created, updated, kept and missing pages; each link fix with its count; unresolved links; image URLs still pointing outside the media bucket; warnings. Printed, and stored as a `PortalArtifact`.

`--dry-run` does everything and rolls back. Running twice on the same snapshot changes nothing the second time.

### 7.3 Images

`devportal_mirror_images` finds every image URL in published content that is not in the media bucket: today 39 distinct `files.readme.io` URLs (34 PNG, 3 SVG, 2 JPEG) and one `i.imgur.com` URL. For each it downloads the file, checks that it decodes (or, for SVG, that it has no script, event-handler attribute or external reference), uploads it to `developers/<hash>-<name>`, and records a `MediaAsset` with the original URL. It then writes one new revision per affected page with the URLs replaced, and publishes it. `MediaAsset.source_url` is unique, so a second run does nothing.

The command needs Google Cloud credentials, which exist only in deployed pods. It is therefore also exposed as a staff-only action in the Django admin ("Mirror external images"), which runs it inline, or as a Celery task where workers exist. It must be run once per database: the shared development database, and production before cutover. Until it has run, `DEVPORTAL_ALLOW_README_IMAGES` keeps the original URLs loading.

### 7.4 Link fixes

Kept as data in `devportal/migration_source/link_fixes.yaml`: file, pattern, replacement, expected number of matches. The import fails if a fix does not match its expected count, so a change in the source is noticed.

| Broken target                                                                              | Where                                                                                    | Becomes                                                          |
| ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `doc:each-book-is-an-index`                                                                | `the-structure-of-a-text-on-sefaria/index.md:28` (and its `next.pages`), `welcome.md:46` | `/docs/index-and-versions`                                       |
| `doc:default-nodes`                                                                        | `the-index-schema/the-structure-of-a-complex-text.md:226`                                | `/docs/node-titles#<id of the "3. Default Nodes" heading>`       |
| `doc:the-schema-of-a-complex-text`                                                         | `Dev Digest Archive/september-2024.md:55`, `the-index-schema/node-titles.md:31`          | `/docs/the-structure-of-a-complex-text`                          |
| `doc:terms-for-internal-use`                                                               | `local installation/technical-notes/index.md:17`                                         | `/docs/term-creation`                                            |
| `ref:get_api-shape-title`                                                                  | `reference/welcome/tutorials/tutorial-tanakh-trivia-game.md:178,182,207,229`             | `/reference/get-shape`                                           |
| `ref:get_api-v3-texts-tref-1`                                                              | `reference/welcome/tutorials/tutorial-dvar-torah-outliner.md:299`                        | `/reference/get-v3-texts`                                        |
| `<doc: shape-api>`                                                                         | `TECHNICAL DOCS/api-wiki/index.md:34`                                                    | `/docs/shape-api`                                                |
| `/docs/the-schema-of-a-complex-text`, `/docs/the-schema-of-a-simple-text` (absolute links) | `Dev Digest Archive/june-2024.md:55`                                                     | `/docs/the-structure-of-a-complex-text`, `…-simple-text` (`I-7`) |
| `/update/docs/linker-v3` (absolute link)                                                   | `TECHNICAL DOCS/linker/linker-v2.md:15`                                                  | `/docs/linker-v3` (`I-7`)                                        |
| `](sefaria.org/texts)`                                                                     | `TECHNICAL DOCS/linker/linker-api.md:78`                                                 | `https://www.sefaria.org/texts` (`I-7`)                          |
| `next.pages` slugs `in-progress-alternate-structures`, `guide-to-contributing-1`           | `node-titles.md:16`, `general-faq.md:14`                                                 | `alternate-structures`, `guide-to-contributing` (`I-7`)          |
| `](🔗)`                                                                                    | `june-2024.md:79`, `linear-programming-topic-curation-and-api-tips.md:104`               | Left as is; reported to the product owner                        |

Line numbers are from commit `b661899`; match on content, not on line number.

### 7.5 Tests for the import (`devportal/tests/import_test.py` and neighbours)

- Counts: 152 files in; pages by section and kind equal F-2; 11 hidden, 1 deprecated, 1 link page; 61 endpoints, each with an `operationId` in the spec; 12 tag groups including `index` and `index-1`.
- Order: the flattened trees equal `research/site/machine/sidebar-{docs,reference,custom_pages}.json` for visible pages.
- Idempotence: a second run reports zero changes and creates no revision.
- Local edits: a page edited through the editor API is kept on re-import; `--force` replaces it.
- Changed source: editing a fixture file produces exactly one new revision on re-import.
- Link fixes: each applies its expected number of times; afterwards no `doc:`, `ref:` or `page:` destination remains and every internal destination resolves.
- Hebrew slugs and folder names with spaces import; the Hebrew page answers at its percent-encoded URL.
- Files with no newline after the closing front-matter fence parse.
- The mirror command, against a fake storage backend: 40 assets, URLs replaced, second run is a no-op, a hostile SVG is refused.
- `--dry-run` leaves the database unchanged.

### 7.6 Seeding, and re-running until cutover

**Seeding is automatic.** `devportal/apps.py` connects a `post_migrate` receiver. When `DEVPORTAL_AUTO_SEED` is true (the default; false under pytest), it takes a Postgres advisory lock, compares the image's snapshot hash and spec hash with `PortalState`, and if either differs runs the import in its safe mode, the spec sync and the rebuild. Every web pod already runs `migrate` on start (F-15), so every environment, including the shared development database behind all PR sandboxes, seeds itself with no manual step. A failure is logged and stored on `PortalState`; it never stops the site from starting.

**Until cutover, ReadMe stays the place where staff edit.** Anything edited in the new editor on a cauldron is test data. The re-run procedure:

1. `python manage.py devportal_fetch_source --ref v1.0`.
2. Review the diff; run `devportal/tests/import_test.py` (a changed source can break a link fix's expected count; update `link_fixes.yaml` deliberately).
3. Commit as `chore(devportal): refresh content snapshot to <sha>`.
4. Deploy. The hook imports the changes.

Do this at every milestone and on the day before cutover. The homepage is not in the source repository; at cutover compare live's homepage block with `research/site/landing-custom.html` and port any change by hand.

**At cutover:** freeze editing in ReadMe, refresh one last time, deploy, then set `DEVPORTAL_AUTO_SEED` to false in production so that later deploys never touch content. A follow-up PR removes `migration_source/`.

---

## 8. Launch checklists

### 8.1 Cauldron checklist (M1, and again at each milestone)

- [ ] `H-1` is answered: the cauldron exists for this branch with the developers module in its values, and `DEVPORTAL_CUTOVER_DONE=true` so reviewers see the final link behavior.
- [ ] `https://www.<name>.cauldron.sefaria.org/healthz`, the Voices host and `https://developers.<name>.cauldron.sefaria.org/healthz` answer 200 with a certificate a browser accepts.
- [ ] Migrations ran; the seed report shows 152 source files and no error; `python manage.py devportal_check_links` is clean.
- [ ] Images: the mirror action has run, or `DEVPORTAL_ALLOW_README_IMAGES` is on and noted as temporary.
- [ ] `robots.txt` on the developers host says `Disallow: /`.
- [ ] `DEVPORTAL_GA4` is empty or points at a test property (`H-7`). Never the production property from a cauldron.
- [ ] Try It works from the cauldron's origin against `https://www.sefaria.org`.
- [ ] A staff member logged in on the cauldron's library host can open `/editor`; a logged-out visitor cannot.
- [ ] The browser console shows no CSP violation on each page type.
- [ ] The Formstack frame on the contact page loads (agents cannot check this; the product owner does).
- [ ] BDD, `@pr` and the `chrome-developers` project pass against the cauldron (`SANDBOX_URL=https://www.<name>.cauldron.sefaria.org`, `E2E_DEVELOPERS_URL=https://developers.<name>.cauldron.sefaria.org`).
- [ ] The visual suite has run against the cauldron (`devportal-visual.yaml`); the result is attached.
- [ ] The Integrator has posted: the URLs, what is new, known gaps, open `H-n` items.

### 8.2 Production cutover runbook

Owners: the product owner decides; DevOps runs infrastructure steps; an engineer runs repository steps.

**Before the day (from T-14 days)**

1. The PR is merged and deployed. The portal is inert in production: no hostname routes to it yet.
2. DevOps adds the developers module to `envs/staging/helmrelease.yaml` and `envs/preprod/helmrelease.yaml`, then to `envs/prod/helmrelease.yaml`, after confirming that the production origin certificate (`origin-tls-prod2`) covers `developers.sefaria.org` (`H-8`). The Gateway now accepts the hostname although DNS still points at ReadMe.
3. Test production through the origin without DNS: `curl --resolve developers.sefaria.org:443:<gateway address> https://developers.sefaria.org/healthz`, then the URL-parity crawl and the `@pr` suite the same way.
4. Production settings: `DEVPORTAL_GA4={"default": "G-6SXQFSB219", "gallery": "G-44RHV2ZWQ1"}`; `DEVPORTAL_DEMO_API_KEY` empty unless `H-5` is complete; `DEVPORTAL_ALLOW_INDEXING` true.
5. Run "Mirror external images" on production. Confirm the report shows zero URLs outside the media bucket, then set `DEVPORTAL_ALLOW_README_IMAGES` to false.
6. The analyst confirms the GA4 setting of `H-7`.
7. Lower the DNS record's TTL.
8. Confirm the visual baselines are committed and the capture date is recorded. After ReadMe is cancelled they cannot be retaken.

**The day (T-0)**

9. Freeze editing in ReadMe. Refresh the snapshot (§7.6), deploy, check the seed report.
10. Switch DNS for `developers.sefaria.org` from ReadMe to Sefaria's origin, proxied like the other hosts.
11. Verify on the real hostname: the homepage, a docs page, an endpoint page with Try It, search, `/llms.txt`, a `.md` page, the gallery, an MCP client listing tools, the contact form frame, `robots.txt` and `sitemap.xml` (live's content now), GA4 real-time showing one page view per navigation.
12. Set `DEVPORTAL_CUTOVER_DONE=true` in production. `www.sefaria.org/powered-by` now redirects to `https://developers.sefaria.org/powered-by`.
13. DevOps adds a redirect for `powered-by.sefaria.org`: every path `/<p>` to `https://developers.sefaria.org/powered-by/<p>`, keeping the query string (301).
14. Set `DEVPORTAL_AUTO_SEED=false` in production.

**After (T+1 to T+14)**

15. Merge the retirement PR: delete `.github/workflows/readme-openapi-docs-sync.yml`; change the i18n value `developer.common.powered_by_gallery.url` to the new gallery URL in both language files; remove `migration_source/` and the `DEVPORTAL_ALLOW_README_IMAGES` setting. Remove the repository secrets `README_API_KEY` and `README_API_DEFINITIONS_ID`.
16. An administrator makes the Spectral check and the two `devportal` CI jobs required in branch protection.
17. Watch `NotFoundLog` in the admin daily for a week and add redirects for real inbound links.
18. Archive `Sefaria/developer-docs` and `Sefaria/powered-by` with a README pointing here; shut down the old gallery host once its redirect is in place.
19. **Cancel ReadMe only after all of these are true:** step 5 is verified; the baselines are committed; the site has run for two weeks without a rollback; the product owner has exported anything they want to keep from the ReadMe dashboard.

**Rollback** (possible until ReadMe is cancelled): point DNS back at ReadMe and set `DEVPORTAL_CUTOVER_DONE=false`. Edits made in the new editor after cutover stay in Postgres but are not on ReadMe; say so before deciding.

---

## 9. Risks and sizes

### 9.1 Size by phase

| Phase                          | Size         | What drives it                                                                     |
| ------------------------------ | ------------ | ---------------------------------------------------------------------------------- |
| 0 Foundations                  | Small        | Ten contracts; getting them right is worth more than getting them fast             |
| 1 Host, shell, header          | Medium       | Few lines, wide blast radius (`hosts.py`, middleware, chart)                       |
| 2 Reference                    | Very large   | The biggest UI surface, about 45 visual states, and the strictest parity rule      |
| 3 Docs and migration           | Large        | A dialect with a dozen constructs, 152 files, rules that must be derived from live |
| 4 Search, agent surface, MCP   | Medium-large | Many small exact-output endpoints; the MCP lock                                    |
| 5 Homepage, Discord, analytics | Medium       | 31 KB of CSS to port without inline styles                                         |
| 6 Gallery                      | Medium       | About 8,000 lines moved, few changed; low risk                                     |
| 7 Editor                       | Very large   | A WYSIWYG editor with custom nodes, a tree, revisions and a lossless serializer    |
| 8 Hardening                    | Medium       | Touches the main site; many small verifications                                    |

### 9.2 Risks

| #   | Risk                                                                                                 | Likelihood | Impact                                  | Mitigation                                                                                                                                                             |
| --- | ---------------------------------------------------------------------------------------------------- | ---------- | --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | The developers hostname does not resolve or get a certificate on sandboxes and cauldrons (DC-1)      | Medium     | Blocks M1 and all PR-level e2e          | Confirm in the first hours; `H-1`; everything else proceeds on the standalone server meanwhile                                                                         |
| 2   | Pixel parity on the reference does not converge                                                      | Medium     | Phase 2 slips                           | Exact style and geometry gates before pixels; measured tokens; ReadMe's CSS re-fetched for reference; the retry limit forces early escalation instead of endless loops |
| 3   | ReadMe ships a UI change before the baselines are captured, or between capture and review            | Low        | Baselines and research disagree         | Capture in Phase 0 and record the deploy version; verifiers stop on drift (§4.5 rule 6)                                                                                |
| 4   | PR #4064 changes shape or lands late                                                                 | Medium     | Harness rework, merge conflicts         | Merge rather than rebase; the portal's tests depend only on its documented conventions; the harness changes are few and listed in §5.2.1                               |
| 5   | A `devportal` migration is edited after sandboxes applied it to the shared database                  | Medium     | Every sandbox of this branch crashes    | §2.3.4; `C2` settled first; additive migrations only                                                                                                                   |
| 6   | The `.feature` stories arrive late                                                                   | Medium     | BDD binding slips                       | The stories are requested in Phase 0; W14's own suites do not depend on them; a missing story blocks nothing in CI                                                     |
| 7   | The editor cannot round-trip some construct                                                          | Medium     | Data loss on save                       | Source-preserving serializer and the `rawMarkdown` fallback make loss structurally impossible; `RT-1` proves it for all 152 files                                      |
| 8   | The Python renderer and the editor's rendering drift apart                                           | Medium     | The editor misleads staff               | Public pages have one renderer; the editor is tied to it by goldens over the whole corpus; "View" always uses the server                                               |
| 9   | The third module changes main-site behavior                                                          | Low        | Production regression                   | The quarantine (§2.2), `module_quarantine_test`, and the bundle-unchanged check (§6.8)                                                                                 |
| 10  | Stored XSS through Markdown or HTML blocks; SSRF through the MCP; credentials leaking through Try It | Low        | Severe                                  | Contract `C10`; the sanitizer allow-list; sandboxed frames; the `execute-request` lock; `credentials: 'omit'`; V-security on every merge; `/security-review`           |
| 11  | GA4 continuity breaks (double page views, changed titles)                                            | Medium     | Reports become incomparable             | Title parity test over every page; the single-`page_view` test; `H-7`                                                                                                  |
| 12  | The review window for the editor is short                                                            | High       | Decision by end of Q4 is squeezed       | The read-only portal reaches the cauldron first (M3); the editor follows; the product owner can review in that order                                                   |
| 13  | `DEV-TRY-001` depends on the production API from CI                                                  | Low        | A flaky `@pr` test                      | It is warn-only until `E2E_PR_BLOCKING` is set; one retry; all other Try It tests use recorded responses                                                               |
| 14  | API-key enforcement arrives before a demo key exists                                                 | Medium     | Try It returns 401                      | The key path is built and switched off; `H-5` lists what is needed; with no key, the response panel shows the 401 body as it would any error                           |
| 15  | The merge-queue integration run cannot reach the developers host (DC-3)                              | High       | Red merge queue                         | Conditional project registration                                                                                                                                       |
| 16  | Formstack refuses to render inside a cauldron origin                                                 | Low        | The contact form looks broken in review | Agents cannot reach Formstack; the product owner checks on the cauldron; production keeps the same origin as today                                                     |
| 17  | Repository size grows by about 60 MB of baselines                                                    | Certain    | Slower clones                           | Optimized PNG at 1× scale; raw set as JPEG; `H-9` offers moving them to cloud storage with a hash manifest                                                             |
| 18  | Search engines see a different site                                                                  | Low        | Ranking loss                            | Real HTML from the server, the same URLs, titles and descriptions, the same sitemap entries, `noindex` on hidden pages, redirects from the crawl                       |

---

## 10. Instructions to the implementer

### 10.1 Start here

1. Read [PLANNING_BRIEF.md](PLANNING_BRIEF.md), [DECISIONS.md](DECISIONS.md), this plan, then `research/reference/REFERENCE_SPEC.md` and `research/site/SITE_ATLAS.md`.
2. Clone `Sefaria/developer-docs` and `Sefaria/powered-by` into a scratch directory.
3. Send the requests in Appendix C in one message to the product owner. Do not wait for answers; each has a default.
4. Do Phase 0. Do not start builders on anything but the day-one lanes until the contracts exist.
5. Create `.devportal-run/` with `inbox/`, `reports/`, `handoff/` and `STATUS.md`.
6. Start the builders and verifiers as §4 describes.

### 10.2 Standing rules

- **Decisions are closed.** Everything in the brief's §2 to §6 is decided. Do not redesign the header, add login or an API-key screen, add dark mode, add a Hebrew version, add `featured_order`, touch `powered_by/developer*.py`, change the newsletter provider, merge the gallery's analytics, or add `/api/async` to the spec. These are listed as out of scope in the brief's §6.
- **Live wins** over documents, designs and this plan, except for the registered deviations.
- **Repo conventions.** Ruff for Python; ESLint, Prettier and Stylelint for JavaScript and CSS; slow work goes through Celery with an inline fallback; never write text versions directly (nothing in this project needs to); update `docs/agent_docs/` and leave `.stamp` alone. Do not reformat unrelated code.
- **Ownership.** Edit only what your workstream owns (§4.2).
- **Tests are part of the work.** A feature without its named tests is not finished. Never loosen a check to pass it (§4.5 rule 7).
- **Git.** Push only the PR branch. Never force-push it, rebase it, or bypass hooks. Never touch a commit that contains a `.feature` file. Do not open a new pull request; this work is one PR.
- **Live.** GET only; block ReadMe's metrics beacons; no form submissions (§0 rule 2).
- **Secrets.** Never commit a key. The demo API key, if one is ever issued, arrives through settings.
- **Record surprises.** If the code contradicts this plan, the code wins: note it in `.devportal-run/STATUS.md` and in the PR description, and adapt.

### 10.3 When you are blocked

| Situation                                                            | What to do                                                                                                                                         |
| -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| A test, lint or build failure                                        | Diagnose and fix. This is never a reason to stop                                                                                                   |
| A detail this plan does not specify                                  | Copy live. If live does not show it, follow the design system. If neither, choose the simplest option, note it in the PR description, and continue |
| This plan and the code disagree                                      | The code wins. Adapt and record it                                                                                                                 |
| A parity gap that will not close within the retry limits             | Escalate with the evidence and a proposed deviation. Keep working on everything else                                                               |
| Meeting a requirement would mean changing a `.feature` file          | Stop that item. Ask the product owner, through the amendment process in `e2e-tests/feature-specs/README.md`. Never work around the lock            |
| Meeting a requirement would mean re-opening a decision in the brief  | Stop that item. Describe the conflict and the smallest change that would resolve it. Do not make the change yourself                               |
| Something needs credentials, DNS, a cauldron or a repository setting | Ask the person named in Appendix C. Continue on the standalone server                                                                              |
| A security rule in `C10` seems to prevent a feature                  | The rule stands. Escalate                                                                                                                          |
| Live changed since the research                                      | Stop the affected verifier, tell the Integrator, and ask the product owner whether to re-capture                                                   |

**Ask the product owner** only for: the items in Appendix C; a deviation that does not trace to the brief; anything touching `.feature` files; anything that re-opens a decision; and at each milestone, for review. One message per question, with what you found, the options, your recommendation and what you will do meanwhile.

### 10.4 Done means

The PR is ready for review when: every phase's "must pass" list is green on the integrated head; all four verifiers report no open entry; §6 is complete; the cauldron is at M5 and its checklist (§8.1) is ticked; `/security-review` is clean or its findings are recorded; `docs/agent_docs/apps/devportal.md` exists; and the PR description lists the deviations registry, the Spectral overrides, the open requests from Appendix C and a link to §8.2.

---

## Appendix A: every place the module is checked

The full audit behind §2.2. "Unreachable" means the code only runs for views that `sefaria/urls_developers.py` does not include (rule Q1), or only in the React 16 app, which is never served on the developers host and never sees the module (rule Q2).

### Python and templates

| Where                                                                                                   | What it does                                                                             | With a third module                                                  | Handling                                                                    |
| ------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `sefaria/hosts.py:22-36`                                                                                | Builds host patterns from the `library` and `voices` keys only                           | Ignores it; the host would fall to the library URLconf               | **Change** (§2.2 step 2)                                                    |
| `sefaria/system/middleware.py:621-633` `ModuleMiddleware`                                               | Returns whichever module's host matches                                                  | Correct                                                              | None                                                                        |
| `sefaria/system/middleware.py:604-618`                                                                  | `/api/`, `/_api/`, `/static/` and `/linker.js` are always the library module             | Portal paths must not start with these                               | Rule in §2.4                                                                |
| `sefaria/system/middleware.py:333-360` `SessionCookieDomainMiddleware`                                  | Maps every configured host to its language's shared cookie domain                        | Correct and wanted                                                   | None; it is why Try It omits credentials                                    |
| `sefaria/system/middleware.py:95-240` `LanguageSettingsMiddleware`                                      | Pins a host to a language; may redirect to the other language's host for the same module | No redirect, because `he` has no developers URL; may activate Hebrew | `DevportalMiddleware` forces English (Q5)                                   |
| `sefaria/utils/domains_and_languages.py:104-115` `get_redirect_domain_for_language`                     | `.get(lang).get(module)`                                                                 | Returns `None`; safe                                                 | None. Never add a developers URL under `he`                                 |
| `sefaria/utils/domains_and_languages.py:64-71` `_known_domain_hostnames`                                | All configured hosts; used to add `no_applink` to redirects                              | Would start tagging `/wiki` and `/developers` redirects              | **Change:** exclude the developers module (Q3)                              |
| `sefaria/utils/domains_and_languages.py:133-172` `get_cookie_domain`                                    | Common suffix of a language's hosts                                                      | Same suffix as today                                                 | None                                                                        |
| `sefaria/system/context_processors.py:103`, `:199`                                                      | Pass or test `active_module` in templates                                                | Would pass `"developers"` into `base.html`                           | Unreachable (Q4)                                                            |
| `reader/views.py:238-253` `get_page_title`                                                              | `suffixes[page_type][module]`                                                            | `KeyError`, a 500                                                    | Unreachable (Q1). Do not call it from portal code                           |
| `reader/views.py:455-461` `base_props`                                                                  | Sends `activeModule` and all of `DOMAIN_MODULES` to the client                           | Would expose the module to every JS loop                             | **Change:** filter to two keys; add `developersURL` and `poweredByURL` (Q2) |
| `reader/views.py:398`, `:1691`, `:1706`; `sefaria/model/notification.py:349,360`                        | `== VOICES_MODULE`, else library behavior                                                | Library behavior                                                     | Unreachable (Q1)                                                            |
| `reader/views.py:4071-4073`                                                                             | Library text, else sheets text                                                           | Sheets text                                                          | Unreachable (Q1)                                                            |
| `reader/views.py:609-624`, `:965`, `:997`, `:4111-4115`, `:5859`                                        | Explicit two-way checks                                                                  | Safe                                                                 | None                                                                        |
| `reader/views.py:6279-6283`, `:6405-6413`; `templates/manifest.json`                                    | Favicon and manifest from `static/icons/<module>/`                                       | `FileNotFoundError`                                                  | Unreachable; the portal serves its own files at those paths                 |
| `templates/base.html:54-65`, `:271`, `:303`; `templates/elements/loading.html:10`                       | Icons, theme color, app title and `data-active-module` from the module                   | Missing files; library fallbacks                                     | Unreachable (Q1, Q4)                                                        |
| `sefaria/image_generator.py:16-47,117-133`; `django_topics/utils.py:22-46`; `reader/views.py:4102,4156` | Normalise or pass the module name through                                                | Fall back to library or return nothing                               | Unreachable                                                                 |
| `sites/sefaria/urls.py:104-109`                                                                         | Hard-coded redirects to the two external sites                                           | Not affected                                                         | **Change** in Phase 8                                                       |
| `sefaria/system/tests/test_middleware.py:975-979`                                                       | Asserts `/wiki` gets no `no_applink`                                                     | Would fail without Q3                                                | Must stay green unchanged                                                   |

### JavaScript (React 16 app; 266 matching lines in 43 files)

All of it is unreachable on the developers host. On the library and Voices hosts it behaves as today because `domainModules` keeps exactly two keys (Q2). The lines that would misbehave if either rule were broken, and which the quarantine test therefore protects:

| Where                                                                                  | Pattern                                                                                | Would do                               |
| -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | -------------------------------------- |
| `static/js/Header.jsx:328`                                                             | `module === LIBRARY ? ['Texts','Topics'] : ['Topics','Collections']`                   | Show the Voices links                  |
| `static/js/Header.jsx:378`                                                             | `module === LIBRARY ? savedIcon : notificationIcon`                                    | Show the Voices icon                   |
| `static/js/Header.jsx:304`                                                             | `header.sefaria_${activeModule}_logo`                                                  | Missing string                         |
| `static/js/sefaria/searchState.js:138`                                                 | `=== 'library' ? 'text' : 'sheet'`                                                     | Search sheets                          |
| `static/js/ReaderApp.jsx:2250`                                                         | `=== 'voices' ? showVoices() : showLibrary()`                                          | Show the library                       |
| `static/js/sefaria/sefaria.js:3554-3556`, `:4317`, `:4275`, `:4356`, `:3200`           | Two-way picks for trending topics, page titles, logout URL, autocomplete, search       | A mix of library and Voices behavior   |
| `static/js/HeaderAutocomplete.jsx:43-44,126,458`                                       | `MODULE_ALLOWED_SEARCH_TYPES[activeModule].includes(…)`                                | Throw a `TypeError`                    |
| `static/js/UserHistoryPanel.jsx:39,49,118,136`; `ElasticSearchQuerier.jsx:240,425,637` | Two-way picks                                                                          | A mix                                  |
| `static/js/sefaria/sefaria.js:577-619`                                                 | Loops over `domainModules` (`getCurrentLangHostnames`, `isSefariaURL`, `getModuleURL`) | Treat developers links as in-app links |

Files this project does change in the React 16 app, all in Phase 8 and all to read a URL from a prop instead of a literal: `static/js/Header.jsx:233-238` and `:672`, `static/js/StaticPages.jsx:1966,1968,3288,3292`.

---

## Appendix B: visual-parity states

Reference states use `/reference/get-v3-texts` unless another page is named. Names match `REFERENCE_SPEC.md` §6 so the research screenshots can be found. Every state is captured at 1440, 1280, 1024, 768 and 390 unless the last column says otherwise (`I-2`).

| ID  | State                                                                      | Notes                                                                         |
| --- | -------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| R01 | `v3_default`: first viewport and full page                                 |                                                                               |
| R02 | `v3_schema_expanded`                                                       |                                                                               |
| R03 | `v3_schema_child_attributes`                                               |                                                                               |
| R04 | `v3_lang_node`                                                             | D-4                                                                           |
| R05 | `v3_lang_node_library_menu`                                                | D-4                                                                           |
| R06 | `v3_more_languages_open`                                                   |                                                                               |
| R07 | `v3_copy_page_menu_open`                                                   | D-5                                                                           |
| R08 | `v3_tags_tooltip`                                                          |                                                                               |
| R09 | `v3_param_examples_combobox_open`                                          |                                                                               |
| R10 | `v3_footer_feedback`                                                       | D-7 does not apply on reference pages                                         |
| R11 | `v3_feedback_yes_open`                                                     | The popover only; "Vote" is never clicked on live                             |
| R12 | `v3_tryit_before_genesis`                                                  |                                                                               |
| R13 | `v3_tryit_loading`                                                         | The recorded response is delayed by the route handler on both sides           |
| R14 | `v3_tryit_success`                                                         | Recorded response                                                             |
| R15 | `v3_tryit_button_hover`                                                    | Region: the request card                                                      |
| R16 | `v3_response_menu_open`                                                    |                                                                               |
| R17 | `v3_response_example_menu`                                                 |                                                                               |
| R18 | `v3_response_headers_modal`                                                | D-8: frame and REQUEST section compared, RESPONSE rows masked                 |
| R19 | `v3_tryit_error`                                                           | Recorded 404                                                                  |
| R20 | `v3_recent_requests_after_tryit`                                           | D-6; time cell masked                                                         |
| R21 | `v3_recent_requests_after_error`                                           |                                                                               |
| R22 | `v3_recent_request_row_selected`                                           |                                                                               |
| R23 | `v3_sidebar_collapsed`                                                     | 1440, 1280, 1024 only: no collapsible sidebar at 768 and below                |
| R24 | `find_refs_default` (`/reference/post-find-refs`)                          |                                                                               |
| R25 | `find_refs_body_text_expanded`                                             |                                                                               |
| R26 | `find_refs_filled`                                                         |                                                                               |
| R27 | `find_refs_tryit_result`                                                   | Recorded 202                                                                  |
| R28 | `calendars_default` (`/reference/get-calendars`)                           |                                                                               |
| R29 | `calendars_enum_params`                                                    |                                                                               |
| R30 | `calendars_enum_selected`                                                  |                                                                               |
| R31 | `img_gen_enum_params` (`/reference/get-img-gen`)                           |                                                                               |
| R32 | `sidebar_index_groups`                                                     | Region: sidebar. 1440, 1280, 1024                                             |
| R33 | `sidebar_index1_group`                                                     | Same                                                                          |
| R34 | `sidebar_filter_index`                                                     | Same                                                                          |
| R35 | `search_open`                                                              |                                                                               |
| R36 | `search_results_texts`                                                     | D-9                                                                           |
| R37 | `header_links_menu_open`                                                   | 1440, 1280, 1024: the menu is in the drawer below that                        |
| R38 | `mobile_nav_open`                                                          | 768 and 390                                                                   |
| R39 | `mobile_subnav_sidebar_open`                                               | 768 and 390                                                                   |
| R40 | `mobile_search_open`                                                       | 768 and 390                                                                   |
| R41 | A deprecated endpoint (`/reference/get-v1-texts`), default                 | Not in the research set; capture it                                           |
| P01 | `/docs/welcome` (callout, plain page)                                      |                                                                               |
| P02 | `/docs/linker-v3` (table of contents, code blocks), viewport and full page | D-7 at the page end                                                           |
| P03 | `/docs/the-sefaria-mcp` (error callout)                                    |                                                                               |
| P04 | `/docs/linker-api` (code tabs, table)                                      |                                                                               |
| P05 | `/docs/index-and-versions` (table)                                         |                                                                               |
| P06 | `/docs/the-disambiguator` (framed image), and with the lightbox open       |                                                                               |
| P07 | `/docs/sefaria-research-at-pyconn-2024` (embed)                            | Frame content masked                                                          |
| P08 | `/docs/powered-by-sefaria` (HTML block)                                    | D-12                                                                          |
| P09 | The Hebrew citation page (RTL HTML block)                                  | D-12                                                                          |
| P10 | `/reference/getting-started` (a guide page inside the reference section)   |                                                                               |
| P11 | `/page/contact-us`                                                         | Frame content masked                                                          |
| P12 | `/` first viewport and full page                                           | D-10; D-11 at 390 and 768. Animations frozen at their end state on both sides |
| P13 | The 404 page                                                               |                                                                               |
| P14 | Docs sidebar with a nested group open; the deprecated and link items       | Region: sidebar; D-2                                                          |
| P15 | Docs page footer: "Updated", prev/next, feedback                           | Region: footer; D-7                                                           |

---

## Appendix C: requests to people

Send all of these at the start. Work never waits on one; the default applies until it is answered.

**H-1, to: DevOps.** Needed by: end of Phase 1.

(a) Confirm that `developers.<env>.cauldron.sefaria.org` resolves and gets a certificate once the chart's `domains.modules` has the developers entry. (b) Create a review cauldron for this branch with that entry and `DEVPORTAL_CUTOVER_DONE=true`. (c) Say whether the merge-queue integration environment can serve a developers hostname. (d) Later: staging and preprod values.

_Default until answered:_ Develop and verify on the standalone server and the PR sandbox.

**H-2, to: the product owner.** Needed by: Phase 0.

Confirm merging PR #4064's branch into this branch if it has not landed.

_Default until answered:_ Merge it.

**H-3, to: the product owner.** Needed by: end of Phase 1.

Write the `.feature` stories (§5.4) on this branch with the `write-feature-spec` skill. Confirm you are in the `SPEC_EDITORS` repository variable.

_Default until answered:_ W14 builds its own suites; BDD steps are bound as stories arrive.

**H-4, to: the product owner and DevOps.** Needed by: Phase 3.

Which bucket is "the media bucket"? Do cauldron pods have write access to it?

_Default until answered:_ `SITE_SETTINGS["TOPICS_BUCKET"]` (`I-11`); original image URLs keep loading.

**H-5, to: API-key backend team.** Needed by: before enforcement starts.

For the public demo key: (a) a dedicated tier with a low per-minute limit, ideally also limited per IP because the key is shared; (b) an API project and key on that tier with no origin restriction, since the key appears in copyable code samples; (c) confirmation that the header is `X-API-Key` and that the key allows only the documented read operations, including the two POSTs; (d) the response a keyless or over-limit call gets, so the panel can explain it; (e) a rotation procedure, with the value delivered through the `DEVPORTAL_DEMO_API_KEY` setting; (f) whether `/mcp`'s `execute-request` should use its own non-public key on the existing `mcp` tier; (g) optionally `Access-Control-Expose-Headers` on `/api/` responses (F-8); (h) which page `authService.helpURL` should point to.

_Default until answered:_ No key anywhere; the feature stays off.

**H-6, to: the product owner.** Needed by: Phase 4.

May the implementer send about ten `tools/call` requests for the three read-only tools to the live MCP, to copy their output format?

_Default until answered:_ No calls; our own JSON format.

**H-7, to: the analyst and the product owner.** Needed by: Phase 5.

(a) In the DevPortal GA4 property, confirm "page changes based on browser history events" is off, or tell us it must stay on. (b) Provide a test property or approve DebugView for the cauldron. (c) Mark the four new events as key events after launch.

_Default until answered:_ GA4 is off outside production.

**H-8, to: DevOps.** Needed by: cutover.

For cutover: the production certificate covers `developers.sefaria.org`; the DNS switch; the `powered-by.sefaria.org` redirect; branch protection for the new checks.

_Default until answered:_ Not applicable before cutover.

**H-9, to: the product owner.** Needed by: before Phase 2 merges.

Are about 60 MB of baseline images in the repository acceptable?

_Default until answered:_ Commit them.

**H-10, to: Engineering leads.** Needed by: before cutover.

The docs MCP is rebuilt here as the easiest option. Please advise on its long-term home (here or `mcp.sefaria.org`) and name an owner for its maintenance.

_Default until answered:_ It lives here; the owner field in its README says "to be assigned".

**H-11, to: the product owner.** Needed by: M2 onward.

Review the deviations (§6.1.5) and interpretations (§1.3) on the cauldron.

_Default until answered:_ As written.

**H-12, to: the product owner.** Needed by: M2.

On the cauldron, check the three things agents cannot reach: the Formstack contact frame, the Formstack Discord signup link, and the ActiveCampaign newsletter link.

_Default until answered:_ Assumed working, since the URLs are unchanged.

**H-13, to: Author of PR #4064.** Needed by: none.

FYI: `E2E_VOICES_URL` is set to `sheets.sandbox-<sha>…` but the chart serves Voices at `voices.sandbox-<sha>…` (F-5).

_Default until answered:_ Not our change to make.

Research files that no workstream builds from, and why: `research/ux/UX_BRIEF.md` holds the post-launch design questions (do not act on them); `research/screenshots/` is for orientation only, since baselines are recaptured at full quality; `research/design/homepage-design-*.webp` contain placeholder copy and are used only for the mobile hero spacing.
