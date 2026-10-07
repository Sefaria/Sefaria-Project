# Inventory 01 — URLs, Routing, SSR, Client History / URL State

Repo: `/Users/akiva/Sefaria/dev/Sefaria-Project` @ master (`bb47dd77a`). All citations are `path:line`.
Scope: every user-facing URL, every query param the reader understands, redirect/normalization rules,
client history behavior, SSR/meta/SEO, and legacy/surprising behavior. API endpoints are listed briefly
(the client calls them) but are not described in depth.

---

## 0. Routing architecture (read this first)

### 0.1 Host-based module split (django-hosts)
- `ROOT_URLCONF = 'sefaria.urls'` is an empty URLconf (`sefaria/urls.py:1-3`); all real routing is via django-hosts:
  `ROOT_HOSTCONF = 'sefaria.hosts'`, `DEFAULT_HOST = 'library'` (`sefaria/settings.py:444-445`).
  `HostsRequestMiddleware` must be first and `HostsResponseMiddleware` last (`sefaria/settings.py:120,146`).
- `sefaria/hosts.py:17-30`: builds two host regexes from `settings.DOMAIN_MODULES` (every language's `library`
  URL → `sefaria.urls_library`; every language's `voices` URL → `sefaria.urls_sheets`). Unknown hosts fall to
  DEFAULT_HOST = library.
- `NAME_SERVICE=True` pods route every host to `sefaria.urls_name` (autocomplete only) (`sefaria/hosts.py:10-15`,
  `sefaria/urls_name.py:19-36`).
- `DOMAIN_MODULES` shape (`sefaria/local_settings.py:226-235`): `{ "en": {"library": url, "voices": url}, "he": {...} }`.
  Production (`envs/prod/helmrelease.yaml:152-172`): `sefaria.org` (en) / `sefaria.org.il` (he); voices subdomain
  is `voices.` for en and **`chiburim.`** for he. Local example: `www.localsefaria.org:8000`,
  `voices.localsefaria.org:8000`, `www.localsefaria.org.il:8000`, `chiburim.localsefaria.org.il:8000`.
- Module names: `library` and `voices` (`sefaria/constants/model.py` via `LIBRARY_MODULE`/`VOICES_MODULE`;
  JS `static/js/constants.js:27-28`). "Voices" is the sheets/community product ("chiburim" in Hebrew).

### 0.2 URLconf composition order (first match wins)
- Library: `urls_library.urlpatterns` (`sefaria/urls_library.py:17-89`) + operational (`:92-95`) + `shared_patterns`
  (`:97`). If `DOWN_FOR_MAINTENANCE`, everything replaced by `maintenance_patterns` (`:99-100`).
- Voices: `urls_sheets.urlpatterns` (`sefaria/urls_sheets.py:15-35`) + `shared_patterns` (`:37`); maintenance swap (`:38-39`).
- `shared_patterns` (`sefaria/urls_shared.py:20-315`) + `site_urlpatterns` (site package, `sites/sefaria/urls.py`,
  loaded through `sefaria/site/urls.py:1-4` using `SITE_PACKAGE="sites.sefaria"`) + `staticfiles_urlpatterns()`
  + the final **catchall** `^(?P<tref>[^/]+)(/)?$ → reader.views.catchall` (`sefaria/urls_shared.py:317-321`).
- `handler404 = reader.views.custom_page_not_found`, `handler500 = reader.views.custom_server_error`
  (`sefaria/urls_library.py:14-15`, `sefaria/urls_sheets.py:12-13`).
- Maintenance mode keeps `admin/reset/cache`, admin, `healthz`, `health-check`, `healthz-rollout`; everything else →
  `sefaria.views.maintenance_message` (503, `static/maintenance.html`) (`sefaria/urls_shared.py:324-335`, `sefaria/views.py:293-295`).

### 0.3 Edge (nginx) redirects that are NOT in Django
`helm-chart/sefaria/conf/nginx.template.conf.tpl`:
- Bare root domain → `301 https://www.<root>$request_uri` (except `/apple-app-site-association` and
  `/.well-known/apple-app-site-association`, which are proxied with Host=www) (`:69-96`).
- On the **www (library) host**, `location ~ ^/(sheets|collections|profile)(/.*|$)` → **`307`** to the voices
  subdomain, same path (`:172-181`; list from values `domains.modules[].redirects`, prod `envs/prod/helmrelease.yaml:169-172`).
  This is why library Django has no `/sheets/<id>`, `/collections`, `/profile/<slug>` routes.
- `/static/mobile/message-en.json` / `-he.json` → 301 to Strapi `/api/mobile-message(-he)` (`:152-158`).
- `/static/sitemaps/` → proxied to GCS bucket `sefaria-sitemaps` (`:166-169`).
- `/robots.txt` served from configmap (`helm-chart/sefaria/templates/configmap/robots-txt.yaml`): disallow
  `/activity/`, `/login?next=*`, `/register?next=*` (or `Disallow: /` if `disableScraping`).
- `/api/search/<index>/_search|_analyze` is proxied directly to Elasticsearch with basic auth; other `/api/search/*` → 403 (`:113-123`).

### 0.4 Request middleware that affects routing/URL behavior (order: `sefaria/settings.py:119-147`)
1. `SessionCookieDomainMiddleware` — sets session/CSRF cookie Domain to common suffix of all module hosts of the
   same language (e.g. `.sefaria.org`) so login is shared library↔voices; optionally expires legacy domain-less
   cookies when remote-config `EXPIRE_LEGACY_COOKIES` (`sefaria/system/middleware.py:236-356`).
2. `SessionIDAuthMiddleware` — authenticates anonymous requests via encrypted `X-Session-ID` header (chatbot token) (`:359-394`).
3. `UserAgentMiddleware` → `request.user_agent.is_mobile` drives `multiPanel`.
4. `ModuleMiddleware` — sets `request.active_module` from host (match hostname against DOMAIN_MODULES), default
   `library`; skipped (forced library) for `/linker.js`, `/api/`, `/_api/`, `/apple-app-site-association`, `/static/`
   except `/api/img-gen/` which is processed (`:469-516`).
5. `LocationSettingsMiddleware` — `request.country_code` from Cloudflare `cf-ipcountry` (`XX`/missing → `PINNED_IPCOUNTRY`
   setting/env or `us`); `request.diaspora = country != "il"` (`:65-82`).
6. `WebSessionRedirectMiddleware` — appends `no_applink=1` to redirect Locations that continue a web session
   (OAuth callback paths or Referer is a sefaria domain) so iOS universal links don't hijack (`:195-206`,
   `sefaria/utils/views_utils.py:27-44`).
7. `LanguageCookieMiddleware` — if `?set-language-cookie` present and host is language-pinned: set
   `interfaceLang` cookie (cookie domain = language's common suffix), save to profile, redirect to same URL minus
   the param (`:209-233`).
8. `LanguageSettingsMiddleware` — resolves `interfaceLang`, `contentLang`, translation prefs, version prefs and
   **cross-domain language redirect** (`:85-189`), details in §3.6.
9. `ProfileMiddleware` — `?prof` (DEBUG only) returns cProfile output, `?sort=` sorts it (`:411-441`).
10. `ClearSsoNextCookieMiddleware` — deletes `sefaria_sso_next` cookie on `/api/auth/google/redirect` and
    `/accounts/apple/login/callback/finish/` (`:519-541`).

---

## 1. Complete URL table

Legend — Module: **L** = library host, **V** = voices host, **S** = shared (both). "React page" = renders
`base.html` with ReaderApp props (Node SSR when `USE_NODE`), "menu" = `initialMenu`/`menuOpen` value.

### 1.1 Library-only (`sefaria/urls_library.py`)
| Path | View | Renders / does | Notes |
|---|---|---|---|
| `/` | `reader.views.home` (`reader/views.py:4581-4586`) | **302 → `/texts`** | Library has no distinct home; `/texts` is home. |
| `/texts` | `texts_list` (`:1319-1324`) | React page, menu `navigation` (library TOC home) | Title = home title; passes `userHistory` props (`get_user_history_props` `:1348-1358`). |
| `/texts/notes` | `notes` (`:1373-1377`) | menu `notes` ("My Notes") | `@login_required`. |
| `/texts/recent` | `old_recent_redirect` (`:2035-2036`) | **301 → `/texts/history`** | Legacy; `/texts/history` then hits category view which fails TOC lookup and falls back to `texts_list` (`:991-993`). |
| `/texts/<cats...>` | `texts_category_list` (`:977-1010`) | menu `navigation` with `initialNavigationCategories` = path split on `/` | `Tanach` in path → 302 to same path with `Tanakh` (`:982-984`). Unknown category → renders `/texts` home (`:992-993`). `cats=="recent"` branch (`:986-988`) is effectively dead. Title from Hebrew terms for he interface; desc = category enDesc/heDesc → shortDesc → default. JSON-LD category breadcrumbs. |
| `/calendars` | `calendars` (`:1326-1329`) | menu `calendars` ("Learning Schedules") | |
| `/translations/<slug>` | `translations_page` (`:1256-1289`) | menu `translationsPage`, `initialTranslationsSlug` | Only slugs `ar de en eo es fa fi fr he it pl pt ru yi` (Ladino commented out) else 404. Localized title/desc per language. `noindex: False`. |
| `/modtools` | `modtools` (`:1397-1401`) | menu `modtools` | staff only; loads `css/modtools.css` when `page=='modtools'` (`templates/base.html:122-124`). |
| `/linker-editor` | `linker_editor` (`:1404-1410`) | menu `linkerEditor`, `?book=` → `initialLinkerEditorBook` | staff only; loads `css/linker-editor.css`. |
| `/modtools/upload_text` | `sefaria.views.modtools_upload_workflowy` (`sefaria/views.py:2123`) | POST Workflowy upload | |
| `/modtools/links` | `links_upload_api` (`sefaria/views.py:2164`) | POST CSV link upload/delete | staff |
| `/modtools/links/<tref1>/<tref2>` | `get_csv_links_by_refs_api` (`sefaria/views.py:2182-2189`) | CSV download; all GET params forwarded as kwargs | |
| `/modtools/index_links/<tref1>/<tref2>` | same, `by_segment=True` | CSV | |
| `/torahtracker` | `user_stats` (`:1379-1382`) | menu `user_stats` | login required |
| `/explore`, `/explore-<Top>-and-<Bottom>[/<book1>[/<book2>]][/<lang>]` | `explore` (`:5101-5200`) | Legacy D3 explorer template `explore.html` (not ReaderApp) | Default Tanakh/Bavli; category keys Tanakh, Torah, Bavli, Yerushalmi, Mishnah, Tosefta, MidrashRabbah, MishnehTorah, ShulchanArukh, Zohar (dashes stripped). `/he` suffix forces Hebrew content. Unknown category → KeyError 500. |
| `/visualize/library[/<lang>][/<cats>]` | `visualize_library` (`:2693-2699`) | `visual_library.html` | |
| `/visualize/toc` | `visualize_toc` (`:2702`) | `visual_toc.html` | |
| `/visualize/parasha-colors` | (`:2706`) | `visual_parasha_colors.html` | |
| `/visualize/links-through-rashi` | (`:2710-2713`) | `?level=` picks JSON | Bug: compares `request.GET.get("level",1) == 1` — any explicit `?level=` (string) selects the Tanach file. |
| `/visualize/talmudic-relationships` | (`:2715`) | template | |
| `/visualize/sefer-hachinukh-mitzvot` | (`:2719`) | template | |
| `/visualize/timeline` | `visualize_timeline` (`:5202-5204`) | `timeline.html` | staff only |
| `/visualize/unique-words-by-commentator…` | (`:2723`) | template | regex has no `$` |
| `/settings/account` | `account_settings` (`:4556-4578`) | Django template `account_settings.html` with ReaderApp header (`{"headerMode": True}` → Node SSR header) | login required. Regex `^settings/account?$` also matches `/settings/accoun`. Context: social providers, Library Assistant toggle, translation-language list from `SUPPORTED_TRANSLATION_LANGUAGES`, diaspora. |
| `/settings/account/user` | `account_user_update` (`:4241-4283`) | POST change email (requires password) | |
| `/settings/profile` | `settings_profile_redirect` (`:5260-5264`) | **301 → voices `/settings/profile/`** (cross-module) | |
| `/community` | `community_to_voices_redirect` (`:5267-5271`) | **301 → voices `/`** | |
| `/parashat-hashavua` | `parashat_hashavua_redirect` (`:4679-4684`) | 302 → this week's parasha URL | Reads `?diaspora` but ignores it (TODO). |
| `/todays-daf-yomi` | `daf_yomi_redirect` (`:4686-4690`) | 302 → today's daf | |
| `/add/textinfo/<new_title>` | `edit_text_info` (`:1600-1638`) | legacy `edit_text_info.html`; if title exists → redirect `/edit/textinfo/<title>` | staff; **note** `/edit/textinfo/...` is caught by `edit/<path:ref>` → edit_text, not edit_text_info. |
| `/add/new` | `edit_text` (`:1523-1598`) | legacy S1 editor `edit_text.html`, mode "add new" | |
| `/add/<ref>`, `/translate/<ref>`, `/edit/<ref>` | `edit_text` | legacy editor; mode = first path segment capitalized (`:1574-1575`) | Book-level ref → "add new" with title. |
| `/edit/<ref>/<language_family_name>/<version>` | `edit_text` | edits specific version (`_`→space) | |
| `/edit/terms/<term>`, `/add/terms/<term>` | `terms_editor` (`:1640-1660`) | JSON term editor | staff |
| `/dashboard` | `dashboard` (`:4633-4654`) | `dashboard.html` table of all VersionStates | |
| `/activity` , `/activity/<int:page>` | `global_activity` (`:3961-3995`) | `activity.html`; `?type=` filter; `?api` includes API edits | page>40 → "Activity Unavailable". |
| `/activity/leaderboard` | `leaderboard` (`:4101-4107`) | `leaderboard.html` | regex `leaderboard?$` |
| `/activity/<slug>/[<page>]` | `user_activity` (`:3998-4036`) | per-user activity | Bug: `next_page` links to global `/activity/N` (`:4023-4025`). Requires trailing slash form. |
| `/activity/<tref>/<lang>/<version>[/<page>]` | `segment_history` (`:4039-4076`) | revision history for a segment/version | 404 if version missing. |
| `/random/link` | `random_redirect` (`:4718-4723`) | 302 → random segment ref | |
| `/random` | `random_text_page` (`:4726-4730`) | `random.html` | |
| `/compare[/<ref>/][<en|he>/][<v1>/][<v2>]` | `sefaria.views.compare` (`sefaria/views.py:2191-2217`) | `compare.html` (separate React bundle) with `JSON_PROPS` secRef/v1/v2/lang/refArray | Version diff tool. `print(comp_ref)` debug left in. |
| `/garden/<key>` | `custom_visual_garden_page` (`:5333-5337`) | `visual_garden.html` for Garden `sefaria.custom.<key>` | **Shadows** the next two routes (`path:` converter matches slashes). |
| `/garden/sheets/<key>` | `sheet_tag_visual_garden_page` | intended sheet-tag garden | Unreachable (shadowed). |
| `/garden/search/<q>` | `search_query_visual_garden_page` | intended search garden | Unreachable (shadowed). |
| `/vgarden/custom/<key>` | `custom_visual_garden_page` | same as `/garden/<key>` | |
| `/download/version/<title> - <he|en> - <vtitle>.(plain.txt|json|csv|txt)` | `sefaria.views.text_download_api` | file download | |
| `/download/bulk/versions/` | `bulk_download_versions_api` | staff zip | |
| `/admin/heapdump/` | `heapdump_view` | ops | |
| `/api/remote-config` | `remote_config_values` | JSON | |

### 1.2 Voices-only (`sefaria/urls_sheets.py`)
| Path | View | Renders / does | Notes |
|---|---|---|---|
| `/` | `sourcesheets.views.sheets_home_page` (`sourcesheets/views.py:67-71`) | menu `voices` (Voices home) | |
| `/sheets-with-ref/<tref>` | `sheets_with_ref` (`sourcesheets/views.py:983-998`) | menu `sheetsWithRef`; props `sheetsWithRef {en, he}` + search filter/sort/field params | Title "Sheets with <ref>". |
| `/collections` | `reader.views.public_collections` (`reader/views.py:1136-1143`) | menu `collectionsPublic`; `collectionListing` prop | |
| `/collections/new` | `edit_collection_page` (`:1217-1239`) | menu `editCollection`, `initialCollectionData=None` | login required, noindex. |
| `/collections/<slug>/settings` | `edit_collection_page` | menu `editCollection` with data | 404 unknown slug. |
| `/collections/<slug>` | `collection_page` (`:1183-1214`) | menu `collection`; `initialCollectionName/Slug/Tag(?tag)`, `initialTab(?tab)`, `collectionData` | Accepts `privateSlug` → 302 to public slug (`:1192-1194`). `noindex` unless `listed`. Members see private content. |
| `/getstarted` | `serve_static {'page':'sheets'}` | static `templates/static/sheets.html` | |
| `/sheets` | `sheets_redirect_to_getstarted` (`:1176-1180`) | **301 → `/getstarted/`** | |
| `/sheets/new` | `new_sheet` (`sourcesheets/views.py:73-95`) | creates an unlisted empty sheet, then renders it via `catchall(..., sheet=True)` at URL `/sheets/new` | login required; sheet `editor=True` because referer path == `/sheets/new` (`reader/views.py:699-701`). Client replaces URL to `/sheets/<id>` on mount. |
| `/sheets/<int:id>` | `view_sheet` (`sourcesheets/views.py:170-233`) | → `catchall(sheet=True)` (React sheet) unless `?embed=1` | `embed=1` renders legacy S1 `sheets.html` (iframe embed) with canonical stripping `embed=1`. Help-center redirect for specific sheet IDs (§3.5). |
| `/sheets/visual/<int:id>` | `view_visual_sheet` (`:244-278`) | legacy `sheets_visual.html` | |
| `/sheets/<id.node>` (regex `[\d.]+`) | `reader.views.catchall {'sheet': True}` | sheet with highlighted node | e.g. `/sheets/123.4`. |
| `/my/profile…` | `my_profile` (`reader/views.py:4531-4539`) | 302 → `/profile/<own slug>` preserving `?tab=` | regex `^my/profile` (no `$`). |
| `/profile` | `my_profile` | same | |
| `/profile/<username>` | `user_profile` (`:4110-4135`) | menu `profile`, `initialProfile` (full dict if owner else basic), `initialTab` (default `sheets`) | 404 for missing or inactive users. |
| `/settings/profile` | `edit_profile` (`:4541-4553`) | legacy `edit_profile.html` | login required. |

### 1.3 Shared (both hosts) — user-facing pages (`sefaria/urls_shared.py`)
| Path | View | Renders / does | Notes |
|---|---|---|---|
| `/_allauth/...` | allauth headless | SSO API | `:21` |
| `/accounts/...` | allauth urls | OAuth login/callback (Google, Apple) | `:22` |
| `/api/auth/google/redirect`, `/api/auth/google/mobile`, `/api/auth/apple/callback`, `/api/auth/apple/mobile`, `/api/auth/login`, `/api/auth/password/reset` | `sso.views.*` (`sso/urls.py:5-17`) | SSO + JSON email login + reset request | `:23` |
| `/login` | `CustomLoginView` (`sefaria/views.py:95-111`) | React page (`headerMode:False`) → ReaderApp shows `AuthPage` (login flow) because path is an auth path | Logged-in users → 302 `/`. Title "Log in to Sefaria". |
| `/register` | `register` (`sefaria/views.py:257-290`) | React AuthPage (register flow); POST creates user | `?next=`; `?educator=1` pre-checks educator subscribe; POST `noredirect` → JSON; success appends `welcome=to-sefaria` to next (except `new?assignment=` nexts); next validated against host. Logged-in → 302 `/`. |
| `/enable-library-assistant` | `enable_library_assistant` (`reader/views.py:4205-4238`) | sets Library Assistant on (unless `Sec-Fetch-Site: cross-site`), 302 to `?next` (validated), forwards `?welcome` | anonymous → redirect to login. |
| `…logout` | `CustomLogoutView` (`sefaria/views.py:114-136`) | GET or POST logout, then `?next` (host-validated) | regex `logout/?$` unanchored at start but Django fullmatches. Client builds `/logout?next=/texts` (library) or `/logout?next=/` (voices) (`static/js/sefaria/sefaria.js:3867-3870`). |
| `/password/reset/confirm/<uidb64>/<token>/` | `CustomPasswordResetConfirmView` (`sefaria/views.py:139-197`) | React AuthPage reset flow with props `authResetUid`, `authResetValid`; POST JSON sets password; POST `{"action":"resend"}` re-emails | |
| `/api/login/`, `/api/login/refresh/` | JWT (mobile) | | |
| `/saved` | `saved_content` (`reader/views.py:1334-1344`) | menu `saved`; `saved.loaded=true`, 20 annotated items; voices = sheets only | login required |
| `/history` | `user_history_content` (`:1362-1370`) | menu `history`; `userHistory` | login required; respects `reading_history` setting. |
| `/search` | `search` (`:1112-1134`) | menu `search`; `initialQuery`, `initialSearchTab`, filters, field, sort | **noindex**. Title "<q> | Search". |
| `/search-autocomplete-redirecter?q=` | `search_autocomplete_redirecter` (`:2058-2074`) | 302 to ref URL / `/topics/<slug>` / TOC category key / `/search?q=` | Leading `#` forces topic match. Used by OpenSearch (`static/files/opensearch.xml:8`). |
| `/notifications` | `notifications` (`:1385-1394`) | menu `notifications`, scoped by active module | login required |
| `/person/<name>` | `person_page_redirect` (`:5207-5214`) | 301 → `/topics/<person slug>` | 404 if unknown. |
| `/people` | `person_index_redirect` (`:5217`) | 301 → `/topics/category/authors` | |
| `/people/Talmud` | `talmud_person_index_redirect` (`:5221`) | 301 → `/topics/category/talmudic-figures` | |
| `/topics/category/<cat>` | `topics_category_page` (`:1013-1037`) | menu `topics`, `initialNavigationTopicCategory`, `initialNavigationTopicTitle {en,he}` | 404 unknown. |
| `/topics/all/<letter>` | `all_topics_page` (`:1040-1051`) | menu `allTopics`, `initialNavigationTopicLetter` | single char only. |
| `/topics` | `topics_page` (`:3522-3536`) | menu `topics` (topics landing) | desc differs library vs voices. |
| `/topics/b/<slug>` | `topic_page_b` (`:3539-3540`) | topic page with `topicTestVersion="b"` | A/B test variant URL. |
| `/topics/<slug>` | `topic_page` (`:3542-3591`) | menu `topics`, `initialTopic`, `initialTab` (`?tab`, default `notable-sources`), `initialTopicSort` (`?sort`, default `Relevance`), `initialTopicTitle`, `topicData` | slug normalized (`normalize_slug`); **404 if topic not in this module's pool** (`:3554-3557`); noindex if `should_display(min_sources)` false. |
| `/new-home` | `new_home_redirect` (`:4589-4591`) | 302 → `/` | legacy |
| `/account` | `my_profile` | 302 → `/profile/<slug>` | login required |
| `/my/notes` | `my_notes_redirect` (`:1146-1148`) | 302 → `/my/profile?tab=notes` | On library this target is not routed (only nginx `/profile*` redirect) — likely 404 on library. |
| `/sheets/tags` | `topics_redirect` (`:1169-1173`) | 301 → `/topics` | legacy |
| `/sheets/tags/<tag>` | `topic_page_redirect` (`:1151-1155`) | 301 → `/topics/<tag>` | legacy |
| `/sheets/public` / `/sheets/private` | `sheets_pages_redirect` (`:1158-1166`) | 301 → `/sheets` / `/my/profile` | legacy |
| `/groups[/<name>]` | `groups_redirect` (`:1241-1253`) | 302 → `/collections` or `/collections/<slug>` (lookup by name with `-`→space), keeps `?tag` | legacy |
| `/contributors/<uid>[/<page>]` | `profile_redirect` (`:4524-4528`) | 301 → `/profile/<uid>` | legacy |
| `/interface/(english|hebrew)` | `interface_language_redirect` (`:1663-1697`) | sets `interfaceLang` cookie + profile; 302 to `?next` (validated vs ALLOWED_HOSTS) possibly on the other-language domain with `set-language-cookie` | §3.6 |
| `/gauth`, `/gauth/callback`, `/unlink-gauth` | Google Drive OAuth | `unlink-gauth?redirect=0` returns JSON instead of 302 to profile (`sefaria/views.py:372-384`) | |
| `/data.js`, `/data.<ts>.js` | `data_js` (`sefaria/views.py:422-431`) | global `DJANGO_DATA_VARS` (toc, topic_toc, terms, books, search index names, virtualBooks) | `Cache-Control: max-age=31536000, immutable`; base.html requests `/data.<last_cached_short>.js` (`templates/base.html:257`). |
| `/sefaria.js` | `sefaria_js` | packaged Sefaria.js + data for 3rd parties | |
| `/linker.js`, `/linker.v<N>.js`, `/linker.v3.js.map` | `linker_js`, `linker_js_map` | external citation linker plugin; version from remote config default "3" | |
| `/<tref>/<lang>/<version>` | `old_versions_redirect` (`reader/views.py:525-531`) | **301 → `/<tref>?v<lang>=<version>&<orig params>`** | Legacy version URLs; resulting `ven=<title>` is later normalized (§3.2). |
| `/admin/...` (`ADMIN_PATH`) | Django admin | | `:311` |
| `/admin/reset/...`, `/admin/rebuild/...`, `/admin/delete/...`, `/admin/spam...`, `/admin/*stats`, etc. | staff ops views in `sefaria/views.py` | | `:274-310` |
| `/<tref>` (catchall) | `catchall` (`reader/views.py:488-522`) | Text reader / book TOC / sheet | §2–§3 |

### 1.4 Site package pages (`sites/sefaria/urls.py`, appended into shared)
- `/metrics` → `reader.views.metrics` (`:67`; view `reader/views.py:4657-4666`, `metrics.html` chart page). Note `metrics` is
  also in `static_pages` but the explicit route wins.
- `/digitized-by-sefaria` → list of Sefaria-digitized versions (`reader/views.py:4669-4677`).
- `/favicon.ico`, `/apple-touch-icon.png`, `/favicon.svg` → `module_favicon`: per-module icon from `static/icons/<module>/`,
  `Cache-Control max-age=2592000` (`reader/views.py:5446-5468`).
- `/site.webmanifest`, `/manifest.json` → `dynamic_manifest` (module+language specific PWA manifest, `Vary: Accept-Language, Host`) (`reader/views.py:5575-5602`).
- `/apple-app-site-association`, `/.well-known/apple-app-site-association` → AASA JSON (appID `2626EW4BML.org.sefaria.sefariaApp`; excludes `/accounts/*`, `/_allauth/*`, `/api/auth/google/redirect`, and any URL with `no_applink`) (`reader/views.py:5417-5443`).
- `/.well-known/assetlinks.json` → Android app links (`org.sefaria.sefaria`) (`reader/views.py:5482-5493`).
- `/llms.txt` → `static/llms.txt`, 1-day cache (`reader/views.py:5471-5479`).
- **Static pages** (`sites/sefaria/urls.py:11-57,75`) → `serve_static` (`reader/views.py:5049-5057`) renders
  `templates/static/<page>.html` with header-only ReaderApp: strategy, supporters, visualizations, jobs, terms,
  privacy-policy, coming-soon, shraga-silverstein, henry-and-julia-koschitzky-apps, adin-even-israel-steinsaltz,
  william-davidson-talmud, nash-bravmann-collection, linker, ios, mobile, app, sefaria-edition,
  sefaria-community-translation, contributed-to-sefaria, random-walk-through-torah, educators, the-sefaria-story,
  aramaic-translation-contest, newsletter, testimonials, torah-tab, dicta-thanks, daf-yomi,
  powered-by-sefaria-contest-2020, powered-by-sefaria-contest-2021, ramban-sponsorships, contest, design-system,
  word-by-word, cloudflare_site_is_down_en, cloudflare_site_is_down_he, team, products, link-to-annual-report,
  mobile-about-menu, updates, pioneers, ai, metrics(shadowed), fleishman-hirsch-on-torah-in-english.
- **Language-specific static pages** `about`, `ways-to-give` → `templates/static/<LANGUAGE_CODE>/<page>.html` (`:59-62,76`).
- On **voices**, any page in `SITE_SETTINGS.ABOUT_SIDEBAR_PAGES` (about, team, jobs, products, ai, supporters,
  testimonials, metrics, updates, link-to-annual-report, terms, privacy-policy — `sites/sefaria/site_settings.py:26-39`)
  → 301 to the library domain (`reader/views.py:5053-5054`).
- `/dedication/<slug>` → `dedications.views.dedication` (`:77`).
- `/healthz`, `/health-check` (full dependency check: Redis, Node, DB; 503 if not ready), `/healthz-rollout` (library initialized) (`:78-80`; `reader/views.py:5495-5572`).
- Hard-coded external/internal redirects (`sites/sefaria/urls.py:85-106`), all 302 unless noted:
  `/donate/mobile` (→ donate.sefaria.org english/he `?c_src=App` by interface lang), `/donate` (by interface lang),
  `/powered-by` (**301** developers docs), `/wiki`, `/developers`, `/request-a-text` (Google form),
  `/request-a-training`, `/contribute` (GitHub wiki), `/faq` & `/help` (help center by interface lang),
  `/gala`, `/give/<channel_source>` (`c_src=<channel>`), `/give` (`c_src=mu`), `/giving`, `/jf` or `/jfn`
  (→ `https://voices.sefaria.org/sheets/60494`), `/nechama…`/`/Nechama…` (→ `/collections/גיליונות-נחמה`),
  `/contes…` (→ `/powered-by-sefaria-contest-2020`; `/contest` itself is a static page because static routes
  come first), `/dayoflearningcalendar`, `/rabbis` (→ `/educators`), `/connect` (→ `/newsletter`).
- PDF redirects (`:109-117`): `/textmap`, `/workshop`, `/ideasforteaching`, `/strategicplan` → static PDFs;
  `/annualreport2021` (and `/annualreport202`) → `/annualreport/2021`; `/annualreport[/<year>]` → `annual_report`
  (`reader/views.py:5061-5076`; years 2020–2025, default = max key, unknown → 404; template does not extend base.html);
  `/current-990-form` → latest `static/files/Sefaria_<YYYY>_990_Public.pdf` (`reader/views.py:5079-5098`).

### 1.5 API endpoints used by the client (shared; not detailed here)
`sefaria/urls_shared.py:44-315`: `api/profile*`, `api/user_history/saved`, `api/texts/*` (legacy v1), `api/v3/texts/*`,
`api/versions`, `api/index*`, `api/v2/index`, `api/links*`, `api/link-summary`, `api/notes*`, `api/related/<tref>`,
`api/related/<tref>/websites`, `api/counts*`, `api/shape`, `api/preview`, `api/terms`, `api/calendars*`, `api/name/<name>`,
linker-editor/admin `_api/*`, `api/ref/<tref>`, `api/category`, `api/tag-category`, `api/words*`, `api/notifications*`,
`api/updates`, `api/user_stats`, `api/site_stats`, `api/manuscripts`, `api/background-data`, version admin APIs,
`api/sheets*` (save/delete/add/like/visualize/user lists/tags/by-ref/export_to_drive/upload-image), `api/collections*`,
`api/search-wrapper[/es6|/es8]`, `api/dummy-search`, `api/entity-search`, `api/search-path-filter`, `api/follow|unfollow`,
`api/followers|followees`, `api/block|unblock`, `api/authors/<slug>/indexes`, `api/topics*`, `api/topics-graph`,
`api/topics/pools`, `_api/topics/featured-topic`, `api/topics/trending`, `api/ref-topic-links*`, `api/v2/topics`,
`api/topic/new|delete|reorder`, `api/source/reorder`, `api/bulktopics`, `api/recommend/topics`, `api/portals`,
`api/history*`, `api/locks/*`, `api/locktext`, `api/version/flags`, `api/revert`, **`api/img-gen/<path>`** (social images, §5),
`api/passages`, `api/send_feedback`, `api/subscribe*`, `api/newsletter_mailing_lists`, `api/strapi/*`, `api/stats/*`,
`api/register/`, `api/account/delete`, `api/find-refs*`, `api/regexs`, `api/websites`, `api/linker-data`, `api/bulktext`,
`api/text-upload`, `api/linker-track`, `api/guides/<key>`, `api/powered-by`, `api/remote-config`, `api/async/<task_id>`,
`api/knn-search`, `api/opensearch-suggestions`, `api/index/titles`, `api/texts/version-status*`, `api/texts/parashat_hashavua`
(documented broken), `api/texts/translations[/<lang>]` (builds reader URLs `/<firstSectionRef>?ven=<family|title>&lang=bi`,
`reader/views.py:4826-4831`), `api/texts/random` (302 to `/api/texts/<random>?commentary=0&context=0`), `api/texts/random-by-topic`.
Legacy: `api/texts/<tref>/<lang>/<version>` → 301 `api/texts/<tref>?v<lang>=<version>` (`reader/views.py:2025-2032`);
`api/texts/<non-normal tref>` GET → 301 to normalized URL with params (`reader/views.py:1749-1756`).

### 1.6 Routed-nowhere / orphan views (legacy)
- `collections_redirect`, `profile_redirect_to_voices`, `sheets_redirect_to_voices` (`reader/views.py:5274-5310`) — not
  referenced in any URLconf (superseded by nginx 307s).
- `discussions` / `new_discussion_api` (`reader/views.py:4594-4630`), `sheet_tag_garden_page`, `garden_page` (non-visual)
  (`:5323-5367`), `index_node_api` stub (`:2094-2097`) — unrouted.

---

## 2. Query parameters understood by the reader

### 2.1 Text reader (catchall → `text_panels`, `reader/views.py:802-961`) — panel 1
| Param | Server behavior | Client writer |
|---|---|---|
| `ven` / `vhe` | `"<languageFamilyName>|<Version_Title>"` (`_`→space). `_extract_version_params` (`:731-735`) → `currVersions.en` (translation) / `.he` (primary). Pre-normalized by `_get_current_and_normalized_versions` (§3.2). Missing → `{languageFamilyName:'', versionTitle:''}` → server picks defaults (`'primary'`/`'translation'`, `:608-611`). | `Sefaria.util.getUrlVersionsParams` (`static/js/sefaria/util.js:85-94`) writes `&ven=family|Title_With_Underscores` (`;`→`%3B`, `encodeVtitle` `:79-81`). |
| `lang` | Panel display language: `en`/`he`/`bi` → `settings.language` (`:836`, `:601-602` via `short_to_long_lang_code`). Also read by `LanguageSettingsMiddleware` as request `contentLang` (`sefaria/system/middleware.py:154`). | `&lang=` from panel `settings.language.substring(0,2)` (`ReaderApp.jsx:765-767,792-794`). |
| `with` | Sidebar/connections filter: `all` → `[]`; else `_`→space, split on `+` (`:823-829`). Ignored on voices (`:824-825`). If present: multi-panel → Text + Connections panels; mobile → single `TextAndConnections` (`:713-728`). Sets `highlightedRefs=[ref]`, `showHighlight=True` (`:845-846`). First filter determines `connectionsMode` via `get_connections_mode` (`:533-543`): if in sidebar mode list (`Sheets, Notes, About, AboutSheet, Navigation, Translations, Translation Open, Version Open, WebPages, extended notes, Topics, Torah Readings, manuscripts, Lexicon, SidebarSearch, Guide, LinkerAdmin`) → that mode and filter cleared; `"<Cat> ConnectionsList"` → `ConnectionsList` + `connectionsCategory`; `"WebPage:<site>"` → `WebPagesList` + `webPagesFilter`; else `TextList` (commentator filter e.g. `with=Rashi`). | `&with=<sources>` (`ReaderApp.jsx:837`), `sources` = filter joined by `+`, or the connectionsMode if in `sidebarModes` (`:500-501,698-701`), `" ConnectionsList"` suffix for category lists, `WebPage:<site>` for web pages list. |
| `lang2` | Connections panel language when `with` present: must be `en`/`he` else falls back to `lang` (if en/he) else interface lang (`:842-844`); applied to Connections panel only (`:595`). | Read client-side by `ConnectionsPanelHeader` to build a toggle link via `replaceUrlParam("lang2", …)` (`static/js/ConnectionsPanelHeader.jsx:52-55`) — a full navigation link. |
| `vside` | Version filter for the sidebar (`Translation Open`/`Version Open`): `[vside.replace("_"," ")]` (`:834`). Also used (base `vside`, not `vside{n}`) for extra panels (`:881`). | `&vside=` (`ReaderApp.jsx:819-821`), `&vside{i}` for later panels (`:851-853`) — server never reads `vside{i}`. |
| `aliyot` | `1` → `aliyotOn`, else `aliyotOff` override for panel settings (`:847-848`, `:603-604`). | `&aliyot=` written only for Torah books (`Sefaria.titleIsTorah`, `/^(Genesis|Exodus|Leviticus|Numbers|Deuteronomy)/` `sefaria.js:1450-1453`) (`ReaderApp.jsx:686-688,795-797`). |
| `notes` | `notes=1` on a book-level ref → `menuOpen: "extended notes"` (version notes page) with `currVersions` (`:553-561`, `:837`). | `hist.url = "<Book>&notes[i]=1"` (`ReaderApp.jsx:544-549`). |
| `lookup` | `selectedWords` for Lexicon sidebar (`:849`, `:597`). | `&lookup=` (`ReaderApp.jsx:822-824`). |
| `sbsq` | `sidebarSearchQuery` (search-in-book sidebar) (`:850`). | `&sbsq=` (`ReaderApp.jsx:828-830`). |
| `namedEntity` / `namedEntityText` | Selected named-entity slug/text for Lexicon sidebar (`:851-852`). | `&namedEntity=`, `&namedEntityText=` (`ReaderApp.jsx:825-833`). |
| `tab` | `initialTab` prop (`:905`); used for book TOC tab (`ReaderApp.jsx:111-113`). | `addTab` appends `&tab=` for menu pages except search (`ReaderApp.jsx:502-508,671`). |
| `mobile` | Presence forces single-panel/mobile layout (`:818`; `base_props` `:347`). | — |
| `debug_mode` | `_debug_mode` prop (`:368`); `linker` enables linker debugging; client re-appends `&debug_mode=linker` to every URL (`ReaderApp.jsx:798-800,834-836`). | `Sefaria.util.setLinkerAdminUrlParams` sets `with=LinkerAdmin&debug_mode=linker` (`util.js:1280-1289`). |
| `embed` | Template var `EMBED` → `body.embeded` class (`sefaria/system/context_processors.py:120-122`, `templates/base.html:208`); for sheets `embed=1` → legacy embed page. | — |
| `p<N>` (N≥2) | Additional panel ref; `p<N>=search` → search panel (`:859-867`). Invalid refs silently skipped (`:869-873`). | `&p<N>=` (`ReaderApp.jsx:841-843,870-872`). |
| `ven<N>`/`vhe<N>` | Versions for panel N (`:876-877`), then `override_version_with_preference` (corpus prefs; only for extra panels, `:878`, `:1098-1109`). Panel skipped if version title not found by legacy `language: en/he` lookup (`:893-897`). | `getUrlVersionsParams(..., i)` writes suffix only when i>1 (`util.js:89`). |
| `w<N>` | Connections filter for panel N (`all`→[]) (`:879-880`). | `&w<N>=` (`ReaderApp.jsx:866`). |
| `lang<N>`, `aliyot<N>`, `notes<N>`, `lookup<N>`, `sbsq<N>`, `namedEntity<N>`, `namedEntityText<N>` | Per-panel equivalents (`:883-892`). | Written at `ReaderApp.jsx:845-865,876-883`. **Bug:** client writes literal `&sbsq{i}=` (missing `$`) (`:857-859`). |
| `q<N>`, `tab<N>`, `search_tab<N>`, `tpathFilters<N>`… | For `p<N>=search` panels via `get_search_params(get_dict, i)` (`:1054-1087`). Note the text/sheet check reads unsuffixed `tab` (`:1066`). | Search panel URL is `search&q=…&tab=…` then `=` replaced with `<N>=` (`ReaderApp.jsx:870-872`). |
| `set-language-cookie`, `no_applink`, `chatbot_version`, `prof`, `sort` | see §0.4 / §3.6 / §5 | `no_applink` stripped on load by `client.jsx:12-18`. |

Params the reader does **not** parse server-side (checked: `grep request.GET` in `reader/views.py`): `sidebarLang`,
`layout`, `filter`, `mode`, `qh` — none exist in the current reader. (`layout`/`language` only exist on
`api/sheets/<id>/export_to_drive`, `sourcesheets/views.py:1069-1070`; `sidebarLang` is only a legacy template
var in `templates/edit_text.html:45`.)

### 2.2 Other page params
| Page | Params | Where |
|---|---|---|
| `/search` | `q`, `tab` (`text`/`sheet` search type; default `text`), `search_tab` (results tab sources/books/authors/topics), text: `tpathFilters` (`|`-separated, URL-unquoted), `tvar` (`1` = `naive_lemmatizer`, `0` = `exact`), `tsort`; sheet: `scollectionsFilters`, `stopics_enFilters`, `stopics_heFilters`, `ssort` | `reader/views.py:1054-1087,1114-1134`. Client writes them via `SearchState.makeURL` (`static/js/sefaria/searchState.js:127-157`: `&{prefix}{agg}Filters=`, `&{prefix}var=0|1`, `&{prefix}sort=`) and `ReaderApp.jsx:550-561`. Server bug: sheet filter `agg_types += [filter_type] * len(filters)` uses cumulative length (`:1072-1074`); `svar` never parsed. |
| `/sheets-with-ref/<tref>` | same search filter/sort/field params (prefix `s`) | `sourcesheets/views.py:983-998`; client `ReaderApp.jsx:530-537`. |
| `/topics/<slug>` | `tab` (default `notable-sources`), `sort` (default `Relevance`) | `reader/views.py:3575-3576`; client writes `&sort=` (`ReaderApp.jsx:565`) and `&tab=` (addTab). Topic editors redirect to `/topics/<slug>?sort=Relevance&tab=<tab>` (`static/js/Misc.jsx:1083-1089`, `static/js/SourceEditor.jsx:56-59`). |
| `/profile/<slug>`, `/my/profile` | `tab` (default `sheets`; e.g. `notes`) | `reader/views.py:4124`, `:4537-4538`. |
| `/collections/<slug>` | `tag`, `tab` | `reader/views.py:1203-1204`; client writes `&tag=` with `#`→`%23` (`ReaderApp.jsx:596-598`). |
| `/linker-editor` | `book` | `reader/views.py:1409`; client `ReaderApp.jsx:646-648`. |
| `/login`, `/register`, `/logout`, `/interface/*`, `/enable-library-assistant`, `/gauth` | `next` (validated); `/register?educator=1`; `welcome` (forwarded) | §1.3. Client `withNext` (`static/js/auth/utils.js:75-77`), `safeNext` same-origin check (`:41-50`). |
| `/activity*` | `type`, `api` | `reader/views.py:3976-3981,4020,4057`. |
| `/sheets/<id>` | `embed=1` | `sourcesheets/views.py:179-181,216`. |
| `/api/img-gen/<path>` | `lang` (en/he; `bi`/invalid → host language), `ven`/`vhe` (title or family|title), `platform` (`facebook`|`twitter`) | `reader/views.py:1979-2022`. |
| `/visualize/links-through-rashi` | `level` | `reader/views.py:2711`. |
| `/edit/textinfo` | `toc` (no effect) | `reader/views.py:1616`. |
| Any page | `chatbot_version=<int>|clear` (stored in session, swaps chatbot script to `https://<n>.ai-server.coolifydev.sefaria.org/...`) | `sefaria/system/context_processors.py:148-172`, `reader/views.py:372-373`, `ReaderApp.jsx:2575`. |
| Any page | `?prof[&sort=]` (DEBUG only) | `sefaria/system/middleware.py:411-441`. |

Hash fragments used: `#afterLoading=exportToDrive` and legacy `#onload=exportToDrive` (sheet Google-Drive export
after OAuth) (`static/js/sheets/SheetModals.jsx:162-182`, `static/js/sheets/SheetOptions.jsx:31`). The client preserves
any `location.hash` when it pushes/replaces history (`ReaderApp.jsx:911-914`).

Legacy-only params still emitted by old code: `?editor=1` on sheets (`static/js/sheets.js:2764,2780`) — not read by the
React app; `new?assignment=` in register next (`sefaria/views.py:266`).

---

## 3. Redirect & normalization rules (edge cases)

### 3.1 Ref URL normalization (catchall, `reader/views.py:488-522`)
- Ref is parsed with `Ref.instantiate_ref_with_legacy_parse_fallback(tref)` (`sefaria/model/text.py:4452-4482`):
  1) plain `Ref(tref)`; 2) on `PartialRefInputError`, normalize title then use a per-index Mongo-backed
  `LegacyRefParser` (`sefaria/helper/legacy_ref.py:49-196`, e.g. remapped old Zohar refs); 3) else return the
  partially matched ref. `InputError` → **404**.
- On voices, a non-sheet ref → **301 to the library domain**, same path + query (`:507-509`, `redirect_to_module` `:5225-5257`).
- Canonical form = `oref.url(False)` (`sefaria/model/text.py:4310-4333`): normal English ref, spaces→`_`, `:`→`.`,
  and the last `_` before sections becomes `.` (`Mishna_Brachot_2:3` → `Mishna_Brachot.2.3`); with `encode_html`
  `?`→`%3F`. If the incoming `tref` differs (case, alt/Hebrew title, `Genesis 1:1`, `Gen.1.1`, Talmud forms, etc.) →
  **301 to canonical, query string preserved** (`:512-514`, `:5241-5248`).
- Trailing slash accepted by the catchall regex `(/)?` without redirect.
- Book-level ref (`/Genesis`) → panel `menuOpen: "book toc"` with `indexDetails` (content counts + `relatedTopics`)
  and `versions` (`:550-569`). With `?notes=1` → `extended notes` page.
- Non-book refs: `first_available_section_ref()` (`:571-572`; model `sefaria/model/text.py:3241-3273`) — super-section
  or empty refs jump to the first section with content (e.g. `/Genesis.1` stays; a complex-node ref goes to first leaf).
  Spanning refs split into `refs` list (`:576`). Segment-level or ranged refs → `highlightedRefs` = each segment (`:635-636`).
- Ref whose book is `Sheet` (e.g. `/Sheet.123`) renders as a sheet even on library (`:807-812`).
- Torah refs include `indexDetails` for parashah headers (`:632-633`).
- Client-side, `TextRange` replaces history (no new entry) when the loaded data's normalized ref differs, when the ref is
  spanning (→ split refs), or when it is a super-section (→ `firstAvailableSectionRef`) (`static/js/TextRange.jsx:113-130`).
- Client: commentary refs with a single base text and depth ≥3 (e.g. `Rashi on Genesis 1:1:1`) open as base text
  `Genesis 1:1` + commentary sidebar filter `Rashi` (`ReaderApp.jsx:1760-1767`; `sefaria.js:2609-2690`) — note the
  server does **not** do this conversion for direct URL loads.

### 3.2 Version param normalization (`reader/views.py:424-485`)
- For the main ref and every `p<N>`, `ven<N>`/`vhe<N>` are matched against `Ref(tref).version_list()` by direction
  (`ven`=ltr, `vhe`=rtl): exact (family+title) → family-only → title-only. Legacy title-only values (no `|`) are accepted.
- If any normalized value differs from the incoming one, **302 to `/<tref>/?<params>`** with values replaced or
  **unmatched version params removed** (`:497-498`, `:424-435`). Note the redirect uses the raw `tref` and adds a `/`
  before `?`.

### 3.3 Module (library↔voices) redirects
- Django: library `/settings/profile` → voices `/settings/profile/`; library `/community` → voices `/`; voices
  about-sidebar static pages → library; voices non-sheet refs → library (`reader/views.py:5053-5054,5260-5271,507-509`).
  Cross-module redirects are **301** and use `DOMAIN_MODULES[<interface lang short code>][module]` (`:5250-5257`).
- nginx: library `/sheets*`, `/collections*`, `/profile*` → **307** voices (§0.3).
- `/sheets` (voices) → 301 `/getstarted/`.

### 3.4 Legacy URL redirects (complete list)
`/texts/recent`→`/texts/history` (301); `/texts/…Tanach…`→`Tanakh` (302); `/<tref>/<lang>/<version>`→`?v<lang>=` (301);
`/api/texts/<tref>/<lang>/<version>` (301); `/sheets/tags[/<tag>]`→`/topics[/<tag>]` (301); `/sheets/public|private` (301);
`/groups[/<name>]`→`/collections…` (302); `/contributors/<uid>`→`/profile/<uid>` (301); `/person/<name>`→`/topics/<slug>` (301);
`/people[/Talmud]` (301); `/new-home`→`/` (302); `/my/notes`→`/my/profile?tab=notes`; `/account`, `/profile`, `/my/profile`→`/profile/<slug>`;
`/` (library)→`/texts`; collection private slug → public slug; `/edit/textinfo` add-new → edit; `/annualreport2021`.

### 3.5 Help-center sheet redirects
`get_redirect_to_help_center` (`sefaria/utils/util.py:642-659`): if a sheet id appears in
`SITE_SETTINGS.HELP_CENTER_REDIRECTS[<lang>]` (`sites/sefaria/site_settings.py:48+`, ~30 en ids plus he), viewing
`/sheets/<id>` or `/sheets/<id>.<node>` 302s to the Zendesk help-center article (`sourcesheets/views.py:175-177`,
`reader/views.py:518-520`). Language = `request.LANGUAGE_CODE` falling back to `en`.

### 3.6 Language domains & interface language
- Interface language resolution (`sefaria/system/middleware.py:120-127,90-96`): profile `interface_language` →
  `interfaceLang` cookie → `cf-ipcountry` (`IL` → hebrew) → Accept-Language (`he`, `he-il`) → `english`; only
  english/hebrew allowed. For `/api/`, `/_api/`, `/linker*.js`, `/interface/`, `/accounts/`, `/_allauth/`, AASA,
  `/.well-known/`, static: resolved from cookie/header only, no redirect, `contentLang=bilingual` (`:108-118`).
- If the host is pinned to a language (`current_domain_lang`, `sefaria/utils/domains_and_languages.py:34-62`; ambiguous
  hosts like localhost are unpinned) and it differs from the resolved interface language: crawlers/bots (Googlebot,
  Bingbot, Slurp, DuckDuckBot, Baiduspider, YandexBot, Facebot, facebookexternalhit, ia_archiver, Sogou,
  python-request, curl, Wget, **sefaria-node**) get the domain's language with no redirect; humans are **302-redirected
  to the same module on the other-language domain** with `?set-language-cookie` appended (`middleware.py:129-149`).
  Then `LanguageCookieMiddleware` on the target sets the cookie and strips the param (§0.4).
- `/interface/<english|hebrew>?next=` (`reader/views.py:1663-1697`) — explicit switch; cookie set on current domain's
  cookie-domain; if a domain switch is needed, next becomes absolute on target domain + `set-language-cookie`.
  Header links use `NextRedirectAnchor` → `window.location.href = /interface/<lang>?next=<encoded current path>`
  (`static/js/common/DropdownMenu.jsx:39-54`, `static/js/Header.jsx:599-607`).
- Content language (`middleware.py:151-162`): `?lang` → `contentLang` cookie → default (`hebrew` for he interface else
  `bilingual`); only english/hebrew/bilingual. If `SITE_SETTINGS.TORAH_SPECIFIC` is false both forced to english.
- Translation-language preference: profile setting → `translation_language_preference` cookie; suggestion from
  country languages ∩ `SUPPORTED_TRANSLATION_LANGUAGES` (`en, es, fr, de`), never `en`, unless already suggested
  (`translation_language_preference_suggested`) (`middleware.py:164-177`). Client setter writes both cookies and
  profile (`ReaderApp.jsx:2144-2157`).
- Version preferences by corpus: profile attr → `version_preferences_by_corpus` cookie (URL-encoded JSON) (`middleware.py:179-182`).

### 3.7 404 / errors
- `Http404` → `custom_page_not_found` renders `404.html` (extends base.html, header-only, bilingual message, title
  "Page Not Found | Sefaria") status 404 (`reader/views.py:5386-5388`, `templates/404.html`). 500 → `500.html` (`:5401-5408`).
- 404 triggers: bad ref; topic not found or not in module pool; unknown collection/translation slug/profile/inactive
  profile; sheet load error (`make_sheet_panel_dict` `:670-671`); unknown annual-report year; segment history w/o version.
- Unrecognized extra panels `p<N>` are skipped silently rather than 404.

---

## 4. Client history / URL-state behaviors (`static/js/ReaderApp.jsx`)

### 4.1 Bootstrapping panels from props
- `initialMenu` → panel 0 `{mode:"Menu", menuOpen, searchQuery, tab(initialSearchTab), topicSort, searchState
  (filters/field/aggTypes/sort; type from module: library→`text`, voices→`sheet`), sheetsWithRef, navigationCategories,
  navigationTopicCategory, navigationTopic, navigationTopicTitle, navigationTopicLetter, topicTitle, topicTestVersion,
  profile, collectionName/Slug/Tag, translationsSlug, collectionData, linkerEditorBook}` (`:59-91`).
- `initialPanels` (server panels) are cloned and appended (`:95-96`). Panels without `settings` but with versions get
  language inferred (both→bilingual, he→hebrew, en→english) (`:98-105`); settings merged over defaults (`:106`);
  `*AndConnections` panels set `highlightedRefs=refs` (`:108-110`); book toc panels get `tab=initialTab` (`:111-113`).
- Defaults from `initialSettings` (cookies, `reader/views.py:353-364`) or hard defaults (`:975-994`): language
  bilingual, layoutDefault segmented, layoutTalmud continuous, layoutTanakh segmented, aliyotTorah aliyotOff, vowels all,
  punctuationTalmud punctuationOn, biLayout stacked, color light, fontSize 62.5.
- `makePanelState` full panel schema (`:148-212`); if no version set for the displayed language, uses
  per-book cached version from `defaultVersions` (`:203-210`, `:1707-1715`).
- Layout orientation rtl for Hebrew interface (`:118`). Auth state from `resolveInitialAuthState` (`static/js/auth/utils.js:61-67`):
  `/login`, `/register` (optionally trailing `/`) or `authResetUid` → `showAuth`.

### 4.2 makeHistoryState (`:488-892`) — URL generation per panel
- Auth: `{state:{showAuth, authPath, authSource, panels:[]}, url: authPath}` (`:490-493`).
- Menu pages (`hist.menuPage`, no `lang` param) (`:515-671`):
  `navigation` → `/texts[/<cats joined by />]`; `voices` → `/`; `sheetsWithRef` → `/sheets-with-ref/<encodeURIComponent(en ref)>` + `s`-prefixed search params;
  `book toc` → `/<Book_Title>`; `extended notes` → `/<Book>&notes[i]=1` (+ currVersions); `search` → `/search&q=<enc>&tab=<text|sheet>&search_tab=<tab>` + `t`/`s` filter params (no params if empty query);
  `topics` → `/topics/<slug>` (or `/topics/<testVersion>/<slug>`) + `&sort=`, `/topics/category/<cat>`, or `/topics`;
  `allTopics` → `/topics/all/<letter>`; `profile` → `/profile/<slug>`; `notifications`; `collection` → `/collections/<slug>&tag=`;
  `editCollection` → `/collections/<slug>/settings` or `/collections/new`; `collectionsPublic` → `/collections`;
  `translationsPage` → `/translations/<slug>`; `calendars`; `sheets` → `/`; `updates` → `/updates`; `modtools`;
  `linkerEditor` → `/linker-editor&book=`; `user_stats` → `/torahtracker`; `saved`; `history`; `notes` → `/texts/notes`.
  All menu pages get `&tab=` when panel has a `tab` (except search) (`:502-508`).
- `Text` panel: URL ref = highlighted range if it overlaps currentlyVisibleRef, else currentlyVisibleRef (`:673-683`), via
  `Sefaria.normRef` (underscores/dots) (`sefaria.js:138-150`); `&aliyot=` for Torah; currVersions → `ven/vhe`.
- `Connections` panel: `sources` = `WebPage:<filter>` or filter list / sidebar mode / `all`, `" ConnectionsList"` suffix;
  adds versionFilter (Translation/Version Open), SidebarSearch query (and copies the parent panel's refs!), Lexicon words/entity (`:690-723`).
- `TextAndConnections` (mobile) (`:725-750`) → `/<ref>?with=<sources>` etc.
- `Sheet` → panel 0: `/sheets/<id>[.<node>]`; other positions: `sheet&s=<id>` → serialized as `&p<N>=sheet&s<N>=…`
  which the server **cannot** parse (Ref("sheet") fails → panel silently dropped) (`:752-762`).
- No panels (headerMode over static page): URL = current path + query; title = `document.title` (`:771-782`).
- Merge (`:784-884`): first panel URL + versions + `with` (mobile) + `lang` + `aliyot` + `debug_mode`.
  Text/Sheet followed by Connections at i=1 → short form `/<ref>?…&with=<sources>` with `vside`, `lookup`,
  `namedEntity`, `sbsq`, `namedEntityText`, `debug_mode`. For i≥2 Connections → rewrites `&p<i>=<connections ref>` +
  versions of preceding text panel suffixed `<i>` + `lang<i>`, `aliyot<i>`, `vside<i>`, `lookup<i>`, `sbsq{i}`(bug),
  `namedEntity<i>`, `namedEntityText<i>`, `&w<i>=`. Other panels → `&p<i+1>=…` with every `=` in that panel's
  sub-URL suffixed by `i+1` plus versions `<i+1>`, `lang<i+1>`, `aliyot<i+1>`. Titles joined with "and".
  **Bug:** at i==1 the `aliyot` is appended to the stale local `url`, not `hist.url` (`:816-818`), so it is lost.
- Finally all `?` in the assembled URL → `%3F` (refs with question marks), then the first `&` → `?` (`:885-889`).

### 4.3 updateHistoryState / push vs replace (`:893-931`)
- Called from `componentDidMount` with replace=true (initial page state stored in history) (`:214`) and from every
  `componentDidUpdate` with `this.replaceHistory` (`:310-312`), skipped right after a popstate (`justPopped`, `:272-276`).
- `this.replaceHistory` is consumed and reset first (`:904`). Skips if `shouldHistoryUpdate()` false (`:414-483`) —
  compares to `history.state`: showAuth/authPath, panel count, mode, menuOpen, bookRef, last ref, highlightedRefs,
  filter, connectionsMode, connectionData, currVersions, searchQuery, tab, topicSort, collectionName/Tag,
  linkerEditorBook, search filters/field/sort, settings.language, settings.aliyotTorah, navigationTopicCategory,
  navigationTopic, navigationCategories, highlightedNode, and sheet title becoming available. **Bug:** the
  `versionFilter` check calls `prev.versionFilter(next.versionFilter)` as a function (`:447`) and keys off `next.mode`
  (which is never "Translation Open").
- Replace → `history.replaceState`; if URL changed, delayed (3s) intent analytics. Push → never pushes an identical URL
  (`:922`), then `trackPageview`. Title set with `$("title").html(hist.title)` (`:928`).
- Replace (not push) is used for: scrolling/infinite load (`updateTextColumn`), currentlyVisibleRef changes,
  setTextListHighlight / setFocusedText, collection name load, language option change, ref normalization in TextRange,
  connections focus changes in mobile TextAndConnections, `setTab` when TabView mounts after ReaderApp update
  (`static/js/ReaderPanel.jsx:311-336,544,585-604,222-229,259-292`), Linker Admin params
  (`ReaderPanel.jsx:196-207` direct `history.replaceState`), and SearchPage programmatic tab (`static/js/SearchPage.jsx:567-583`).
- Scroll position persisted into `history.state.scrollPosition` (300ms debounce) and restored on pop (`:965-974`, `:345-350`).
- `handlePopState` (`:316-354`): restores panels (re-hydrating `SearchState` objects), labels search-analytics source
  `back_click` when popping into search, deep-clones panels.
- Analytics on URL change: `trackPageview` sets page type, #panels ("2" / "3.2"), refs, book names, primary/secondary
  category, content languages, version titles, sidebars (`:355-413`); `saveLastPlace` after 3s intent (`:948-959`, `:2161-2167`)
  → `Sefaria.saveUserHistory`.

### 4.4 In-app link interception (`openURL`, `:1330-1456`)
- Global click handler on `.readerApp` (`:2587`) and, in headerMode, on all `<a>` outside React (`:220-224`).
- Modifier clicks (cmd/ctrl/shift/alt) are left to the browser (capture-phase listener) but first rewrite
  `data-target-module` links to the right subdomain and report search-result clicks (`:1152-1172`, `:1305-1328`);
  right-click also rewrites module links (`:1321-1328`).
- Skips: default-prevented, legacy S1 sheet builder (`sjs` defined), links with a non-`_self` target, missing href.
- Mobile: every link replaces the panel; desktop: links inside `.sheetItem` open a new panel at end; links inside
  `.translationsPage` override content language from the link's `?lang` (`:1214-1244`, `:1368-1372`).
- Unsaved sheet-editor changes → `confirm()` before navigating (`:1337-1341`, `:1947-1954`).
- External hosts (not in current-language `DOMAIN_MODULES` hostnames, `sefaria.js:554-595`) or a link whose
  `data-target-module` ≠ active module → `window.open(_blank)`. On voices, about-sidebar paths open the library page in a new tab (`:1359-1364`).
- `/login`, `/register` → in-app AuthPage with `next` = current path (`:1375-1379`); `data-signup-source` captured for funnel analytics (`:1212`).
- Handled in-app paths: `/`, `/texts`, `/history`, `/saved`, `/texts/notes`, `/texts/<cats>`, `/collections`, `/my/profile[?tab]`,
  `/notifications`, `/calendars`, `/torahtracker`, `/linker-editor[?book]`, `/sheets/<id>`, `/topics`, `/topics/category/<c>`,
  `/topics/all/<l>`, `/topics/<slug>` (tab param passed but `openTopic(slug)` ignores it, `:2081-2085`), `/profile/<slug>[?tab]`,
  `/collections/<slug>[?tag]` (not `/settings`, `/new`), `/translations/<slug>`, any ref (with `ven`/`vhe` from params,
  ranged refs highlighted) (`:1383-1450`). Everything else (e.g. `/search?…`, `/sheets-with-ref`, `/collections/new`,
  static pages) returns false → normal full page load.
- `sefaria:bootstrap-url` DOM event (`:1246-1303`): external code (chatbot) can navigate the app; refs go through
  `handleNavigationClick` (passes `{replaceHistory}` as panel *options*, not as the replaceHistory flag — likely ineffective).
- `sefaria:settings-updated` event updates translation preference, reading-history flag, calendars (`:1259-1271`).
- Header autocomplete: `/search?q=` full reload when on legacy S1 pages; object results call `openURL` with `?`→`%3F`,
  falling back to `window.location` (`static/js/HeaderAutocomplete.jsx:505-525`).

### 4.5 Panel URL-affecting operations
- `openPanel`/`openPanelAt` (`:1722-1808`): book title → book toc panel; `Sheet <id>[:<node>]` → sheet panel; commentary→base conversion; spanning arrays.
- `openTextListAt` (connections panel; never bilingual) (`:1840-1875`), `openComparePanel` (`menuOpen navigation, compare:true`) (`:1830-1839`),
  `closePanel` (closes following Connections/compare; last panel → `showRoot`) (`:1955-1989`), `showRoot` → voices home or library TOC (`:2020-2026`).
- Multi-panel widths: Text/Sheet+Connections|search|compare = 68/32%; 3-panel layouts 37/26/37 or 37/37/26; else even split,
  min panel width 360px with horizontal scroll and auto-scroll to newly opened panel (`:2389-2417`, `:281-308`, `:1015-1020`).

---

## 5. SSR, bootstrapping, meta/SEO

### 5.1 SSR pipeline
- `render_template` (`reader/views.py:206-233`): merges `base_props(request)` + view props + `remoteConfig` (remote
  config `CLIENT_REMOTE_CONFIG_JSON`) → `propsJSON`; if view props present, POSTs to Node `NODE_HOST/ReaderApp/todo`
  (`render_react_component` `:236-285`) and injects HTML; otherwise `renderStatic=True` (header only, client-rendered).
  Node down/timeout → `elements/loading.html` placeholder (logo per module/lang) unless `FAIL_IF_NODE_SSR_UNAVAILABLE`.
- Node server (`node/server.js:103-138`): loads shared data (toc, topic_toc, terms, books, virtualBooks) from Redis,
  refreshing when Django's `last_cached` is newer; calls `Sefaria.setup(data, props, resetCache=true)`,
  `unpackDataFromProps`, `renderToString(ReaderApp)`. Also `/Footer/:cachekey` and `/healthz`.
- `templates/base.html:230-246`: `#s2` holds SSR HTML; static pages put content in `#staticContentWrapper/#content` and
  `#s2.headerOnly`. `DJANGO_VARS = {props, inReaderApp: !renderStatic}` (`:270-273`); `STRAPI_INSTANCE`.
- Client (`static/js/client.jsx:11-73`): strip `no_applink`; init Sentry (sample rates from remote config, release =
  appVersion); `hydrate` (or `render` if `#appLoading` placeholder present); headerMode for static pages with
  `multiPanel = width > 600`; optional `DJANGO_VARS.containerId/reactComponentName` to mount a single component.
- `Sefaria.unpackDataFromProps` (`static/js/sefaria/sefaria.js:3953-4003`) seeds caches from SSR props (panel text,
  versions, indexDetails, sheet, collectionData, translationsData, topicData, topicList, collectionListing,
  versionPreferences, `_initialPath`) then `unpackBaseProps` (`:4006-4058`) copies base props onto `Sefaria`.
- `base_props` fields (`reader/views.py:288-405`): user (`_uid, _email, slug, is_moderator, is_editor, is_sustainer,
  experiments, full_name, profile_pic_url, is_history_enabled, translationLanguagePreference, versionPrefsByCorpus,
  following, blocking, calendars (diaspora/custom), notificationCount, notifications (module-scoped), saved (unloaded),
  last_place`), `activeModule, last_cached, multiPanel, initialPath, interfaceLang, countryCode, domainModules,
  translation_language_preference_suggestion, initialSettings (cookies), numLibraryTopics, _siteSettings, _debug,
  _debug_mode, appVersion`, chatbot props (`chatbot_user_token, chatbot_enabled, chatbot_api_base_url, chatbot_version,
  chatbot_max_input_chars, chatbot_max_prompts, chatbot_promo_*`, `chatbot_origin`, `show_join_chatbot_banner`,
  `in_chatbot_experiment`), `googleClientId, appleClientId, recaptchaSiteKey`. Voices restricts saved/last_place to sheets.
- `/data.<ts>.js` loaded before the bundle; `last_cached_short` cache-busts it (`templates/base.html:257`,
  `sefaria/system/context_processors.py:100-105`).

### 5.2 Meta tags / SEO (`templates/base.html`, `reader/templatetags/sefaria_tags.py`)
- `{% meta_title %}` emits `<title>`, `og:title`, `twitter:title`; `{% meta_desc %}` emits description, og:description,
  twitter:description (`sefaria_tags.py:64-108`).
- Titles via `get_page_title(base, module, page_type)` (`reader/views.py:137-195`): "`<title> | <suffix>`", suffixes:
  home — "Voices on Sefaria" / "Sefaria: a Living Library of Jewish Texts Online"; topic — "Sheets from Voices on Sefaria" /
  "Texts from the Sefaria Library"; collections/collection — voices only; default — "Voices on Sefaria" / "Sefaria Library".
  Sheet titles strip tags, empty → "Untitled". Client mirror `Sefaria.getPageTitle` (`sefaria.js:3903-3947`) with i18n keys.
- Descriptions: text pages = first ~160 chars of the segment text (interface-language first, fallback other; bleach-cleaned,
  word-truncated + "…") or book enDesc/heDesc + "Read the text of X online…" (`reader/views.py:917-943`); sheets = summary or default;
  topics, categories, search, translations, etc. have specific descriptions.
- `noindex` → `<meta name="robots" content="noindex, nofollow">` also always in DEBUG (`base.html:15-17`). noindex set on:
  search, edit collection, unlisted collections, non-public or `noindex` sheets, topics below `MIN_SOURCES_FOR_TOPIC_DISPLAY`.
- `canonical_url` (`reader/views.py:1413-1428`): only when `TORAH_SPECIFIC`; host `https://www.sefaria.org.il` for Hebrew
  interface else `https://www.sefaria.org` (**even on voices**), full path; strips exactly `?lang=he[&aliyot=0]` (he) or
  `?lang=bi[&aliyot=0]` (en) defaults; `/` → bare host. Emitted for text panels, category pages, menu_page pages.
- hreflang alternates: `https://www.sefaria.org<path>` (en) and `https://www.sefaria.org.il<path>` (he) on every page
  (path only, no query; hard-coded www hosts even for voices) (`base.html:21-24`).
- OpenGraph/Twitter image: `/api/img-gen<path>?lang&platform&ven&vhe` absolute on current host (`sefaria_tags.py:49-61`),
  1200×630 png; `og:type website`; `og:url` = current host + full path; `twitter:card summary_large_image`,
  `twitter:site @sefariaproject`. `/api/img-gen` classifies the path against the module's URLconf
  (`reader/views.py:753-799`): static page → generic image; library catchall → rendered text image (ref title + text in
  chosen version/lang, category colors); everything else → module fallback image.
- JSON-LD BreadcrumbList: texts (`Texts` → each category `/texts/<cats>` → book `/<Title>` → schema nodes → section crumbs,
  `reader/views.py:1462-1520`) and sheets (Topics → main topic → Source Sheet, `:1443-1459`).
- Other head items: OpenSearch descriptor (`static/files/opensearch.xml`), `apple-itunes-app` banner (id 1163273965),
  per-module favicons/apple-touch icon/manifest (`?v=3`), `theme-color` (#518159 voices / #18345D library),
  `apple-mobile-web-app-title` (Voices/Library), `<html lang>`, body classes `interface-<lang>` and `embeded`,
  `data-active-module`; conditional third-party scripts (GTM + VWO, Hotjar, gtag with `user_id/traffic_type/site_lang/site_version`,
  Simple Analytics with metadata, Unbounce, Google Identity / Apple ID / reCAPTCHA only for logged-out users, chatbot script).
- Sitemaps are generated offline (`sefaria/sitemap.py`) and served from GCS via nginx `/static/sitemaps/`.

---

## 6. Surprising / legacy findings (flag list)
1. `/garden/sheets/<key>` and `/garden/search/<q>` are unreachable — shadowed by `garden/<path:key>` (`sefaria/urls_library.py:78-80`).
2. Library has no Django routes for `/sheets/<id>`, `/collections*`, `/profile*`, `/my/profile`; production relies on nginx 307s (`nginx.template.conf.tpl:172-181`). In local dev without nginx these 404 on the library host; `/my/notes` on library redirects to an unrouted `/my/profile`.
3. Three cross-module redirect views (`collections_redirect`, `profile_redirect_to_voices`, `sheets_redirect_to_voices`) and `discussions` are dead code.
4. Client writes `vside<N>` for later panels but the server only reads `vside`; client writes `&sbsq{i}=` literally (`ReaderApp.jsx:858`); aliyot at i==1 appended to the wrong variable (`:817`); sheets in non-first panels serialize as `p<N>=sheet&s<N>=…`, which the server drops.
5. `shouldHistoryUpdate` has a broken `versionFilter` comparison (`ReaderApp.jsx:447`).
6. Version-normalization redirect inserts `/` before `?` and uses the raw tref (`reader/views.py:435`); title-only legacy `ven=` values are accepted and rewritten.
7. Only extra panels (`p2…`) apply corpus version preferences server-side; panel 1 does not (`reader/views.py:878`).
8. Extra-panel version validation uses the legacy `language: en/he` field, so versions in other languages can cause the panel to be skipped (`:893-897`).
9. hreflang and canonical URLs are hard-coded to `www.sefaria.org(.il)` even for voices pages.
10. `/texts/recent` 301s to `/texts/history`, which is not a real page (renders library home).
11. `/contest` is a static page while `/contes`… regex `^contest?` redirect is effectively for typos; `^jfn?$` matches `/jf` and `/jfn`; `^settings/account?$`, `^activity/leaderboard?$`, `^api/texts/random?$` allow a missing last letter; `^my/profile` and `^[nN]echama/?` have no end anchor.
12. `user_activity` "next page" links to global `/activity/N` (`reader/views.py:4023-4025`).
13. `visualize/links-through-rashi?level=1` selects the Tanach file (string vs int compare).
14. `parashat-hashavua` reads `?diaspora` and ignores it; uses the default calendar.
15. `/edit/textinfo/<title>` is routed to `edit_text`, not `edit_text_info` (path ordering), even though `edit_text_info` redirects there.
16. A `/Sheet.<id>` text URL on library renders a sheet in library (`reader/views.py:807-812`).
17. `bootstrapUrl` passes `{replaceHistory}` as panel options, not the replace flag (`ReaderApp.jsx:1299`).
18. `openURL` passes the `tab` param for topics but `openTopic(slug)` ignores it (`ReaderApp.jsx:1432,2081`).
19. Legacy S1 surfaces still live: `edit_text.html` editor (`/add`, `/edit`, `/translate`), `sheets.html` embed (`?embed=1`), `sheets_visual.html`, `edit_profile.html`, `activity.html`, `explore.html`, `compare.html`, gardens, visualizations — all outside ReaderApp but under the ReaderApp header.
20. `register` appends `welcome=to-sefaria` to the post-signup URL (and `enable-library-assistant` forwards it), but no first-party JS reads `welcome` (presumably for analytics/GTM).
21. `compare` view has a stray `print(comp_ref)` (`sefaria/views.py:2192`).
22. Bots including `sefaria-node`, `curl`, `python-request` bypass language-domain redirects; everyone else on a mismatched language domain is 302-bounced with `set-language-cookie`.
