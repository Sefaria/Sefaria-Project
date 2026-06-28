# Voices Module — E2E Tests

End-to-end tests for the **Voices** module's own UI — its header and sidebar. Runs under the `chrome-voices` / `firefox-voices` / `safari-voices` projects with `baseURL` = `MODULE_URLS.EN.VOICES` (`voices.<sandbox-domain>`).

New here? Read the root [handbook](../README.md) first — it covers setup, the PageManager pattern, and the conventions every spec in this folder follows.

> Voices topic **pages** (`/topics/<slug>`) are a separate, deeper suite — see [../Full testing by Feature/Voices Topics/README.md](../Full%20testing%20by%20Feature/Voices%20Topics/README.md). This folder is only the Voices header/sidebar chrome.

---

## What it covers

| Spec file | Test IDs | Area |
| --- | --- | --- |
| [header.spec.ts](header.spec.ts) | `MOD-H003`, `MOD-H011`, `MOD-H014` | Voices module header: navigation and elements, search dropdown sections/icons (Topics / Authors / Users), and the **Create New Sheet** button when logged in. |
| [sidebar.spec.ts](sidebar.spec.ts) | `MOD-S013` – `MOD-S016` | Voices sidebar modules and buttons, the **Create** button's logged-out vs logged-in behavior, **Learn More** → sheet navigation, and **Subscribe** → newsletter. |

The Voices header/sidebar differ from the Library ones (different links, the sheet-creation entry point), which is why these live in their own module folder and project with the `voices.*` baseURL.

---

## Conventions for this folder

- **Entry point:** `goToPageWithLang(context, MODULE_URLS.EN.VOICES, LANGUAGES.EN)` for anonymous; `goToPageWithUser(context, MODULE_URLS.EN.VOICES, BROWSER_SETTINGS.enUser)` for logged-in (the Create-sheet tests need auth).
- **ID scheme:** `MOD-H###` / `MOD-S###`, shared with the Library module specs — pick numbers that don't collide.
- **Page objects:** [pm.onModuleHeader()](../pages/moduleHeaderPage.ts) and [pm.onModuleSidebar()](../pages/moduleSidebarPage.ts); the `language` and module are inferred from how you entered.

## Running

```bash
npx playwright test --project=chrome-voices
npx playwright test voices/sidebar.spec.ts --project=chrome-voices
npx playwright test -g 'MOD-H014'
```

## Related

- [../README.md](../README.md) — the suite handbook
- [../pages/README.md](../pages/README.md) — page-object index
- [../Full testing by Feature/Voices Topics/README.md](../Full%20testing%20by%20Feature/Voices%20Topics/README.md) — Voices topic-page suite (TOV-*)
