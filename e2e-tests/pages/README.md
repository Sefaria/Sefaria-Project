# Page Objects (the POM layer)

This folder is the heart of the framework. Every spec drives the product through a **page object** — a class that owns the locators and actions for one feature area — reached via the single `PageManager` entry point (`pm.onX()`). Specs never touch `page.locator(...)` for product UI; that lives here.

New here? Read the root [handbook](../README.md) first, especially [The PageManager pattern](../README.md#the-pagemanager-pattern) and [Canonical page-object style](../README.md#canonical-page-object-style). This file is the **index and status map** for the 24 files in `pages/`.

---

## Model new page objects on these only

The newest, best-written page objects — copy their structure:

- ⭐ **[resourcePanelPage.ts](resourcePanelPage.ts) — the gold standard.** Private `get` accessors for fixed elements; private **parameterized `Locator` factories** for repeated, argument-driven lookups (`toolsButton(name)`, `segment(ref)`); bilingual **English-stable `data-name`** anchors; every timeout wrapped in `t()` (with justified tiered timeouts for rate-limited endpoints); network interception for destructive APIs; dialog pre-registration; Font-Awesome force-clicks; and **data-loaded gating** (waits for a specific child, not just the container). It demonstrates nearly every pattern in the suite.
- ⭐ **[voicesTopicPage.ts](voicesTopicPage.ts) — the concise counterpart.** All-private `get` accessors, CSS selectors each annotated with the React source line that owns the DOM, data-loaded gating, and a `withViewport` helper. A good one to read end-to-end.

Everything a canonical POM does is spelled out in the handbook's [Canonical page-object style](../README.md#canonical-page-object-style): extend `HelperBase`, private `get` accessors + parameterized `Locator` factories, wrap every timeout in `t()`, prefer role/`data-name` over visible text, and **register the class in [pageManager.ts](pageManager.ts)**.

> Do **not** model new code on the files marked ⚠️ legacy below — they work and stay, but predate the current conventions.

---

## Index

**Infrastructure (not feature page objects):**

| File | Role |
| --- | --- |
| [pageManager.ts](pageManager.ts) | Mounts all 20 page objects and exposes the `pm.onX()` accessors. Register every new POM here. |
| [helperBase.ts](helperBase.ts) | Base class every page object extends — provides `this.page` and `this.language`. |

**Mounted page objects (20) — reached via `pm.<accessor>()`:**

| File | Accessor | Owns | Status |
| --- | --- | --- | --- |
| [resourcePanelPage.ts](resourcePanelPage.ts) | `onResourcePanel()` | ConnectionsPanel reader sidebar (RP-*) | ⭐ **canonical model** |
| [voicesTopicPage.ts](voicesTopicPage.ts) | `onVoicesTopic()` | Voices topic pages (TOV-*) | ⭐ **canonical model** |
| [moduleSidebarPage.ts](moduleSidebarPage.ts) | `onModuleSidebar()` | Sticky nav sidebar + footer links | ✅ good role-based example |
| [libraryAssistantPage.ts](libraryAssistantPage.ts) | `onLibraryAssistant()` | LA `<lc-chatbot>` (open shadow DOM) | ✅ shadow-DOM exemplar |
| [mobileHamburgerPage.ts](mobileHamburgerPage.ts) | `onMobileHamburger()` | Mobile hamburger drawer (HAM-*) | ✅ standard |
| [textsPage.ts](textsPage.ts) | `onTextsPage()` | Texts browse page | ✅ standard |
| [topicsPage.ts](topicsPage.ts) | `onTopicsPage()` | Topics pages | ✅ standard |
| [communityPage.ts](communityPage.ts) | `onCommunityPage()` | Community page | ✅ standard |
| [donatePage.ts](donatePage.ts) | `onDonatePage()` | Donate page | ✅ standard |
| [loginPage.ts](loginPage.ts) | `onLoginPage()` | Login form | ✅ standard |
| [signupPage.ts](signupPage.ts) | `onSignUpPage()` | Sign-up form | ✅ standard |
| [searchPage.ts](searchPage.ts) | `onSearchPage()` | Search + autocomplete | ✅ standard |
| [userMenu.ts](userMenu.ts) | `onUserMenu()` | User dropdown menu | ✅ standard |
| [sourceTextPage.ts](sourceTextPage.ts) | `onSourceTextPage()` | Reader source-text page | ✅ standard |
| [moduleHeaderPage.ts](moduleHeaderPage.ts) | `onModuleHeader()` | Module header (logo, dropdowns, switcher) | ⚠️ not canonical — leaks selector strings to callers, carries dead code |
| [sheetEditorPage.ts](sheetEditorPage.ts) | `onSourceSheetEditorPage()` | Sheet-editor lifecycle (publish/save/unpublish/delete) | ⚠️ legacy — `locator = () => …` arrow-fn fields |
| [profilePage.ts](profilePage.ts) | `onProfilePage()` | Public profile page | ⚠️ public `get` getters (not canonical) |
| [editProfilePage.ts](editProfilePage.ts) | `onEditProfilePage()` | Edit-profile form | ⚠️ public `get` getters |
| [accountSettingsPage.ts](accountSettingsPage.ts) | `onAccountSettingsPage()` | Account settings | ⚠️ public `get` getters |
| [banner.ts](banner.ts) | `navigateFromBannerTo()` | Banner / module-header nav shortcuts | ⚠️ legacy — does **not** extend `HelperBase` |

**Orphans — not registered, not imported, cleanup candidates:**

| File | Note |
| --- | --- |
| [sheetReaderPage.ts](sheetReaderPage.ts) | Not mounted on `PageManager`; no spec imports it. |
| [sourceSheetEditor.page.ts](sourceSheetEditor.page.ts) | Not mounted; duplicates much of `sheetEditorPage.ts`. |

*(2 infrastructure + 20 mounted + 2 orphans = 24 files.)*

---

## Adding a new page object

1. Create `pages/<feature>Page.ts`, extending `HelperBase`, following [resourcePanelPage.ts](resourcePanelPage.ts) / [voicesTopicPage.ts](voicesTopicPage.ts) and the handbook [skeleton](../README.md#canonical-page-object-style).
2. Use private `get` accessors for fixed elements and private parameterized methods returning a `Locator` for repeated lookups. Wrap every timeout in `t()`. Prefer `getByRole` / `data-name` over visible text.
3. **Register it in [pageManager.ts](pageManager.ts):** import the class, add a `private readonly` field, instantiate it in the constructor, and expose an `onSomeFeaturePage()` accessor.
4. Most of the time you'll *extend an existing* page object instead of creating one — only create a new POM when the feature area doesn't fit any existing one.

## Related

- [../README.md](../README.md) — the suite handbook (PageManager pattern, canonical style, legacy list)
- [pageManager.ts](pageManager.ts) — where every page object is mounted and exposed
