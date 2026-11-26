# UX brief summary (full: atlas/ux/UX_BRIEF.md, 26 shots)
- Header.jsx single component switching props.module (library|voices) from hostname via DOMAIN_MODULES/hosts.py/middleware -> activeModule prop + body[data-active-module]. 3rd "developers" module touches ~10 places; TRAP: `library ? A : B` ternaries give 3rd module Voices behavior silently.
- Tokens: CSS vars; --devportal-purple exists (=#7C416F sefaria-purple). Roboto/Heebo, 60px header w/ shadow, no dark mode.
- 3 purples: site #7C416F, ReadMe #612854, powered-by #653259. Fonts: Roboto (main/pbs) vs Open Sans/Inter (ReadMe).
- In-app developer area (/settings/developer, API keys, powered_by app) gated by DEVELOPER_SETTINGS_ENABLED (off; 404 in prod).
- Entry points: module switcher "Developers" (new tab), mobile "Developers on Sefaria", /developers, /wiki, /powered-by redirects, /about API link, /linker docs link, /products PBS box. Footer & account menu: none. PoweredByPage component unused.
- Dev portal links back: hand-built module-switcher clone ("Voices at Sefaria" inconsistent), custom CSS references voices.sefariastaging.org.
- 17 design questions in brief (module vs sub-nav, CTA slot, search scope, login/account menu+API keys, gallery placement, EN/HE+RTL & sefaria.org.il, purple/fonts, dark mode, mobile menu/footer, naming, new-tab behavior, legacy paths).
