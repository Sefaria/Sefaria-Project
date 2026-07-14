# Misc — Cross-cutting / Platform-level E2E Tests

Tests for platform-level invariants that don't belong to any single module's UI — currently, legacy URL redirects. Runs under the `chrome-misc` / `firefox-misc` / `safari-misc` projects with `baseURL` = `www.<sandbox-domain>`.

New here? Read the root [handbook](../README.md) first.

---

## What it covers

| Spec file | Area |
| --- | --- |
| [help-sheet-redirects.spec.ts](help-sheet-redirects.spec.ts) | Legacy **help-sheet URLs redirect to the Zendesk Help Center**. Two describes (English + Hebrew), each **data-driven** from [../helpDeskLinksConstants.ts](../helpDeskLinksConstants.ts): every old `www.sefaria.org/sheets/*` (EN) and `www.sefaria.org.il/sheets/*` (HE) link must 301-redirect to its exact `help.sefaria.org/hc/...` article, with no error status. |

Tests are generated dynamically — one per redirect mapping in `helpDeskLinksConstants.ts` — so adding a new redirect to that constants file automatically adds a test.

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
