# API keys Phase 1: gateway and developer settings (Playwright plan)

Scope: the merge of the API key gateway (Go auth service behind Envoy ext_authz) with the developer settings UI
(`powered_by` + `SettingsPage.jsx`). This plan lists the cases that run in Playwright, under
`e2e-tests/api-keys/`. Cases at other layers (Django, Jest, Go, stack scripts, cauldron scripts) keep the same IDs
and live next to the code they test.

How to run, targets, fixtures and helpers: [`../api-keys/README.md`](../api-keys/README.md). Shared names, ports and
the manifest format: [`../api-keys/CONTRACT.md`](../api-keys/CONTRACT.md).

## Conventions

- **Title = case ID first.** `test('C3: …')`. One ID may have several tests (`A4a: … (GET)`, `A4a: … (POST)`); one
  test never covers two IDs.
- **Desired behaviour.** Every test asserts what *should* happen. A test that fails today stays failing (no
  `test.fail()`), and its title carries `@known-gap <id>`, where `<id>` is the open decision (`D2`, `D3`, `D4`,
  `D6`, `N-D7`, `N-D8`) or the UI issue number from the research (`S1` … `S13`). Filter with
  `--grep @known-gap` / `--grep-invert @known-gap`.
- **Infra is not a result.** 502/503/504, the cauldron splash page, `ERR_CONTENT_LENGTH_MISMATCH` and
  `Sefaria is not defined` are retried once and then reported as `[infra]`.
- **Accounts.** Each suite uses only its own manifest roles (CONTRACT.md §3).

## Validation

- **Negative control:** run against a build without the change (master on the local stack, or the flag-off Django
  on `flagoff.gateway.test`). New-feature tests must fail there.
- **Positive control:** the local stack with the merge branch.
- **Mutation check (P0):** for each P0 gateway case, flip one input (key, origin, path) and confirm the assertion
  catches it.

## Cases

Layer: `L` = local stack, `C` = cauldron. Owner = the spec file that holds the test.

| ID | P | Layer | Case (desired) | Spec | Known gap |
|---|---|---|---|---|---|
| SMOKE-1 | — | L, C | A seeded account logs in; `Sefaria._uid` equals its seeded id | `_smoke.spec.ts` | |
| A4a | P0 | L, C | No key on the gated path (GET and POST): 401 `api_key_required`, `www-authenticate: ApiKey realm="sefaria"` | `_smoke.spec.ts`, `gateway/decisions.spec.ts` | |
| A1, A2a-d, A3a-b, A5a-b, A6a, A6c, A7, A10, N-A1-N-A3, N-A5-N-A8, N-A11 | P0-P2 | L (+C) | Gateway decisions, origins, paths and headers, as in the matrix | `gateway/*.spec.ts` | A2b, A2d: `D2` |
| A9a | P0 | L, C | Revoke a key in the UI, then call the gateway: 401 `api_key_invalid` within 1 s; registry version rises | `ui/keys-gateway.spec.ts` | |
| A9b | P0 | L | Delete a project in the UI; its keys are 401 within 1 s | `ui/keys-gateway.spec.ts` | |
| A9c | P0 | L, C | Create a key in the UI; it works within 1 s of "Ready to use" | `ui/keys-gateway.spec.ts` | |
| C3 | P0 | L | Keys up to 5; the 6th refused with the notice and a disabled button; revoking frees a slot | `ui/keys.spec.ts` | |
| C4 | P0 | L | Restriction follows a website change; clearing the website lifts it ("works anywhere again") | `ui/keys-gateway.spec.ts` (gateway), `ui/projects.spec.ts` (UI) | |
| N-C12 | P2 | L | Label over 100 characters; two tabs racing for the 5th key: server message shows, count refreshes | `ui/keys.spec.ts` | `S8` |
| N-C17 | P2 | L | Copy, show/hide, masked by default; navigating away during "Setting up your key" | `ui/keys.spec.ts` | |
| N-M6 | P1 | L | Delete the owner's account in the UI; its key is 401 within 1 s | `ui/keys.spec.ts` | |
| C1 | P0 | L | Email confirmation with mocks off: send, second tab, link twice, expired link + new link, former address, logged out | `ui/onboarding.spec.ts` | |
| N-C1 | P1 | C | C1 through the test panel (mocks on) | `ui/onboarding.spec.ts` | |
| C2 | P1 | L | Resend limits: 429 with `Retry-After`, server message shown | `ui/onboarding.spec.ts` | `S1` |
| N-C3 | P1 | L | Errors before setup shown in Get started, not carried over | `ui/onboarding.spec.ts` | `S1` |
| N-C8 | P2 | L | Email changed in the Account tab, Developer tab without reload shows "Confirm your new email address" | `ui/email-change.spec.ts` | `S5` |
| N-C9 | P1 | L | Double-click "Create project" / "Yes, add it": exactly one project | `ui/projects.spec.ts` | `S6` |
| N-C13 | P2 | L | Back from `/projects/<id>` collapses the card; Account Cancel after switching tabs | `ui/projects.spec.ts` | `S10`, `S12` |
| N-C14 | P1 | L | "Is this your project?": Yes, No, Not now, Escape, claimed elsewhere, two listings | `ui/listing-claim.spec.ts` | `N-D8` (consent) |
| B2 | P0 | L, C | Account settings with the flag off and on: save, reload, values persist | `account/account-settings.spec.ts` | |
| N-M2 | P1 | L | Hebrew email-change placeholders | `account/account-settings.spec.ts` | yes (see matrix) |
| N-M3 | P0 | L, C | Existing UMN-004 passes against the branch | `account/account-settings.spec.ts` | |
| N-C5 | P1 | L | Flag-off pass on `flagoff.gateway.test`: one tab, no agent instructions, no `/api/developer/*` traffic | `account/flag-off.spec.ts` | |
| N-C6 | P1 | L | Tab on `/settings/account` with an unclaimed listing; Escape does not dismiss the hidden dialog | `account/account-settings.spec.ts` | `S2` |
| N-C7 | P0 | L | Save, in-app link, Back: fresh data, no key values in `history.state` | `account/account-settings.spec.ts` | `S4` |
| B1, B3, B4-B8, B10, N-B2, N-B4, N-A9, A8, N-A4, N-M4 | P0-P2 | C (C8 also L) | Website, linker and replayed callers keep working under the gateway | `callers/*.spec.ts` | A8, N-A4: `N-D7` |
| C8 | P0 | C, L | UI key, restricted, used from its website (allowed, readable) and another site (403, readable) | `callers/browser-key-cors.spec.ts` | `N-D7` |
| C10 | P2 | L | Hebrew RTL, 375 px, keyboard-only dialogs | `ui/a11y-rtl-mobile.spec.ts` | |
| N-CR4 | P1 | L | Where full key values appear (SSR, API responses, admin, logs) | `ui/keys.spec.ts` + log grep | see matrix |
| N-CR12 | P2 | L | Session ends mid-flow / CSRF failure: readable message offering to log in | `ui/projects.spec.ts` | see matrix |
