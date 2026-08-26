# User Menu — E2E Tests

Feature-coverage tests for the flows reachable from the header **user menu**: login, profile view/edit, account settings, language switch, module switcher, and logout. Runs under the `chrome-user-menu` / `firefox-user-menu` / `safari-user-menu` projects.

New here? Read the root [handbook](../../README.md) first — it covers setup, the PageManager pattern, and the conventions every spec follows.

> These flows span both modules (Profile lives on Voices, Account Settings on Library), so tests navigate to absolute `MODULE_URLS`. The project `baseURL` (Library) is incidental.

---

## What it covers

| Test ID | Test | `@sanity`? |
| --- | --- | --- |
| `UMN-001` | UI login (open menu → login → credentials); profile pic appears | **No** — exercised end-to-end but not part of the release-gate set |
| `UMN-002` | View profile via the Voices user menu; name/position/org/image; edit button on own profile | Yes |
| `UMN-003` | Edit profile (position/org/location) on Voices; save persists | Yes |
| `UMN-004` | Edit account settings via Library; toggle notifications/reading-history/customs; save | Yes |
| `UMN-005` | Change language EN↔HE; `body` class + UI text update; round-trips | Yes |
| `UMN-006` | Module switcher reaches Voices, Developers, More-from-Sefaria, and back | Yes |
| `UMN-007` | UI logout terminates the session; logged-out UI | Yes |

The `@sanity`-tagged subset (`UMN-002` … `UMN-007`) is part of the release-gate suite (see [../../Sanity/README.md](../../Sanity/README.md)).

---

## ⚠️ Destructive-auth gotcha (UMN-007)

`UMN-007` performs a **real UI logout**, which destroys the account's server-side Django session row and invalidates the shared `auth_*.json` for every concurrent worker reading it. It therefore uses **`BROWSER_SETTINGS.enAdmin`** — the de-facto destructive-auth throwaway — **not** `enUser`, because no other concurrent test depends on the admin session staying alive. Any new destructive-auth test must do the same, or intercept the destructive request. Full treatment: [../../CLAUDE.md](../../CLAUDE.md) rule §2.21 and [root handbook → Destructive-auth tests](../../README.md#destructive-auth-tests).

---

## Conventions for this folder

- **Entry point:** anonymous-start (`UMN-001`, `UMN-005`, `UMN-006`) use `goToPageWithLang(...)`; logged-in-start use `goToPageWithUser(...)` (`enUser`, except `UMN-007` → `enAdmin`).
- **ID scheme:** `UMN-###`.
- **Module-specific UI:** the **Profile** menu exists only on Voices; **Account Settings** only on Library — navigate to the right module first.

## Running

```bash
npx playwright test --project=chrome-user-menu
npx playwright test -g 'UMN-004'
```

## Related

- [../../README.md](../../README.md) — the suite handbook
- [../../Sanity/README.md](../../Sanity/README.md) — what `@sanity` means + the release-gate suite
