# Developer Portal: UX-integration brief

Goal: rebuild developers.sefaria.org (ReadMe today) inside the Sefaria monorepo so it feels like part of sefaria.org, especially the header.
Sources: repo at `/home/user/Sefaria-Project` (read-only) and a live Playwright crawl on 2026-11-18. Screenshots are in this folder, computed styles and menu contents in `crawl.json`, and the scripts in `../../ux-crawl/crawl.js`.

## Crawl caveats (read before looking at screenshots)

- The sandbox proxy blocks **unpkg.com, cdnjs, voices.sefaria.org and cdn.readme.io**.
  - sefaria.org: React 16 and jQuery came from npm tarballs with the same versions the site loads, and third-party analytics were stubbed. The rendering is faithful.
  - **Voices is simulated.** We loaded `www.sefaria.org/topics?__voicesSim=1` with `activeModule` forced to `voices` before React booted. The header, logo, links and Create button are correct. Some hrefs in the simulated mobile menu and account menu are hydration artifacts (they kept the library SSR hrefs), so ignore those hrefs.
  - **developers.sefaria.org renders unstyled** (Times New Roman, stacked links) because ReadMe's CSS and JS live on cdn.readme.io. Use those shots for the link inventory, not for visuals. Its theme values come from the inline CSS variables in its HTML. Header height, fonts and similar values for the dev portal are not measurable here, so take them from a real browser.
- We used logged-out state only, and submitted no forms.

## 1. How the header works today (code)

- `static/js/Header.jsx`. A single `Header` component branches on `props.module` (`Sefaria.LIBRARY_MODULE` = "library" or `VOICES_MODULE` = "voices"). There are only two modules (`sefaria/constants/model.py:63-64`).
  - **Module detection:** `sefaria/hosts.py` maps each host in `settings.DOMAIN_MODULES[lang]` to a URLconf (`urls_library` / `urls_sheets`). The middleware `_set_active_module` (`sefaria/system/middleware.py:621`) sets `request.active_module` from the hostname. It reaches React via `activeModule` and `domainModules` props (`reader/views.py:455,461`) and `<body data-active-module>` (`templates/base.html:271`). Theme CSS keys off `[data-active-module=…]` (`static/css/themes/library-theme.css`, `sheets-theme.css`), which sets `--theme-primary` and the font stacks.
  - **Per-module pieces:**
    - logo: CSS background `/static/img/{module}-logo-{english|hebrew}.svg`, widths in the `$logo-widths` map in `static/css/header.scss:61`. At tablet width it becomes the samech mask tinted with `--theme-primary`.
    - nav links: Texts/Topics for library, Topics/Collections for voices, plus Donate.
    - primary CTA: Sign Up for library (logged out), Create for voices.
    - Saved icon (library) versus notifications icon (voices).
    - account dropdown contents.
    - mobile menu sections.
    - Library Assistant link (library only).
  - **ModuleSwitcher** (`Header.jsx:187-252`) is a `DropdownMenu` (`static/js/common/DropdownMenu.jsx`). It lists the Sefaria logo (links to /about), then Library (blue dot), Voices (green dot), **Developers** (purple dot, `--devportal-purple`, external `https://developers.sefaria.org`, `newTab`, line 234), and "More from Sefaria ›" (/products). The button's aria-label is "Library" in both modules (`header.library`).
  - **MobileNavMenu** (`Header.jsx:534+`): the module block near the bottom shows "Voices on Sefaria" or "The Sefaria Library", then **"Developers on Sefaria"** (line 672, purple dot, `target=_blank`), then "More from Sefaria".
  - **Language:** `InterfaceLanguageMenu` (globe) shows only when logged out. Logged-in users switch language in the account dropdown (`DropdownLanguageToggle`). Mobile uses `MobileInterfaceLanguageToggle` (`/interface/{english|hebrew}` redirects). HE/EN is per domain (`sefaria.org.il` for Hebrew) via `DOMAIN_MODULES["he"]`.
- **What a third "developers" module would touch:**
  - `DOMAIN_MODULES` + `hosts.py` (a new host/URLconf).
  - middleware (automatic once the host is in `DOMAIN_MODULES`).
  - `constants/model.py`.
  - `$modules`/`$logo-widths` in `header.scss`, plus new `developers-logo-{english,hebrew}.svg` files.
  - a `themes/developers-theme.css` (`--theme-primary: var(--devportal-purple)`).
  - every `props.module === …` branch in `Header.jsx`: links, CTA, icons, account dropdown, mobile menu. Many branches are written as `library ? A : B`, so a third value silently falls into the voices branch (for example `links` at line 328 and the logged-in icon at 391).
  - `ModuleSwitcher` (Developers becomes an internal link with `targetModule`, `newTab` only when it's not the active module).
  - `Sefaria.getModuleURL`/`util.fullURL`, page titles (`get_page_title(module=…)`), favicons (`module_favicon`), and the search scope (`sheets_only` in sefaria.js:3200).

### Design tokens and CSS

- **CSS custom properties: yes.**
  - `static/css/color-palette.css`: `--sefaria-blue #18345D`, `--sefaria-purple #7C416F`, `--devportal-purple: var(--sefaria-purple)` (already declared "a distinct name for a distinct purpose"), `--sheets-green #518159`, a grey scale, and others.
  - `static/css/fonts.css`: `--english-sans-serif-font-family` = Roboto…, `--hebrew-sans-serif-font-family` = Heebo…, serif stacks Cardo/Taamey Frank, `--english-secondary-font-family` = Miriam Libre.
  - `header.scss`: `--header-height: 60px`.
- **Header styling files:** `static/css/header.scss`, dropdown and mobile menu styles in `static/css/s2.css` (`.dropdownDot` around line 15931, `.dropdownLogoItem` around 16086), `popover.scss`, `breakpoints.scss`.
- **Dark mode:** none. `library-theme.css:80` holds an empty placeholder, `@media (prefers-color-scheme: dark) {}`. ReadMe today has a `data-color-mode` / `dark_mode` toggle but is set to `light`.

## 2. The existing in-app developer area (`powered_by/`)

- **Backend:** `powered_by/developer.py` (logic) and `developer_views.py` (views + JSON API). Routes in `sefaria/urls_library.py:53-72` (library host only):
  - `/settings/developer`
  - `/settings/developer/projects/<id>`
  - `/settings/developer/confirm-email/<key>`, `/settings/developer/email-confirmed`
  - `/api/developer/{state,enable,profile,confirmation,confirmation/new-link,projects,projects/<id>,projects/<id>/keys,keys/<id>,keys/<id>/value}`
  - `/api-terms` (`sites/sefaria/urls.py`), a placeholder ToS.
- **Gate:** `requires_developer_settings` checks `DEVELOPER_SETTINGS_ENABLED` (default False, `sefaria/settings.py:368`) and the optional `DEVELOPER_SETTINGS_STAFF_ONLY`. **Live: `/settings/developer` and `/api-terms` return 404 in production today.**
- **Frontend:** `static/js/SettingsPage.jsx` (tabbed `SETTINGS_TABS`: Account Settings / Developer Settings with a code-xml icon, `SettingsNav`), with `static/js/developerSettingsApi.js` behind it. It links out to `developers.sefaria.org/reference/getting-started` (API docs), `/api-terms`, and the `powered-by.sefaria.org` gallery (i18n keys `developer.common.*`).
- **How a user reaches it:** **only by typing the URL** (or by following an agent instruction block on the page). Neither the header account dropdown (`/settings/account` only) nor the mobile menu (`/settings/account` only) links to `/settings/developer`, and the flag is off anyway.
- **Gallery:** `powered_by/views.py` (`/api/powered-by`) is the backend for powered-by.sefaria.org.

## 3. Inventory: entry points from sefaria.org to developer content

| # | Where | Label | Target | Behaviour |
|---|---|---|---|---|
| 1 | Desktop header → module switcher (grid icon, aria "Library"), both modules | Developers (purple dot) | https://developers.sefaria.org | new tab |
| 2 | Mobile hamburger menu, both modules | Developers on Sefaria (purple dot) | https://developers.sefaria.org | new tab |
| 3 | Redirect `/developers` | – | https://developers.sefaria.org (302) | `sites/sefaria/urls.py:109` |
| 4 | Redirect `/wiki` | – | https://developers.sefaria.org/docs/welcome | `urls.py:108` |
| 5 | Redirect `/powered-by` | – | https://powered-by.sefaria.org (301) | `urls.py:105` |
| 6 | /about (EN+HE static) | "API" (links `/developers`), plus a 2023 news item "hub for software developers" | /developers → portal, portal | `templates/static/{en,he}/about.html:75,298` |
| 7 | /linker static page | "Read the details in our Developer Docs" | /docs/linker-v3 | `templates/static/linker.html:92` |
| 8 | /products → `DevBox` aside | Powered by Sefaria "Explore" | https://powered-by.sefaria.org | `StaticPages.jsx:3280` |
| 9 | `PoweredByPage` component | "Create Something New" | developers.sefaria.org | `StaticPages.jsx:1959`. **Dead: exported, but no template or route mounts it** |
| 10 | Contest pages (/powered-by-sefaria-contest-2020/2021) | text mentions of API | – | legacy |
| 11 | Settings → Developer tab | API docs, gallery, terms | portal / powered-by / `/api-terms` | flag off, so 404 live |
| 12 | API error text | "see: https://developers.sefaria.org/docs/the-structure-of-a-simple-text" | portal | `sefaria/system/exceptions.py:110` |
| – | Footer (`NavSidebar` `SidebarFooter`) | **no developer / API / GitHub link** | – | `NavSidebar.jsx:361` |
| – | Account dropdown (logged out or in) | **no developer link** | – | |

## 4. Links back from the portals to sefaria.org

**developers.sefaria.org (ReadMe):**
- Top nav: Home, Docs, API Reference, GitHub (Sefaria-Project), Donate (`donate.sefaria.org…c_src=HeaderDev`), Get in Touch (`/page/contact-us`), **Sefaria Library** (`https://sefaria.org`), **Voices on Sefaria** (`https://voices.sefaria.org`).
- A hand-built **module-switcher clone**: Sefaria Library, **"Voices at Sefaria"**, Developers, More from Sefaria › (`sefaria.org/products`).
- Problems:
  - The naming is inconsistent ("on" in the nav, "at" in the switcher).
  - The links go to the bare `sefaria.org`, not `www`.
  - Custom CSS still targets `http://voices.sefariastaging.org` (a stale staging selector).
  - The footer is a purple `--primary` band using Inter.

**powered-by.sefaria.org:**
- Header: a purple tile with the samech logo (links to the dev portal), "Powered by Sefaria", Sefaria.org ↗, Developer docs ↗, Submit a project (Formstack), Donate (`www.sefaria.org/donate`). Every external link opens in a new tab.
- Body: "Build with Sefaria" links to the portal.
- Footer: Developer Portal, Sefaria on GitHub.

## 5. Visual differences between the headers (computed, 1440px)

| | sefaria.org Library | Voices (sim) | developers.sefaria.org (ReadMe) | powered-by.sefaria.org |
|---|---|---|---|---|
| Height | 60px (`--header-height`), also 60 on mobile | 60px | ReadMe two-row header, not measurable (assets blocked) | 65px desktop / 57px mobile (`--header-height: 64px`/`56px`) |
| Background / edge | white + `box-shadow 0 1px 3px rgb(0 0 0/20%)` | same | ReadMe theme | white + `border-bottom 1px #EDEDEC` (no shadow) |
| Logo | wordmark SVG "Sefaria Library" 154×25 (blue samech) | "Voices on Sefaria" 174×25 (green) | readme-hosted SVG (files.readme.io) ~61×18 rendered | purple rounded tile with white samech + divider + "Powered by Sefaria" text |
| Font | Roboto 16px/500, links #666 | same | Inter (custom CSS), code: Source Code Pro | Roboto (Arial fallback), 14px/500, #121212 |
| Brand color | `--sefaria-blue #18345D`, purple CTA (Library Assistant) #7C416F | `--sheets-green #518159` (Create button) | **`--color-primary #612854`** (≠ site purple #7C416F) | title #653259 (purple-800, the `--chatbot-purple-hover` value); buttons purple |
| Primary CTA | Sign Up (blue) | Create (green) | none | Submit a project (purple, filled) + Donate (outline) |
| Module switcher | yes (grid icon) | yes | imitation dropdown | none |
| Search | central pill autocomplete | same | ReadMe search (docs only) | none in header (on page) |
| Lang toggle | globe (logged out) / account menu | same | none, English only (one HE doc page exists: "איך ליצור מראי מקורות") | none |
| Login/profile | account icon menu | same | none | none |

Key takeaway: there are three purples in use: #7C416F (site token), #612854 (ReadMe), and #653259 (powered-by). Logo treatment and font also differ across all three.

## 6. DESIGN QUESTIONS for the designer / product owner

1. **Module or not?** Does Developers become a true third module? That means its own host (`developers.sefaria.org` in `DOMAIN_MODULES`), its own wordmark ("Developers on Sefaria" logo SVG, EN+HE), and a theme with `--theme-primary: --devportal-purple`. The switcher entry would then open in the same tab like Library/Voices instead of `_blank`. Or does it stay an "external" product under "More from Sefaria"?
2. **Header nav model:** same `Header` component with developer tabs (e.g. Docs · API Reference · Guides/Linker · Powered by · Changelog/Newsletter) in place of Texts/Topics, versus the standard header plus a **secondary sub-nav/tab bar** below it for docs sections. Docs usually also need a left sidebar TOC, so where does section nav live on mobile?
3. **Donate in the dev header?** Keep Donate as a text link (site convention), or swap it for GitHub / "Get an API key"?
4. **Primary CTA slot** (Sign Up on Library, Create on Voices): for developers, is it "Get API key" (goes to developer settings), "Sign up", or "Submit a project"?
5. **Search:** reuse `HeaderAutocomplete` scoped to docs/API endpoints? Library text search? Both, with a scope toggle? What does "/" or ⌘K do?
6. **Login and profile on the portal:** show the account menu (shared session cookie across `*.sefaria.org`)? Should the account dropdown gain a "Developer settings / API keys" item, in every module or only in developers?
7. **Where do API keys and developer settings live?** Keep them at `www.sefaria.org/settings/developer` (library host, Settings tabs), or move them into the developers module as a "Dashboard / My projects" page with docs chrome? How do docs pages deep-link to "create key" (e.g. inline "Your key: sfr_…" in code samples when logged in)?
8. **Powered-by gallery:** fold it into the dev portal nav ("Showcase") or keep it as a separate microsite? Which header should it carry? It currently has a bespoke header that links *to* the dev portal through its logo.
9. **EN/HE and RTL:** are docs English-only (as today) or bilingual? If bilingual, how does `sefaria.org.il` map to the dev portal? If English-only, should the language toggle be hidden or disabled with a note? Code blocks stay LTR inside RTL pages. Hebrew citation docs already exist.
10. **Brand purple:** standardise on `--devportal-purple` (#7C416F), or adopt the deeper #612854 / #653259 used by ReadMe and powered-by? s2.css:372 notes that #7C416F "reads pink on some screens".
11. **Typography:** Roboto/Heebo (site) versus Inter (ReadMe custom). Which monospace for code: Source Code Pro or a system mono?
12. **Dark mode:** the main site has none (empty placeholder). Do docs ship a dark mode (common for dev docs, and ReadMe supports it), even though it would make developers the only module with one? Or should we design tokens dark-ready now?
13. **Mobile:** the hamburger menu currently mixes module links, account and language. For developers, should it show the docs TOC, or nav sections plus a separate TOC drawer?
14. **Footer:** the site has a sidebar footer with no developer, API or GitHub links. Should "Developers" / "API" be added to the global footer? What footer does the portal get: the site's or the current purple newsletter band?
15. **Naming:** "Developers" vs "Developers on Sefaria" vs "Developer Portal" vs "Developer docs". Also "Voices on" vs "Voices at". Pick one set.
16. **Redirects and IA:** do `/developers`, `/wiki` and `/api-terms` resolve within the new module? Do ReadMe paths (`/docs/*`, `/reference/*`, `/reference-link/*`, `/page/contact-us`) keep working, and does the dead `PoweredByPage` get revived or deleted?
17. **Link behaviour:** should cross-module links still open new tabs (today Developers is always `_blank`, powered-by marks everything ↗)?

## Files

- Screenshots, desktop 1440: `library-1440-header.png`, `library-1440-menu-library.png` (module switcher), `library-1440-menu-account_menu.png`, `library-1440-menu-toggle_interface_language_menu.png`, `voices-sim-1440-*.png`, `developers-1440-*.png`, `developers-docs-1440-*.png`, `poweredby-1440-*.png`.
- Screenshots, mobile 390: `library-390-header.png`, `library-390-mobilemenu.png`, `library-390-mobilemenu-developers.png`, `voices-sim-390-*`, `developers-390-*` (unstyled), `poweredby-390-*` (incl. `-mobilemenu`).
- `crawl.json`: computed header, logo and link styles, plus every opened menu's items.
