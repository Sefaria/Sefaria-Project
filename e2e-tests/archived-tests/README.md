# Archived Tests

Retired specs kept for reference. **No Playwright project runs anything in this folder** — it isn't a `testDir` in either config, so these tests never execute in CI or in a normal `npx playwright test` run.

---

## Why a test gets archived

A spec lands here (instead of being deleted) when it's still useful locally but **unsafe or inappropriate to run in CI** — typically because it:

- **mutates real/production data** (publishes sheets, resets server state), and/or
- **requires superuser credentials** or a Django-admin endpoint, and/or
- can only run meaningfully against a **local environment**, not the shared sandbox.

Archiving keeps the working reference around without letting it destabilize the green suite.

## What's here

| Spec | Why archived |
| --- | --- |
| [voices/trending-topics.spec.ts](voices/trending-topics.spec.ts) | Publishes sheets with random topics from multiple users and triggers the trending-tags recalculation via the Django admin API, then checks the Trending Topics sidebar. It **changes data and requires `PLAYWRIGHT_SUPERUSER_*` credentials**, so it should only be run locally — never in CI. |

## Running an archived test locally

These aren't wired to a project, so run them by path against a local environment with the right credentials in `.env`:

```bash
# Example — requires PLAYWRIGHT_SUPERUSER_EMAIL / _PASSWORD and a local/sandbox you can safely mutate
npx playwright test "archived-tests/voices/trending-topics.spec.ts" --project=chrome-voices
```

If you're reviving one permanently, move it back into an active folder (e.g. `voices/`) and confirm it's CI-safe first — or gate it behind a route interception so it stops mutating real state (see the root handbook's destructive-API guidance).

## Related

- [../README.md](../README.md) — the suite handbook
- [../CLAUDE.md](../CLAUDE.md) — rules on destructive-API interception and destructive-auth tests
