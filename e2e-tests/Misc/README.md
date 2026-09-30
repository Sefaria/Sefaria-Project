# Misc — Cross-cutting / Platform-level E2E Tests

Tests for platform-level invariants that don't belong to any single module's UI — legacy URL redirects and the keyed interface-string (i18n) sweep. Runs under the `chrome-misc` / `firefox-misc` / `safari-misc` projects with `baseURL` = `www.<sandbox-domain>`.

New here? Read the root [handbook](../README.md) first.

---

## What it covers

| Spec file | Area |
| --- | --- |
| [help-sheet-redirects.spec.ts](help-sheet-redirects.spec.ts) | Legacy **help-sheet URLs redirect to the Zendesk Help Center**. Two describes (English + Hebrew), each **data-driven** from [../helpDeskLinksConstants.ts](../helpDeskLinksConstants.ts): every old `www.sefaria.org/sheets/*` (EN) and `www.sefaria.org.il/sheets/*` (HE) link must 301-redirect to its exact `help.sefaria.org/hc/...` article, with no error status. |
| [i18n-keyed-strings.spec.ts](i18n-keyed-strings.spec.ts) | **Keyed interface strings render where they should** (`I18N-NNN`). Data-driven from [i18nStringsManifest.ts](i18nStringsManifest.ts): for each page in the manifest, in both English and Hebrew interfaces, (1) the localized value of every keyed string ID expected on that page is rendered — visible text or aria-label/alt/title/placeholder — and (2) **no raw keyed ID** (e.g. `common.cancel`) leaked into the rendered DOM, which is what a broken `Sefaria._()` lookup produces. IDs and translations live in `static/js/sefaria/i18n/keyed/{en,he}.json`; the manifest stores only IDs, so Weblate edits never break tests. Uses `pm.onInterfaceStrings()` ([../pages/interfaceStringsPage.ts](../pages/interfaceStringsPage.ts)). |

Tests are generated dynamically — one per redirect mapping in `helpDeskLinksConstants.ts`, and one per page × language in `i18nStringsManifest.ts` — so extending those data files automatically adds tests.

**Adding a page to the i18n sweep:** add a `StringsPageSpec` entry to `i18nStringsManifest.ts` with the page path, a CSS anchor that only exists once the page's content loaded, and the keyed IDs verified (in component source) to render unconditionally on load. The manifest header documents what is deliberately out of scope (interaction-gated, moderator-only, overlay, and empty-state strings — the leak check still covers those surfaces).

---

## When does a test belong in `Misc/`?

Use this folder for **platform-level invariants** — redirects, static-route assertions, and cross-cutting behavior that isn't tied to one module's feature UI. Decision guide (full version in the root handbook's [Where does my test go?](../README.md#where-does-my-test-go)):

- Module-specific UI → `library/` or `voices/`.
- Cross-module auth journeys / Library→Voices page redirects → `Full testing by Feature/Cross-Module/`.
- Release-gate smoke → tag the test `{ tag: '@sanity' }` wherever it lives; see [../Sanity/README.md](../Sanity/README.md).
- Platform invariants, help-sheet redirects, static routes that don't fit a module → **`Misc/`**.

> Note: the cross-module **page-redirect** tests (Library→Voices) live in [../Full testing by Feature/Cross-Module/redirects.spec.ts](../Full%20testing%20by%20Feature/Cross-Module/redirects.spec.ts), not here — `Misc/` holds only the help-sheet → Zendesk redirects.

## Running

```bash
npx playwright test --project=chrome-misc
npx playwright test Misc/help-sheet-redirects.spec.ts --project=chrome-misc
```

## Related

- [../helpDeskLinksConstants.ts](../helpDeskLinksConstants.ts) — the redirect mappings that drive the tests
- [../Full testing by Feature/Cross-Module/README.md](../Full%20testing%20by%20Feature/Cross-Module/README.md) — the cross-module page-redirect suite (`XMOD-R`)
- [../README.md](../README.md) — the suite handbook
