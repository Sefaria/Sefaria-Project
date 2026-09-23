# Library Module — E2E Tests

End-to-end tests for the **Library** module's own UI — the reader's header, the sticky nav sidebar, and deep texts-tree navigation. Runs under the `chrome-library` / `firefox-library` / `safari-library` projects with `baseURL` = `MODULE_URLS.EN.LIBRARY` (`www.<sandbox-domain>`).

New here? Read the root [handbook](../README.md) first — it covers setup, the PageManager pattern, and the conventions every spec in this folder follows.

---

## What it covers

| Spec file | Test IDs | Area |
| --- | --- | --- |
| [header.spec.ts](header.spec.ts) | `MOD-H001` – `MOD-H013` | Library module header: logo navigation, search dropdown sections/icons, full-text search, language switcher, module switcher, user-auth menu, browser back/forward, keyboard-nav a11y, and cross-module auth (Library ↔ Voices). |
| [sidebar.spec.ts](sidebar.spec.ts) | `MOD-S001` – `MOD-S013` | Sticky nav sidebar + footer links: A Living Library, Translations, Learning Schedules, Resources, About, Help (Zendesk), Contact (mailto), Newsletter, Blog, Social/Shop (new tabs), Ways to Give, Terms & Privacy. |
| [texts-tree-traversal.spec.ts](texts-tree-traversal.spec.ts) | *(descriptive names, no `MOD-` IDs)* — 25 tests | Deep TOC traversal across Tanach, Talmud, Kabbalah, and Reference works (Contents/Versions tabs, alt-TOCs, browse-by-letter, author indexes). |

> ⚠️ **`texts-tree-traversal.spec.ts` is a legacy-pattern spec** — it bypasses `PageManager` and uses raw `page.getByRole()` throughout (it's on the root handbook's [legacy list](../README.md#legacy-patterns-to-recognise)). It works and stays, but **do not model new specs on it.** Use [header.spec.ts](header.spec.ts) as the canonical example for this folder.

---

## Conventions for this folder

- **Entry point:** anonymous tests start with `goToPageWithLang(context, MODULE_URLS.EN.LIBRARY, LANGUAGES.EN)`; logged-in tests use `goToPageWithUser(context, MODULE_URLS.EN.LIBRARY, BROWSER_SETTINGS.enUser)`.
- **ID scheme:** `MOD-H###` for header tests, `MOD-S###` for sidebar tests. Run one with `npx playwright test -g 'MOD-H002'`. (The `MOD-S###` series is shared with the Voices sidebar — see [../voices/README.md](../voices/README.md) — so keep numbers from colliding when adding new sidebar tests.)
- **Page objects:** drive the header through [pm.onModuleHeader()](../pages/moduleHeaderPage.ts) and the sidebar through [pm.onModuleSidebar()](../pages/moduleSidebarPage.ts). Add new methods to those POMs rather than putting raw locators in the spec.

## Running

```bash
npx playwright test --project=chrome-library
npx playwright test library/header.spec.ts --project=chrome-library
npx playwright test -g 'MOD-H010'
```

## Related

- [../README.md](../README.md) — the suite handbook (setup, conventions, PageManager)
- [../pages/README.md](../pages/README.md) — page-object index
- [../pages/moduleHeaderPage.ts](../pages/moduleHeaderPage.ts), [../pages/moduleSidebarPage.ts](../pages/moduleSidebarPage.ts) — the POMs these specs drive
