# Inventory 08 — Everything outside Reader / Library / Search / Sheets

Scope: auth, static pages, promotions/banners/CMS (Strapi), admin & editorial tools, cross-cutting client infrastructure, Django-template (non-React) pages, embeddable widgets (linker), visualizations, Django apps (api/, guides/, chatbot/, remote_config/, promotions/, django_topics/, emailusernames/).

Repo root: `/Users/akiva/Sefaria/dev/Sefaria-Project`. All citations are `path:line` relative to repo root.

---

## 1. `static/js/Misc.jsx` — the grab-bag (3551 lines, every export)

Exports at `static/js/Misc.jsx:3477-3551`. Listed in file order with behavior.

### 1.1 Hooks / helpers
| Name | Line | What it does |
|---|---|---|
| `useOnceFullyVisible(onVisible, key)` | 36 | IntersectionObserver (threshold 1) fires `onVisible` once per **sessionStorage key**; used for impression analytics. Exported. |
| `transformValues(obj, cb)` | 2107 | Maps over object values, preserving nulls. Exported. |
| `replaceNewLinesWithLinebreaks(content, {mode})` | 2116 | Markdown newline normalizer; `mode:"strapi"` converts `\n` to `&nbsp; \n` plus trailing spacer (Strapi CMS markdown quirk); standard mode turns single newlines into markdown hard breaks. Named export. |
| `handleAnalyticsOnMarkdown(e, gtag_fxn, rank, product, cta, label, link_type, analytics_event)` | 3362 | Delegated click handler: walks up from event target to nearest `<a>` inside rendered markdown, then fires the supplied gtag function. |
| `TopicToCategorySlug(topic, category)` (not exported) | 945 | Helper for admin topic editor: figures out parent category slug (handles `displays-under` / `displays-above` links). |
| `useHiddenButtons()` (not exported) | 962 | Admin buttons show on hover for 3s then hide. |

### 1.2 Interface-language text primitives (the i18n rendering layer)
| Name | Line | What it does |
|---|---|---|
| `HebrewText`, `EnglishText` | 74-79 | Marker wrappers used as children of `InterfaceText` to supply per-language JSX. |
| `InterfaceText({text, html, markdown, children, disallowedMarkdownElements=['p']})` | 100 | THE interface-string renderer. Renders a single `<span class="int-en|int-he">` based on `Sefaria.interfaceLang`. Modes: (a) `text={{en,he}}` with fallback to other lang + `enInHe`/`heInEn` fallback classes (119); (b) `html={{en,he}}` dangerouslySetInnerHTML; (c) `markdown={{en,he}}` via ReactMarkdown with links forced `rel=noopener noreferrer`, `p` disallowed by default; (d) single string child → translated via `Sefaria._(key)` (i18n key lookup); (e) `<EnglishText>/<HebrewText>` children filtered by language. |
| `DangerousInterfaceBlock({en,he,classes})` | 758 | div + InterfaceText html. |
| `SimpleInterfaceBlock({en,he,classes})` | 770 | div + InterfaceText text. |
| `SimpleContentBlock` | 782 | plain div wrapper. |
| `SimpleLinkedBlock({en,he,url,classes,aclasses,onClick,openInNewTab})` | 792 | div + anchor w/ `data-target-module`. |
| `LoadingMessage({message, heMessage, className})` | 2588 | "Loading..." / "טוען מידע..." with `aria-live=polite`. |
| `LoadingRing` | 169 | CSS spinner (`lds-ring`). |

### 1.3 Donation
- `DonateLink({children, classes, source, link})` — `Misc.jsx:173`. Three link presets (`default`, `sustainer`, `dayOfLearning`), each with separate EN/HE URLs on `donate.sefaria.org` (`/give/451346`, `/give/468442`, `/give/457760`, `/give/478929`, `/sponsor`, `/sponsorhe`), chosen with `Sefaria._v()` (interface-lang value picker), and appends `?c_src=<source>` for attribution. Opens in new tab.

### 1.4 Lists, tabs, dropdowns, layout
| Name | Line | What it does |
|---|---|---|
| `FilterableList` | 234 | Generic filter+sort+infinite paginated list. Text filter input, sort options (`Alphabetical, Recent, Views, Relevance, Chronological, Newest` → i18n keys at 226), two designs (old: dropdown sort; new: inline sort chips with `data-anl-event="sort_by:click"` analytics). Supports async `getData` or `data` prop, `refreshData` signal, `renderHeader/Footer/EmptyList`, controlled sort (`onSetSort`, `externalSortOption`), `usePaginatedDisplay` infinite scroll on a scrollable element. |
| `TabView` | 400 | ARIA tablist (`role=tab`, roving tabindex, arrow-key nav via `Util.handleTabKeyDown`), controlled or uncontrolled, `onClickArray` per-tab overrides, `clickTabOverride`, `justifyright` tabs. |
| `DropdownOptionList` | 507 | Table-based sort option list with check-mark image, EN/HE labels. |
| `DropdownButton` | 545 | Toggle button with arrow up/down images. |
| `DropdownModal` | 563 | Wrapper that closes on outside mousedown. |
| `Dropdown` | 2469 | Accessible custom select (listbox role, keyboard nav via `Util.handleListboxKeyDown`, focus management, `preselected`). |
| `NBox({content,n,stretch,gap})` | 2395 | n-column flex grid with placeholder padding. |
| `TwoOrThreeBox` | 2416 | 2 or 3 col NBox by width threshold. |
| `ResponsiveNBox` | 2437 | 1/2/3 cols by measured container width; listens to resize. |
| `ToggleSet` / `ToggleOption` (internal) | 835 / 878 | Radio-group segmented toggles (used by display-settings). Keyboard: arrows move, Enter clicks, Tab traps inside `div[role=dialog]`, Esc clicks `.mask`. Tracks `Sefaria.track.event("Reader","Display Option Click",...)`. |
| `Link` | 591 | Anchor that preventDefaults and calls onClick; sets `data-target-module`. |
| `BlockLink` | 809 | Image+bilingual title link block. |
| `TextBlockLink` | 631 | "Monopoly card" ref/sheet link with category color border; `sideColor` variant for saved/history lists showing SaveButton or natural-time timestamp; builds URL incl. version params; sheets go to `/sheets/<id>` in Voices module. |
| `ColorBarBox({tref})` | 753 | Box bordered with ref's category color. |
| `CategoryColorLine({category})` | 1633 | Category-colored line; fires `header_viewed` impression once/session (`sa_event` + `gtag`). |
| `CategoryAttribution({categories, linked, asEdition})` | 2610 | Category attribution blurb (e.g., copyright/edition credits) from `Sefaria.categoryAttribution`. |

### 1.5 Header / chrome buttons
| Name | Line | What it does |
|---|---|---|
| `SearchButton` | 1207 | Magnifier icon span. |
| `MenuButton({compare})` | 1218 | Hamburger or chevron (RTL-aware) for compare mode. |
| `CloseButton({icon, url, altText})` | 1233 | × / circled-X / chevron close with aria-label. |
| `DisplaySettingsButton` | 1266 | "Aa" or language-icon (if `Sefaria._siteSettings.TORAH_SPECIFIC`) tooltip button to open reader display options. |
| `InterfaceLanguageMenu({translationLanguagePreference, setTranslationLanguagePreference})` | 1300 | Globe icon dropdown in header: `DropdownLanguageToggle` (English/Hebrew interface switch) + "Preferred translation" display with Reset button (clears translation language preference). |
| `LanguageToggleButton` | 723 | aleph/aye icon link toggling content language. |
| `GuideButton({onShowGuide})` | 1403 | Lightbulb button opening a Guide overlay (see guides app). |
| `Arrow` (`ArrowButton`) | 1432 | next/previous arrow button (RTL via CSS). |
| `ToolTipped` | 1458 | role=button div with keyboard handling; wraps click with `TrackG4.gtagClick(..., AdContext)`. |
| `SmallBlueButton` | 1619 | small button. |
| `AppStoreButton({platform, href})` | 3349 | iOS / Android store button (mobile app promo). |

### 1.6 User actions (save / follow / notes / feedback)
| Name | Line | What it does |
|---|---|---|
| `SaveButton({historyObject, placeholder, tooltip, toggleSignUpModal})` | 1352 | Bookmark toggle; `Sefaria.toggleSavedItem` → on `'notSignedIn'` opens SignUpModal(Save). Tracks `Saved/saving`. Debounces concurrent posts. |
| `SaveButtonWithText` | 1347 | Dropdown menu item variant (Save/Remove). |
| `FollowButton({uid, following, large, disableUnfollow, followBack, icon, classes, toggleSignUpModal})` | 1550 | POST `/api/follow/<uid>` / `/api/unfollow/<uid>`; updates `Sefaria.following`; hover shows "Unfollow"; "Follow Back" variant; anonymous → SignUpModal(Follow). Tracks `Following` events. |
| `ProfileListing` | 1649 | Author byline: ProfilePic + name link + FollowButton + organization. |
| `Note` | 1918 | Public/private note display (linkified, edit pencil if mine). |
| `FeedbackBox({srefs, url, currVersions})` | 2662 | Feedback form in sidebar: type dropdown (`content_issue, translation_request, bug_report, help_request, feature_request, good_vibes, other`), textarea, email field for anonymous; email regex validation; POST `/api/send_feedback` `{json:{refs,type,url,currVersions,email,msg,uid}}`; "Feedback sent!" state. |
| `ReaderMessage({messageName, message, buttonLikeText, buttonDislikeText})` | 2770 | Like/Dislike UI-feedback prompt; stores `<messageName>Accepted` cookie; tracks via `Sefaria.track.uiFeedback`. |

### 1.7 Auth prompts
| Name | Line | What it does |
|---|---|---|
| `LoginPrompt` | 1964 | "Please log in to use this feature" with Log In (`/login?next=`) and Sign Up (`/register?next=`, `data-signup-source="login_prompt"`). |
| `SignUpModal({show, onClose, modalContentKind})` | 2004 | Modal with heading/subheading + bullet list from `generateContentForModal(kind)` (`signupModalContent.js`), Sign Up button → `/register?next=…` tagged `data-signup-source="signup_modal_<kind>"` (map at 1988: add_connection, view_history, add_to_sheet, add_translation, follow, notes, save, default), and "Already have an account? Sign in". |

### 1.8 CMS-driven promos (see §5 for Strapi)
| Name | Line | What it does |
|---|---|---|
| `InterruptingMessage({onClose})` | 2128 | Strapi **modal**: waits `strapi.modal.showDelay` seconds, re-checks eligibility (`isEligible`, `isPathExcluded`), renders header (EN/HE), markdown body, CTA button (EN/HE URLs). Close/CTA click → `localStorage["modal_<internalModalName>"]="true"` dismissal + `gtag/sa_event modal_interacted_with_<close_clicked|modal_button_clicked>`. Impression via `OnInView` → `modal_viewed`. |
| `Banner({onClose})` | 2272 | Strapi **top banner**: same delay/eligibility pattern, adds `body.hasBannerMessage` when `#s2.headerOnly`, configurable `bannerBackgroundColor`, markdown text, EN/HE CTA, close ×. Dismissal key `banner_<internalBannerName>`; events `banner_viewed`, `banner_interacted_with_*`. |
| `OnInView({children, onVisible})` | 2063 | Fires callback on each rising edge to 100% visibility (impression tracking). |
| `GlobalWarningMessage` | 615 | Renders `Sefaria.globalWarningMessage` HTML (server-set site-wide warning) with close ×. |
| `CookiesNotification` | 2816 | Cookie consent bar: shown if no `cookiesNotificationAccepted` cookie; OK sets cookie for 20 years on `Sefaria.util.getCookieDomain()` (cross-subdomain); EN/HE text, link to `/privacy-policy` (HE uses `fullURL` w/ library module). No granular consent — single "OK". |

### 1.9 AI disclosure
- `AiInfoTooltip({displayText, variant: solid|outline, size: 18|24})` — `Misc.jsx:1487`. AI-star icon; hover shows message + "Learn more" (`/ai`) + "Feedback" link to `https://sefaria.formstack.com/forms/ai_feedback_form`. `data-anl-event` analytics on hover/click.

### 1.10 Sheet/collection listing bits (shared, used beyond sheets)
| Name | Line | What it does |
|---|---|---|
| `SheetListing` | 1698 | Sheet row: owner pic+name, views/lock, title, summary, topics or info (unlisted, author, views, date, collections); action icons: add-to-collection (CollectionsModal), delete (confirm + `Sefaria.sheets.deleteSheetById`), save, pin/unpin. Many tracking events. |
| `CollectionListing` | 1875 | Collection row: name, unlisted flag, sheet count, editor count. |
| `CollectionStatement` | 2910 | Collection image + name inside sheet header. |
| `SheetTitle`, `SheetMetaDataBoxSegment`, `SheetAuthorStatement`, `SheetMetaDataBox` | 2860-3080 | contentEditable sheet title/summary w/ RTL detection; meta box with GuideButton, display-settings dropdown, sheet options; mobile author info. |
| `SheetTopicLink`, `SheetAccessIcon` | 2625, 2649 | Topic tag link; lock icon (references undefined `msg` — latent bug at 2653). |

### 1.11 Admin/editorial building blocks (moderator-only)
| Name | Line | What it does |
|---|---|---|
| `CategoryHeader({type, data, toggleButtonIDs, actionButtons})` | 997 | If `Sefaria.is_moderator`, wraps a heading with hover-revealed admin buttons: "Add sub-category", "Add a source", "Add section" (navigates `/add/<data>`), "Reorder sources", "Edit", plus custom action buttons (e.g. "Publish"). Opens corresponding editor inline. `type` ∈ `sources, cats, books, topics`. |
| `ReorderEditorWrapper` (internal) | 1066 | Reorder topics (`/api/topic/reorder`), TOC categories (`/api/category?reorder=1`), or top-30 sources on a topic (`/api/source/reorder?topic=&lang=`). |
| `EditorForExistingTopic` (internal) | 1117 | Pre-fills TopicEditor: titles/alt titles, descriptions, category descriptions, birth/death place & year, era, image, secondary image. |
| `EditorForExistingCategory` (internal) | 1160 | Pre-fills CategoryEditor (en/he name, desc, short desc, isPrimary). |
| `CategoryEditorWrapper` / `CategoryAdderWrapper` (internal) | 1182 / 1196 | Routes to `EditTextInfo` (books), `SourceEditor`, `CategoryEditor`, `TopicEditor`. |
| `PencilSourceEditor({topic, text, classes})` | 1051 | Pencil icon opening SourceEditor for a topic's ref link. |
| `AdminToolHeader({title, validate, close})` | 2926 | Editor header with Cancel/Save. |
| `CategoryChooser({categories, update})` | 2948 | Cascading `<select>` menus over `Sefaria.toc` to pick a category path. |
| `TitleVariants({titles, update, options})` | 3008 | ReactTags-based alt-title editor with duplicate validation. |
| `Autocompleter(...)` | 3082 | Input + suggestion `<select>` + optional "add" button; ref text preview (`Sefaria.getText` with highlight scroll), auto-width input, flips above when no room. Used by AddInterfaceInput (sheets editor) & TopicSearch. |

### 1.12 Media / misc
| Name | Line | What it does |
|---|---|---|
| `ImageWithCaption`, `ImageWithAltText` | 3337, 3347 | Image + bilingual caption; default alt "illustrative image". |
| `LangSelectInterface({callback, defaultVal, closeInterface})` + `LangRadioButton` | 3421, 3398 | Popover radio: Source / Translation / Source with Translation; analytics `lang_toggle_select:click`; auto-closes on blur. |


---

## 2. Authentication (login / register / SSO / One Tap / forgot & reset password)

### 2.1 Routing & mounting
- Server routes (`sefaria/urls_shared.py:24-36`): `_allauth/` (allauth headless), `accounts/` (allauth, incl. `/accounts/apple/login/` + callback), `sso.urls`, `/login` (`CustomLoginView`), `/register` (`register`), `/enable-library-assistant`, `/logout` (`CustomLogoutView`, GET allowed, `?next=` validated against host — `sefaria/views.py:114-136`), `/password/reset/confirm/<uidb64>/<token>/` (`CustomPasswordResetConfirmView`), `api/login/` + `api/login/refresh/` (JWT for mobile app — `sso.views.MobileTokenObtainPairView`), `api/register/` (JWT register for mobile, `sefaria/views.py:227`), `api/account/delete` (`reader_views.delete_user_account_api`).
- SSO endpoints (`sso/urls.py`): `api/auth/google/redirect` (GIS redirect-mode POST target), `api/auth/google/mobile` (native app → JWT), `api/auth/apple/callback` (popup mode), `api/auth/apple/mobile`, `api/auth/login` (JSON email login), `api/auth/password/reset` (JSON forgot-password). Google popup/One Tap credentials POST to allauth headless `/_allauth/browser/v1/auth/provider/token` (`static/js/auth/utils.js:3`).
- All three server views render `base.html` with `headerMode: False` (full ReaderApp); ReaderApp decides `showAuth` from the path (`static/js/auth/utils.js:46-58` `isAuthPath`, `resolveInitialAuthState`) and renders `<AuthPage>` in `<main>` instead of panels (`static/js/ReaderApp.jsx:2596-2603`). Clicking any in-app `/login` or `/register` link is intercepted by `ReaderApp.openURL` → `handleAuthNavigate(withNext(path, next), signupSource)` (`ReaderApp.jsx:1375-1379`, `:144-147`), pushes history state `{showAuth, authPath, authSource}` (`ReaderApp.jsx:490-492`). The `data-signup-source` attribute of the clicked element becomes `authSource` for analytics.
- Login/register titles & meta: `sefaria/views.py:103-111` ("Log in to Sefaria"), `:285-290` ("Create an Account").
- Already-authenticated GET of /login or /register → redirect `/` (`sefaria/views.py:99-101`, `:258-259`).

### 2.2 `AuthPage` state machine — `static/js/auth/AuthPage.jsx`
- One card, views swapped in place: `choose | email | forgot | forgot-sent | reset | reset-expired | reset-success`; flow derived from path: `login | register | reset` (`AuthPage.jsx:18-31`, `utils.js:61-64`). External header clicks reset view to `choose` when flow changes (`:44-48`). `next` parsed + sanitized by `safeNext` (same-origin only; `utils.js:33-41`).
- `AuthCard` (`AuthCard.jsx`): white card on navy background, serif heading auto-focused on each view mount (a11y), optional back arrow, sub-line; full-bleed ≤842px.
- **ChooseView** (`ChooseView.jsx`): heading "Log in"/"Create an account", cross-link ("Don't have an account? Sign up" with `data-signup-source="login_crosslink"` / "Already have an account? Log in"), Google button (if `Sefaria.googleClientId`), Apple button (if `Sefaria.appleClientId`), "or" divider (`Divider.jsx`), "Continue with email", `LegalText` (Terms `/terms` + Privacy `/privacy-policy` links, `LegalText.jsx`), error banner, "Loading…" sub-line while SSO in flight (`LoadingSub.jsx`).
- **LoginView** (`LoginView.jsx`): email + password (password field has inline "Forgot password?" trailing link), POST JSON `/api/auth/login` → on ok `window.location = safeNext(next)`; error fallback `auth.invalid_credentials`.
- **RegisterView** (`RegisterView.jsx`): email, password (`new-password`), first name, last name; blur-validate/required rules (`utils.js:78-105`: errors set on blur, only cleared while typing); **reCAPTCHA v2** widget rendered if `Sefaria.recaptchaSiteKey`, responsively scaled with RTL-aware anchoring (`RegisterView.jsx:30-99`); POST form-encoded to `/register` with `noredirect=1`, `next`, `g-recaptcha-response` (`:101-114`); server returns `{redirect}` or field errors keyed by stable codes (`sefaria/views.py:241-254`); email-exists codes mapped to banner (`emailExistsErrors.js`: `sso_google_exists`, `sso_apple_exists` → "registered via Google/Apple — Continue with …"; `email_exists` → "account exists, Log in" link); captcha errors → "verify you're not a robot"; captcha reset after failure. Server-side on success: create user + Mongo `UserProfile` (slug, join invited collections, interface language), import Gravatar to GCS, session login, append `?welcome=to-sefaria` to next (`sefaria/views.py:199-224`, `:262-276`). `?educator=1` on GET pre-checks `subscribe_educator` in the (legacy) form (`:279-283`).
- **ForgotView** (`ForgotView.jsx`): email → POST `/api/auth/password/reset`; success → MessageView "Reset link sent / Check your email"; SSO-only accounts get the "Continue with Google/Apple" banner.
- **ResetView** (`ResetView.jsx`): new password + confirm, mismatch validation, POST JSON to current reset URL; `invalid_reset_link` → ResetExpiredView; per-field server errors.
- **ResetExpiredView** (`ResetExpiredView.jsx`): one-click "Request new link" (POST `{action:'resend'}` to same URL; server resolves user from uid even with expired token, `sefaria/views.py:147-170`); `no_account_for_link` → falls back to Forgot view.
- **reset-success**: MessageView + "Log in" button.
- **MessageView** (`MessageView.jsx`): generic terminal message card.
- **ErrorBanner** (`ErrorBanner.jsx`): `role=alert`; generic message + optional link, or `sso_only_account` variant listing providers with inline "Continue with Google/Apple" (Google variant is an overlay target).
- **ProviderButton** (`ProviderButton.jsx`): Google/Apple styled buttons; Google variant is a positioning shell for the real GIS iframe button.
- Inputs: `EmailInput.jsx` (type=email, LTR, placeholder `you@example.com`), `PasswordInput.jsx` (LTR, `••••••••`). Uses common `Input`, `Button`, `Captcha` components (`static/js/common/`).
- CSRF: `getCsrfToken()` reads `<meta name="csrf-token">` only (never the cookie; avoids dual-cookie 403 on cauldrons) — `static/js/sefaria/csrf.js`.

### 2.3 SSO mechanics — `static/js/auth/useSsoSignIn.jsx` (`useProviderTriggers`)
- Google Identity Services: real GIS button is **portaled** invisibly over whichever "Continue with Google" element is registered as target (ChooseView button or error-banner link) because it's a cross-origin iframe (`:8-29`, `:301-306`). Config: `ux_mode` = `redirect` if `Sefaria.ssoUseRedirect()` (mobile) else `popup`, `use_fedcm_for_button: true`, locale `iw`/`en` (`:147-198`).
- Redirect mode: `login_uri=/api/auth/google/redirect`; `next` passed via `sefaria_sso_next` cookie (SameSite=None; Secure; max-age 300) read by `sso/adapters.py` `_next_from_cookie` (`:166-176`).
- Popup mode: credential → POST allauth provider-token endpoint; popup-abandon detection via window focus + 1200ms (`:114-145`).
- Apple: popup via `AppleID.auth.init/signIn` (scope `name email`, `usePopup:true`) listening to `AppleIDSignInOnSuccess/Failure` DOM events → POST `/api/auth/apple/callback` with id_token + name + email (`:207-272`); redirect mode → `/accounts/apple/login/?next=` (`:280-284`).
- Errors routed to whichever view is mounted via `setActiveErrorHandler`.
- Backend policy (`sso/adapters.py:104-142`): **SSO always wins on email collision** — existing password account gets its password wiped and is connected to the social account (becomes SSO-only). New SSO users get Mongo profile + Gravatar + Salesforce CRM registration (`:144+`).
- Mobile JWT: `SSOAwareTokenObtainPairSerializer` returns sso-only error info (`sso/views.py:65-98`).

### 2.4 Google One Tap — `static/js/auth/GoogleOneTap.jsx`
- Mounted globally at ReaderApp root (`ReaderApp.jsx:2586`). Not on /login or /register; once per session (`sessionStorage sefaria_interruptive_ui_shown`); 1200ms delay; suppressed (and marked shown) if any interruptive UI is present (cookie bar, `.siteWideBanner`, `.modal`, `[role=dialog][aria-modal]`) (`:6-14`, `:57-84`). Waits for `google-identity-loaded` event if GIS not loaded. On credential: POST allauth provider-token → `window.location.reload()`.

### 2.5 Sign-up funnel analytics
- `static/js/auth/signupAnalytics.js`: GA4 events `sign_up_flow_started / sign_up_method_chosen / sign_up_process_started / sign_up_process_ended / sign_up_flow_ended` with `project: site_registration`, `transport_type: beacon`; methods `email | google | apple | google_one_tap`. Persists pending SSO attempt in sessionStorage across full-page provider redirects and resumes on next load using `document.referrer` (`resumePendingSignUpAttempt`, called from ReaderApp).
- `static/js/auth/useSignUpTracking.js`: flow start on arrival at /register, end on leave/popstate/beforeunload/bfcache `pageshow`/unmount; attempt bookkeeping; `source` = clicked CTA's `data-signup-source` (`nav_bar`, `login_prompt`, `signup_modal_*`, `login_crosslink`, …).

### 2.6 Other auth-adjacent UI
- `LoginPrompt` and `SignUpModal` (Misc §1.7). SignUpModal content per kind in `static/js/sefaria/signupModalContent.js` (kinds: AddConnection, ViewHistory, AddToSheet, AddTranslation, Follow, Notes, Save, Default — each with h2/h3 EN/HE + 3-4 icon bullets).
- `enable_library_assistant` (`reader/views.py:4204-4238`): post-login landing that turns on the Library Assistant (chatbot) setting then redirects to `next` (preserves `welcome`).
- Logged-out page: `templates/registration/logged_out.html`. Cross-flow nav partial `templates/registration/_cross_flow_nav.html` (legacy Django-form version). Password reset email templates: `templates/registration/password_reset_email.{html,txt}`, `password_reset_subject.txt`.
- `?welcome=to-sefaria` appended post-registration (`sefaria/views.py:271`) — no current client-side consumer found in `static/js` (likely GA/URL-based only).
- Auth tests: `static/js/auth/tests/*.test.js` (AuthCard, ForgotView, GoogleOneTap, emailExistsErrors, signupAnalytics, useSignUpTracking, useSsoSignIn, utils).

---

## 3. Static pages

### 3.1 How they are served
- `sites/sefaria/urls.py:10-56` lists `static_pages` served by `reader_views.serve_static` (`reader/views.py:5052-5058`): renders `templates/static/<page>.html` with `headerMode: True` (React only renders the header; `renderStatic` true). `static_pages_by_lang` (`about`, `ways-to-give`) render `templates/static/<lang>/<page>.html` (`en/`, `he/`).
- On the Voices module, About-sidebar pages redirect to the Library module (`reader/views.py:5054-5055`). ReaderApp `openURL` opens About-sidebar paths in a new tab on the library domain (`ReaderApp.jsx:1360-1363`).
- Some static templates mount a React component by setting `DJANGO_VARS.containerId` + `DJANGO_VARS.reactComponentName` (e.g. `templates/static/team.html:10-15`), resolved from ReaderApp's exports (`ReaderApp.jsx:2688-2700`).
- About sidebar: `templates/_sidebar.html` driven by `SITE_SETTINGS.ABOUT_SIDEBAR_PAGES` (`sites/sefaria/site_settings.py:28-41`): About, Team, Jobs, Products, AI, Supporters, Testimonials, Metrics, Updates ("New Additions"), Annual Report, Terms, Privacy Policy. Hidden on mobile (title shown instead).

### 3.2 Full static page list (`sites/sefaria/urls.py:10-56`, templates in `templates/static/`)
| Path | Kind |
|---|---|
| `/strategy`, `/supporters`, `/visualizations`, `/terms`, `/privacy-policy`, `/coming-soon`, `/shraga-silverstein`, `/henry-and-julia-koschitzky-apps`, `/adin-even-israel-steinsaltz`, `/william-davidson-talmud`, `/nash-bravmann-collection`, `/linker` (linker marketing/instructions page), `/ios`, `/mobile`, `/app` (app download pages), `/sefaria-edition`, `/sefaria-community-translation`, `/contributed-to-sefaria`, `/random-walk-through-torah`, `/the-sefaria-story`, `/aramaic-translation-contest`, `/testimonials`, `/torah-tab`, `/dicta-thanks`, `/daf-yomi`, `/design-system`, `/cloudflare_site_is_down_en`, `/cloudflare_site_is_down_he`, `/link-to-annual-report`, `/mobile-about-menu`, `/pioneers`, `/ai` (AI on Sefaria), `/fleishman-hirsch-on-torah-in-english` | Plain Django template HTML (bilingual `int-en/int-he` spans) |
| `/about`, `/ways-to-give` | Per-language template (`static/en|he/`). `ways-to-give` EN mounts React `DonatePage` (`templates/static/en/ways-to-give.html:17`) |
| `/jobs` | React `JobsPage` (Strapi `jobPostings` active by start/end date, grouped by department; "no openings" notice) — `StaticPages.jsx:2654` |
| `/team` | React `TeamMembersPage` (Strapi `teamMembers`, EN/HE localizations, board vs staff split, chairman → co-founders → by last name, locale-aware sort) — `StaticPages.jsx:2419` |
| `/products` | React `ProductsPage` (Strapi `products` sorted by rank; moderators also see draft-only products; per-product title/type label/CTA links with icons/markdown description/image; "Powered by Sefaria" DevBox inserted after 2nd product; `products_*` gtag analytics) — `StaticPages.jsx:2880` |
| `/educators` | React `EducatorsPage` (`StaticPages.jsx:521`; newsletter signup w/ educator context) |
| `/word-by-word` | React `WordByWordPage` (writing-circle fellowship page) — `:1455` |
| `/newsletter` | React `NewsletterPage` (`:3068`, NewsletterSignUpForm with educator option) |
| `/ramban-sponsorships` | React `RambanLandingPage` (parasha sponsorship list, `ParashaSponsorship` "Available for Sponsorship" mailto) — `:256` |
| `/powered-by-sefaria-contest-2020`, `-2021` | React `PBSC2020LandingPage`, `PBSC2021LandingPage` |
| `/contest` | React `ContestLandingPage` (also redirect `/contest*` → 2020 page in site urls) |
| `/updates` | React `UpdatesPanel` ("New Additions" feed; see `static/js/UpdatesPanel.jsx`) |
| `/getstarted` (Voices domain, `sefaria/urls_sheets.py:22`) | React `SheetsLandingPage` (`templates/static/sheets.html`) |
| `/metrics` | `reader_views.metrics` → `templates/metrics.html` (d3 graphs of `db.metrics`) — `reader/views.py:4658` |
| `/digitized-by-sefaria` | List of versions with `digitizedBySefaria` — `reader/views.py:4670` |
| `/annualreport[/<year>]` | Standalone page embedding PDF/issuu per year 2020-2025 — `reader/views.py:5061-5079`; `/annualreport2021` redirect |
| `/current-990-form` | Redirect to newest `Sefaria_<year>_990_Public.pdf` — `reader/views.py:5082-5099` |
| `/dedication/<slug>` | `dedications` app view (`templates/static/dedication/dedication.html`) |
| `/llms.txt` | `static/llms.txt` (LLM-friendly API docs) — `reader/views.py:5471` |
| Unrouted templates in `templates/static/`: `all_home.html`, `home.html`, `index.html`, `generic.html`, `connect.html` (now `/connect`→`/newsletter` redirect), `maintenance.html` (DOWN_FOR_MAINTENANCE page, `sefaria/views.py:293`), `categorize-sheets.html` (admin), `contest/*` (legacy contest leaderboards). |

- `StaticPages.jsx` also exports `PoweredByPage` (`:1606`; `/powered-by` now redirects externally to developers.sefaria.org) and building blocks: `StaticPage`, `Header`, `H1Block`, `H2Block`, `EnBlock/HeBlock`, `GreyBox`, `Feature`, `FeatureBox`, `ImageWithText`, `About`, `ButtonRow`, `SimpleButton`, `UserQuote`, `Sheet`, `CallToActionFooter*` (incl. newsletter variant), `Accordian` (`<details>` FAQ — used heavily on DonatePage FAQ), `SubscribeButton` (subscribes logged-in user `Sefaria._email` to lists via POST `/api/subscribe/<email>`), `HeaderForEducatorsPage`, `HeaderForDonatePage`, `ParashaSponsorship`, `Spacer`, `StaticHR`, `ConditionalLink` (`StaticPages.jsx:1943-2310`).
- `DonatePage` (`:1107`): "How to make a difference" feature boxes (one-time gift, sustainer, sponsor a day of learning, giving circle), "Ways to Give" (online, mail, donor-advised fund, additional), ~18-item FAQ accordion (tribute gifts, tax deductibility, receipts, matching gifts, cancel/change monthly donation…).

### 3.3 Redirects / short links (`sites/sefaria/urls.py:79-108`)
`/donate` and `/donate/mobile` (→ donate.sefaria.org EN/HE, `c_src=App` for mobile), `/powered-by`, `/wiki`, `/developers`, `/request-a-text` (Google Form), `/request-a-training`, `/contribute` (GitHub wiki), `/faq` & `/help` (Help Center EN/HE by interface lang), `/gala`, `/give/<channel_source>` & `/give` (donate checkout with `c_src`), `/giving`, `/jfn`, `/nechama` (collection), `/contest`, `/dayoflearningcalendar`, `/rabbis`→`/educators`, `/connect`→`/newsletter`, PDF links `/textmap`, `/workshop`, `/ideasforteaching`, `/strategicplan`. Also `/parashat-hashavua`, `/todays-daf-yomi` (calendar redirects, `reader/views.py:4680-4691`), `/community`→voices, `/new-home`, `/account`, `/my/notes`, `/sheets/tags`, `/groups`, `/contributors/<uid>`, `/person/*`, `/people/*`, `/settings/profile` redirects (`sefaria/urls_shared.py`, `urls_library.py`).
- `SITE_SETTINGS.HELP_CENTER_REDIRECTS` (`sites/sefaria/site_settings.py:50+`): maps ~50 legacy help **sheet IDs** (EN & HE) to Zendesk Help Center URLs (sheet views redirect to help.sefaria.org).
- Other SITE_SETTINGS consumed by client: `TORAH_SPECIFIC`, `SITE_NAME`, `LIBRARY_NAME`, `SUPPORTED_TRANSLATION_LANGUAGES` (en/es/fr/de), buckets, `HELP_CENTER_URLS` (incl. getting-started video, translation-preference articles), `WHAT_ARE_VOICES_PATHS`, `MODULE_SWITCHER_LEARN_MORE_PATH`. Alternative site packages: `sites/generic`, `sites/s4d` (white-label site configs with own categories/urls).

---

## 4. Promotions, banners, CMS (Strapi) and in-product marketing

### 4.1 Data pipeline — `static/js/context.js`
- `StrapiDataProvider` wraps the whole app (`ReaderApp.jsx:2580`). If `STRAPI_INSTANCE` global is set, builds one GraphQL query with per-locale aliases (`en_banners`, `he_banners`, `en_modals`, … `he_sidebarAds`) for documents whose whole date window falls within ±14 days (`context.js:116-186`), POSTs it as text/plain to Django cache proxy `POST /api/strapi/graphql-cache?start_date=&end_date=` (`context.js:187-198`; server `sefaria/views.py:1513-1630` caches per date range). Strapi webhook `POST /api/strapi/cache-invalidate` clears `*strapi_graphql*` (`sefaria/views.py:1633-1669`).
- Banner fields: internal name, start/end date, markdown text, button text/URL, `showDelay`, background color, `shouldDeployOnMobile`, audience flags (`showTo`, new/returning visitor, sustainer/non-sustainer), `countriesToTarget {countryMode, countries}` (`context.js:31-56`). Modal fields similar + header/text (`:58-86`). Sidebar ad fields: title, body, button text/URL/icon, button above/below, blue background, campaign id, comma keywords (with `!` exclusions), showTo, start/end, debug flag, newsletter-form flag + mailing lists (`:88-114`).
- Per-locale rows merged by `documentId` (`static/js/sefaria/strapiLocalization.js` `groupByDocumentIdWithDiagnostics`, `buildInterfaceTextDoc`); bad rows dropped loudly. Stale dismissal keys in localStorage pruned only on healthy payloads (`context.js:241-271`).
- **Selection** (`static/js/sefaria/strapiSelection.js`): eligibility = date active ∧ published in viewer locale ∧ country match ∧ audience match ∧ not dismissed (`:376-442`). Ranking: country-specific > audience-specific > single-locale > shorter window > earlier start > payload order (`:444-535`). Display-only path exclusions: `/donate`, `/mobile`, `/app`, `/ways-to-give` and the page the CTA links to (`:542-563`). Viewer context: interface locale, country candidates, logged-in, `Sefaria.is_sustainer`, new/returning visitor (`:569-583`; `Sefaria.isNewVisitor/isReturningVisitor` via session/localStorage flags at `sefaria.js:2938-2958`).
- **Country targeting** (`static/js/sefaria/strapiTargeting.js`: ALL/INCLUDE/EXCLUDE partition) using a *set* of candidate countries from IP country (`Sefaria.countryCode`), IANA timezone, and `navigator.language` region (`static/js/sefaria/countryCandidates.js`; US territories → US; Crown dependencies add GB; `he` → IL; bare `fr` → CA).
- Consumers: `InterruptingMessage` (modal) and `Banner` in Misc (§1.8), `Promotions` (sidebar ads).

### 4.2 Sidebar ads — `static/js/Promotions.jsx`
- `Promotions` builds `Sefaria._inAppAds` from Strapi `sidebarAds` (`buildInAppAdsFromSidebarAds`, `static/js/sefaria/sidebarAds.js`: one ad per published locale). Matching (`Promotions.jsx:57-77`): showTo all/loggedIn/loggedOut, debug-only ads only if `context.isDebug`, interface language, date window, and keyword targeting against `AdContext.keywordTargets` (current panels' refs, books, categories, topics — built in `ReaderApp.getUserContext`, `ReaderApp.jsx:2342-2378`) with `!exclude` keywords.
- `SidebarAd` (`:128`): title, body, button (optional icon from Strapi) above or below text, blue variant, or embedded `NewsletterSignUpForm` subscribing to the ad's mailing lists. Impression (`promo_viewed`) via OnInView; click → `promo_clicked`.
- Rendered in `NavSidebar` (`NavSidebar.jsx:173`, "Promo" module) and `TopicPage` sidebar (`TopicPage.jsx:598`).
- `GDocAdvertBox` (`Promotions.jsx:99-124`): hard-coded Google Docs add-on promo in "Add to sheet" panel (`AddToSourceSheet.jsx:432`); hides after "Install now" click via `gdoc_installed` cookie.

### 4.3 Site-wide banners — `static/js/SiteWideBanner.jsx`
- Generic `SiteWideBanner` (`:105`): icon, main + secondary text, action buttons, learn-more link, close × (cookie dismissal on cookie domain, 20 yr) **or** "Maybe later" back-off dismissal: localStorage state + session counter (session = 30 min default, configurable), nudge schedule `{1:{sessions:2, days:7}, 2:{sessions:4, days:21}}`, max 3 "maybe later" → hidden forever; migrates legacy cookie (`:5-102`). SSR-safe (renders nothing until mounted). `promo_viewed` once per session; `promo_clicked` with `feature_name`.
- `ChatbotExperimentBanner` (`:258`): "Ask the Library Assistant" promo (AI icon). Logged-in → "Try it" sets `settings.library_assistant=true` via `Sefaria.editProfileAPI` and reloads; logged-out → "Log in to try" (`/login?next=/enable-library-assistant?next=<here>`). Excluded on `/login`, `/register`, `/password/reset/confirm` (`:244-256`). Shown by ReaderApp when library module, not mobile, `show_join_chatbot_banner`, not already in experiment; nudge schedule/session length from server props (`ReaderApp.jsx:2575`, `:2589-2594`).

### 4.4 Text-column banners — `static/js/TextColumnBanner.jsx`
- `TextColumnBannerChooser` (rendered above text in `ReaderPanel.jsx:1482`): (1) translation-language-preference suggestion ("Prefer to see <lang> translations when available?" Yes/No; driven by server-provided `Sefaria.translation_language_preference_suggestion`; No → cookie `translation_language_preference_suggested` + profile setting; Yes → sets preference & shows thank-you); else (2) `OpenTransBanner` ("Want to change the translation?" → opens translations in resources panel; cookie `open_trans_banner_shown`). Generic `TextColumnBanner` with buttons/close.

### 4.5 Impression probe & misc
- `BannerImpressionProbe` (`static/js/BannerImpressionProbe.jsx`): invisible 1px fixed element rendered after 2s + simulated 300-800ms delay; fires `banner_probe_viewed` (Simple Analytics + GA) once per session — a control to calibrate banner impression measurement. Mounted at ReaderApp root (`ReaderApp.jsx:2620`).
- `TopicsLaunchBanner.jsx` (+ `TopicsLaunchBannerGraphics.jsx`, `TopicsLaunchBannerMobileGraphics.jsx`): topic-launch promo banner with SVG art — **not imported anywhere (dead code)**.
- Legacy server-rendered interrupting messages: `templates/messages/*.html` (~130 dated donate/survey/holiday banner & modal templates, 2018-2023) — **no Python references remain** (superseded by Strapi).
- `NewsletterSignUpForm` (`static/js/NewsletterSignUpForm.jsx`): email field → (valid) reveals first/last name (+ optional "I am an educator" checkbox) → `Sefaria.subscribeSefariaNewsletter(first,last,email,educator,lists)`; messages for subscribing/success/error; tracks `Newsletter / Subscribe from <context>`. Used in NavSidebar (StayConnected / Voices / Portal newsletter modules), StaticPages, Promotions, TopicLandingNewsletter.
- Newsletter backend: `api/subscribe/<org>/<email>` (generic, `sefaria/views.py:299`), `api/subscribe/<email>` (Sefaria lists, `:327`), `api/newsletter_mailing_lists` (`:347`), Steinsaltz subscription helper (`:355`).
- NavSidebar promo/donation modules (cross-cutting; see `static/js/NavSidebar.jsx:40-80` module registry): `Promo`, `SupportSefaria` (DonateLink), `SponsorADay` (DonateLink dayOfLearning), `GetTheApp` (AppStoreButtons iOS/Android), `StayConnected` (newsletter), `VoicesNewsletterSignUp`, `PortalMobile`/`PortalNewsletter`, `StudyCompanion`, `JoinTheCommunity`, etc. Steinsaltz app buttons at `NavSidebar.jsx:1077-1078`.

### 4.6 Donation flows (client)
- All donations are external (donate.sefaria.org / Classy-style checkout). Entry points: Header "Donate" link (`Header.jsx:278`, source `Header`), mobile nav menu (`Header.jsx:471`, source `MobileNavMenu`), NavSidebar SupportSefaria / SponsorADay, `/ways-to-give` DonatePage, `/donate`, `/give`, `/giving`, `/donate/mobile` redirects, Strapi banners/modals CTAs. `DonateLink` preset IDs in `Misc.jsx:176-189`; `c_src` attribution param always appended.
- `Sefaria.is_sustainer` (server-provided) feeds Strapi audience targeting.

---

## 5. Cross-cutting client infrastructure

### 5.1 Page bootstrap / SSR / hydration
- `templates/base.html`: every page. Emits `<meta name="csrf-token">`, meta title/desc (template tags), `noindex` in DEBUG, OpenSearch descriptor (`static/files/opensearch.xml` → `/search-autocomplete-redirecter?q=` and `/api/opensearch-suggestions`), hreflang alternates sefaria.org (en) / sefaria.org.il (he) when TORAH_SPECIFIC, canonical URL, OG + Twitter cards with `social_image_url` (dynamic social images via `/api/img-gen/<tref>`), `apple-itunes-app` smart banner (app-id 1163273965), `apple-mobile-web-app-capable`, viewport (user-scalable=no), per-module favicons/apple-touch-icon/theme-color (library `#18345D`, voices `#518159`), `/site.webmanifest`, JSON-LD breadcrumbs (`ldBreadcrumbs`), chatbot web-component script (`chatbot_script_url`), Google WebFont loader (Crimson Text w/ transliteration glyph subset, Roboto, Heebo, Miriam Libre, Noto Sans Samaritan) + Typekit Adobe Garamond, Google Charts loader, global CSS bundle list (incl. `auth.css`, `s2-print.css` print stylesheet, `modtools.css` / `linker-editor.css` conditional, `static.css` for static pages, `unbounce-banner.css`).
- Third-party scripts in base.html: Google Tag Manager (+noscript), **VWO** A/B testing SmartCode (account 682715, SPA mode, body hidden until loaded), **Hotjar** (if `HOTJAR_ID`), **Simple Analytics** (`sa_event` queue stub; metadata: logged_in, interface_lang, device_type, new/old user, custom session id, persistent `sa_id`, sefaria-email traffic flag), **Unbounce** embed (popups/banners), Google Identity Services / Apple JS / reCAPTCHA (only when logged out), React 16 + ReactDOM UMD from unpkg, jQuery 2.2.4 + jQuery UI 1.12.1 from cdnjs (with local fallbacks), `js/lib/keyboard.js` (virtual Hebrew keyboard), `analyticsEventTracker.js`, `/data.<ts>.js`, gtag.js config (`user_id`, `traffic_type`, `site_lang`, `site_version`), then webpack `main` bundle.
- Globals: `DJANGO_VARS = {props, inReaderApp, containerId?, reactComponentName?}`, `STRAPI_INSTANCE`, `sentryDSN`, `DJANGO_DATA_VARS` (from `/data.js`: `toc`, `topic_toc`, `terms`, `books`, search index names, `virtualBooks` — `templates/js/data.js`; served immutable 1-year cache, cache-busted by `last_cached_short`, `sefaria/views.py:422-431`).
- `body` attrs: `data-active-module`, `data-render-static`, class `interface-english|hebrew`, `embeded` when `EMBED`.
- `static/js/client.jsx`: strips one-hop `no_applink` param; inits **Sentry** (`@sentry/react`, BrowserTracing + Replay; sample rates from `remoteConfig.sentry.*`; release = `appVersion`); `DjangoCSRF.init()`; hydrates (or renders if `#appLoading` placeholder) `ReaderApp` into `#s2` — full app when `inReaderApp`, header-only (`headerMode:true`, `multiPanel` = width>600) on static pages; then optionally renders `DJANGO_VARS.reactComponentName` into `containerId`.
- Maintenance mode: `DOWN_FOR_MAINTENANCE` swaps URLconf to `maintenance_patterns` (admin + health only; everything else `static/maintenance.html` 503) — `sefaria/urls_shared.py:321-335`.
- Health: `/healthz`, `/health-check`, `/healthz-rollout` (`reader/views.py:5494-5570`).
- Error pages: `handler404 = reader.views.custom_page_not_found`, `handler500 = custom_server_error` (`templates/404.html`, `500.html`).
- Cloudflare-down static pages: `cloudflare_site_is_down_en/he`.

### 5.2 The `Sefaria` singleton — non-text parts (`static/js/sefaria/sefaria.js`)
- Construction: `Sefaria` object with `_dataLoaded`, `_inBrowser`, `toc`, `books`, `booksDict`, `last_place`, `VOICES_MODULE`, `LIBRARY_MODULE`, `apiHost: ""` (`:17-27`); exposed as `window.Sefaria` (`:29-31`). `Sefaria.setup()` (`:4096-4114`) runs at import: `loadServerData(DJANGO_DATA_VARS)`, `unpackBaseProps(DJANGO_VARS.props)`, prototypes (`util.setupPrototypes` adds String/Array prototype helpers like `stripHtml`, `pad`, `escapeHtml` — `util.js:899-1173`), `handleUserCookie` (`_user` cookie w/ uid, 2-year), books dict, TOC caches, Hebrew terms, site-name overrides of interface strings, `track.setUserData`, `new Search(...)`.
- **Base props unpacked from server** (`:4006-4058`): `activeModule, _uid, _email, slug, is_moderator, is_editor, is_sustainer, experiments, full_name, profile_pic_url, is_history_enabled, translation_language_preference_suggestion, following, blocking, calendars, notifications, saved, userHistory, last_place, interfaceLang, countryCode, multiPanel, community, followRecommendations, trendingTopics, numLibraryTopics, _siteSettings, domainModules, _debug, _debug_mode, remoteConfig, chatbot_enabled, in_chatbot_experiment, chatbot_user_token, chatbot_api_base_url, chatbot_version, chatbot_use_local_script, googleClientId, appleClientId, recaptchaSiteKey`.
- `unpackDataFromProps` (`:3953-4004`): seeds caches from SSR props (texts, versions, index details, sheets, collections, translations page, topics, topic list, collection listing), `VersionPreferences` from `versionPrefsByCorpus`, `_initialPath`, then `getBackgroundData()`.
- `resetCache()` (`:4117-4180`): SSR (Node) per-request cache wipe; enumerates every cache store.
- **Module/domain helpers** (`:536-595`): `domainModules[lang][module]` URLs; `getCurrentLangHostnames`, `getAllHostnames`, `getCurrentModuleHostnames(module)`, `getModuleURL(module)` (falls back to `apiHost`), `isSefariaURL(url)`; `Sefaria.util.fullURL(path, module, params)` (`util.js:327-344`); `Sefaria.util.getCookieDomain()` common parent domain for cross-subdomain cookies (`util.js:869-897`). Two modules: Library (`www.sefaria.org` / `.org.il`) and Voices (`voices.sefaria.org`), links carry `data-target-module`.
- **User state & sync**:
  - Saved items: `Sefaria.saved.items`, `getSavedItem`, `removeSavedItem`, `toggleSavedItem` → POST `/api/profile/sync?no_return=1` `{user_history:[{ref,versions,time_stamp,action:add_saved|delete_saved,sheet_owner,sheet_title}], client:'web'}`; rejects `'notSignedIn'` for anon (`:2789-2821`).
  - Reading history: `userHistory {loaded, items}`, `loadUserHistory(limit, cb)` → `/api/profile/user_history?secondary=0&annotate=1&limit&skip&saved=0&sheets_only=<voices>` (`:2861-2885`); `saveUserHistory(item)` — logged-in POST `/api/profile/sync?no_return=1&annotate=1`; anonymous → `user_history` cookie trimmed to 3000 URL-encoded bytes (`MAX_ANON_HISTORY_BYTES`, `_trimUserHistoryForCookie`) with `he_ref` resolution (`:2887-2937`); respects `is_history_enabled`; maintains `last_place` / `lastPlaceForText(title)` (`:2985`). `getRefSavedHistory(tref)` → `/api/user_history/saved`.
  - Profile: `editProfileAPI(partial)` → POST `/api/profile` `{json}` (used for settings like `library_assistant`, `translation_language_preference_suggested`) (`:2822`); `profileAPI(slug)` cached; `followAPI(slug, followers|following)`; `uploadProfilePhoto(formData)` → `/api/profile/upload-photo`; `experimentsOptInAPI` (no callers, `:2828-2831`).
  - Messaging: `messageAPI(uid, msg)` → POST `/api/messages`; `chatMessageAPI` / `getChatMessagesAPI` → `/api/chat-messages` (legacy Beit Midrash chat; ReaderApp imports `socket.io-client`).
  - Visitor classification: `isNewVisitor`, `isReturningVisitor`, `markUserAsNewVisitor`, `markUserAsReturningVisitor` (session/localStorage) (`:2938-2963`).
  - Newsletter: `subscribeSefariaNewsletter(first,last,email,educator,lists)` → `/api/subscribe/<email>` `{language, educator, firstName, lastName, lists}`; `subscribeSteinsaltzNewsletter`; `subscribeSefariaAndSteinsaltzNewsletter`; `getTopicLandingNewsletterMailingLists` ("Weekly Topics Newsletter" EN only) (`:955-1032`).
  - `getLogoutUrl()` → `/logout?next=/texts` (library) or `/` (voices) (`:3867`).
- **Interface language / i18n** (`:3651-3790`): `interfaceLang` ('english'|'hebrew'); `_()` resolves keyed IDs (`/^[a-z0-9_]+(\.[a-z0-9_]+)+$/`) from `_i18nInterfaceStrings` (falls back EN → id with console warning), non-ID strings → Hebrew term dictionary (`hebrewTerm`: terms from data.js, version title translations, small built-in map, index heTitle) incl. `"a | b"` splitting; `_v({en,he})` pick by interface; `_bilingual(id, params)` returns `{en,he}` with `{placeholder}` substitution; `_r(ref)` localized ref; `_getShortInterfaceLang()`; `_cacheSiteInterfaceStrings` overrides `common.site_name`/`common.library_name` from site settings; `translateISOLanguageCode`/`ISOMap` (`:889`).
- **API helpers**: `_api` (deprecated), `_ApiPromise(url)` (jQuery getJSON deduped by URL in `_ajaxObjects`), `_cachedApi`, `_cachedApiPromise({url,key,store,processor})`, `apiRequestWithBody(url, params, payload, method)` (fetch + CSRF header, throws on `json.error`), `apiRequestWithBodyAndAlert` (alerts errors), `makeCancelable`, `incrementalPromise`, async-task polling (`/api/async/<task_id>`, near `:3600-3636`).
- **Layout helpers**: `breakpoints {MOBILE, TABLET, DESKTOP}`, `getBreakpoint()` reads CSS vars `--bp-tablet-min/--bp-desktop-min` (`:3871-3901`); `ssoUseRedirect()` (≤767px or mobile UA) (`:4091`); `multiPanel` prop (server UA-based).
- `getPageTitle(baseTitle, pageType)` module-aware bilingual `<title>` (mirrors Python `get_page_title`) (`:3903-3944`); `getDisallowedMarkdownElements()` (Voices strips links) (`:3946`).
- Calendars: `calendars`, `calendarRef(title)`, `updateCalendars(custom, diaspora)` → `/api/calendars` (`:3639-3650`); `getUpcomingDay('parasha'|'holiday')`, `getParashaNextRead`.
- Guides: `getGuide(key)` → `/api/guides/<key>` (`:858`).
- `Sefaria.palette` (category colors, `indexColor`, `refColor`), `Sefaria.hebrew`, `Sefaria.util`, `Sefaria.track` attached at `:4075-4087`.
- `Sefaria._inAppAds`, `_strapiContent`, `_tableOfContentsDedications` caches (`:3037-3039`).
- `Sefaria.globalWarningMessage` (rendered by GlobalWarningMessage).

### 5.3 Interface translation (i18n) approach
- **Client**: `static/js/sefaria/strings.js` imports `static/js/sefaria/i18n/interface/en.json` + `he.json` (665 keyed IDs, namespaced by component: common 60, nav_sidebar 52, search 49, auth 45, misc 35, sheets 32, header 27, …). JSON is the Weblate source of truth; en.json supplies English display text. Rendered via `<InterfaceText>` (`Misc.jsx:100`) / `Sefaria._()`. Content strings with both languages use `{en, he}` objects; CSS hides the off-language `int-en`/`int-he`/`en`/`he` spans.
- **Server**: Django gettext `locale/{en,he}/LC_MESSAGES/django.po` (`{% trans %}` in templates, `_()` in views).
- **Interface language resolution** (`sefaria/system/middleware.py:85-188` `LanguageSettingsMiddleware`): profile setting → `interfaceLang` cookie → Cloudflare `cf-ipcountry` (IL ⇒ Hebrew) → Accept-Language → English. Domains pinned to a language (sefaria.org.il = Hebrew) redirect to matching domain (preserving module & path, adding `set-language-cookie`), except crawlers. `LanguageCookieMiddleware` (`:209-233`) sets cookie cross-domain and saves to profile. Content language default: Hebrew interface → `hebrew`, else `bilingual`; `?lang=` and `contentLang` cookie override. Translation-language-preference suggestion from country's languages ∩ `SUPPORTED_TRANSLATION_LANGUAGES` (never English). Version preferences by corpus from profile or `version_preferences_by_corpus` cookie.
- **Switching**: header globe menu `InterfaceLanguageMenu` → `DropdownLanguageToggle` links `/interface/english` / `/interface/hebrew?next=` (`static/js/common/DropdownMenu.jsx:292-316`) → `reader_views.interface_language_redirect` (`reader/views.py:1663+`) sets cookie, saves profile, switches domain.
- **RTL**: `ReaderApp` `layoutOrientation` rtl for Hebrew (`ReaderApp.jsx:118`); body class `interface-hebrew`; `.int-he` spans; RTL-aware icons (chevrons, arrows) and reCAPTCHA scaling; Hebrew numerals via `Sefaria.hebrew.encodeHebrewNumeral`; Hebrew calendar dates via Hebcal (`util.js:113-121`); manifest `dir: rtl, lang: he` for Hebrew.
- Non-Torah sites (`TORAH_SPECIFIC=false`) force English interface/content.

### 5.4 Analytics & tracking
- **GA4 gtag** (primary): configured in base.html; declarative `data-anl-*` system in `static/js/analyticsEventTracker.js`: `AnalyticsEventTracker.attach("#s2, #staticContentWrapper", ['click','scrollIntoView','toggle','mouseover','input','inputStart'])`. Elements declare `data-anl-event="<name>:<type>|…"`; fields aggregated from `data-anl-<field>` / `data-anl-batch` JSON on ancestors (closest wins), filtered to whitelist (`project, panel_type, panel_number, item_id, version, content_lang, content_id, content_type, panel_name, panel_category, position, ai, text, experiment, feature_name, from, to, action, engagement_value, engagement_type, logged_in, site_lang, traffic_type, promotion_name, link_type, form_name, form_destination`). Derived data for `<details>` toggle (from/to) and input (text). `scrollIntoView` via IntersectionObserver; `inputStart` fires on first input; MutationObserver attaches to newly added nodes.
- **Legacy Universal Analytics wrapper** `static/js/sefaria/track.js`: `Track.event(category, action, label, value, options)` (logs to console too; mock when GA absent; honors `hitCallback`), `promoView/promoClick` (enhanced ecommerce), `pageview`, content groups (primary/secondary category, book, content language), custom dimensions 1-7,10 (panels, book, ref, version title, page type, sidebars, logged-in, user id), `sheets()`, `uiFeedback()`, `exploreUrl/Book/Brush`, `setInterfaceLanguage`. Also `window.onerror` → GA "Javascript Errors" event when GA tracker present.
- **TrackG4** (`static/js/sefaria/trackG4.js`): `gtagClick(e, onClick, comp_name, params, AdContext)` → `onclick_<comp>` with `keywordTargets` + `interfaceLang`.
- Direct `gtag()` / `sa_event()` calls: banners/modals (`banner_viewed`, `modal_viewed`, `*_interacted_with_*`), `promo_viewed/promo_clicked`, `header_viewed`, `banner_probe_viewed`, `products_*`, sign-up funnel (§2.5).
- Simple Analytics (privacy-friendly, DNT collected) with `sa_metadata`.
- Hotjar, VWO, Unbounce, GTM (see §5.1).
- Server analytics: `api/linker-track` (linker usage), `/api/send_feedback`.

### 5.5 Error reporting
- Sentry browser SDK (`client.jsx:21-34`, DSN from `CLIENT_SENTRY_DSN`), server Sentry config `sefaria/settings_utils.py`. GA JS-error events in `track.js:5-9`. `/admin/error` (`sefaria/views.py:1111`) deliberately raises to test.

### 5.6 Cookies & storage used by the client (inventory)
Cookies: `cookiesNotificationAccepted` (consent, 20y, parent domain), `interfaceLang`, `contentLang`, `_user` (uid, 2y), `user_history` (anon history ≤3KB), `translation_language_preference`, `translation_language_preference_suggested`, `open_trans_banner_shown`, `version_preferences_by_corpus`, `gdoc_installed`, `<messageName>Accepted` (ReaderMessage), SiteWideBanner `cookieName`s (`chatbot_experiment_banner_dismissed`, `signup_promo_banner_dismissed`), `sefaria_sso_next` (SSO redirect), Django `sessionid`/`csrftoken` (cross-subdomain via `SessionCookieDomainMiddleware`, `sefaria/system/middleware.py:236+`).
localStorage: `modal_<name>`, `banner_<name>` (Strapi dismissals), `promo_backoff_<cookie>_{state,session_counter,last_session_at_sec}`, `isReturningVisitor`, `sa_id`. sessionStorage: `isNewVisitor`, `sa.header_viewed`, `sa.banner_probe`, `promo_viewed_<cookie>`, `sefaria_interruptive_ui_shown`, `sefaria_pending_sso_attempt`, `sefaria_active_signup_flow`, `sa_custom_session_id`.

### 5.7 Cookie consent
- Single-button notice `CookiesNotification` (`Misc.jsx:2816-2856`); no category opt-outs. Third-party analytics load regardless (consent is informational). Google One Tap defers if the cookie bar is visible.

### 5.8 PWA / mobile web / app integration
- Web manifest (no service worker anywhere in repo): `/site.webmanifest` or `/manifest.json` → `reader_views.dynamic_manifest` rendering `templates/manifest.json` per module & language (name "Sefaria Library/Voices", 192/512/maskable icons, theme/background color, `display: standalone`, `orientation: portrait-primary`, dir/lang) (`reader/views.py:5575-5602`). Favicons per module via `/favicon.ico|.svg`, `/apple-touch-icon.png` (`reader/views.py:5446-5468`).
- **Universal links / app links**: `/apple-app-site-association` & `/.well-known/…` (iOS app `2626EW4BML.org.sefaria.sefariaApp`, exclusions for OAuth callbacks and `no_applink` param — `reader/views.py:5420-5443`); `/.well-known/assetlinks.json` (Android `org.sefaria.sefaria`, `:5482-5492`); `WebSessionRedirectMiddleware` adds `no_applink` to in-session redirects so iOS doesn't hijack mid-flow; client strips it (`client.jsx:13-18`).
- App promos: `apple-itunes-app` meta smart banner, `/ios`, `/mobile`, `/app`, `/henry-and-julia-koschitzky-apps` pages, `AppStoreButton` in NavSidebar "GetTheApp" module, Steinsaltz app buttons, `/donate/mobile` redirect, `/mobile-about-menu` page (used by app's About menu), `/help` redirect "Used in the app".
- Mobile app backend endpoints: JWT login/refresh (`api/login/`), `api/register/`, `api/auth/google|apple/mobile`, `api/account/delete`, `api/profile/sync` (history/saved sync, `client` param).
- Mobile web specifics: `multiPanel` false → single-panel layout; `Sefaria.getBreakpoint()`; `SearchTabsMobileWeb.jsx`; header mobile nav menu (`Header.jsx` MobileNavMenu with Donate link); SSO uses redirect mode on mobile; chatbot & chatbot banner hidden on mobile (`ReaderApp.jsx:2573-2575`); Strapi `shouldDeployOnMobile` field exists (fetched; not read by current selection code); About sidebar hidden on mobile static pages; Playwright mobile-web config `playwright.mobileweb.config.ts`.
- Viewport disables pinch zoom (`user-scalable=no`).

### 5.9 Embeds & public JS
- `/sefaria.js` — packaged Sefaria JS library for third parties (data.js + webpack `SEFARIA_JS` bundle; `Sefaria.apiHost="https://www.sefaria.org"`) (`sefaria/views.py:434-445`, `templates/js/sefaria.js`).
- `/linker.js`, `/linker.v2.js`, `/linker.v3.js` (+ `.map`) — the embeddable citation linker (§9).
- `EMBED` flag adds `embeded` body class (embedded reader view).
- `/api/img-gen/<tref>` social share images; OG tags.
- Remote config: `api/remote-config` (`remote_config` app, §11.4) delivered also as `remoteConfig` prop.
