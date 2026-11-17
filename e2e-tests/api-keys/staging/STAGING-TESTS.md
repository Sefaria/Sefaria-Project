# API keys phase 1: staging tests after the master merge

What each tester runs after #3774 reaches staging. Every row has a script, a Playwright spec (`*.staging.ts`, run only by `playwright.staging.config.ts`) or a Claude-in-Chrome
prompt. The runbook (steps, stop rules) is on the Sefaria wiki: `projects/api-key-program/plans/merge-day-runbook-phase1`.

Setup, once per machine (bash 4+, a python3 with PyYAML, the dev-cluster context, `gcloud auth login` done):

```bash
export PATH=/opt/homebrew/bin:$PATH APIKEYS_RELEASE_PYTHON3=<python3 with PyYAML>
R=scripts/release/api-keys-phase1  D=gke_development-205018_us-east1-b_cluster-1
$R/staging-smoke-creds.sh --context $D        # throwaway account, legacy key, knn token -> ~/.config/sefaria-apikeys-smoke
```

Re-run `staging-smoke-creds.sh` after a Sunday restore (it removes the account). `--remove` deletes the account.
`--cauldron p1merge` does the same on a cauldron, for rehearsals.

| Area                                                                         | Tester              | Run                                                                                                                                       | Pass                                    |
| ---------------------------------------------------------------------------- | ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| Release, migrations, smoke, logs                                             | Yotam               | `staging-smoke.sh` (below)                                                                                                                | 0 FAIL                                  |
| Account page: every control saves, reloads, is restored                      | Daniel              | `npx playwright test -c e2e-tests/api-keys/staging/playwright.staging.config.ts account`                                                  | 7 passed                                |
| Account page: email change, Google Drive disconnect, look and feel           | Penina, Daniel      | Claude-in-Chrome prompts A and B                                                                                                          | as each prompt says                     |
| X-Frame-Options on login, register and password reset                        | Yotam               | `npx playwright test -c e2e-tests/api-keys/staging/playwright.staging.config.ts xframe`                                                   | 6 passed                                |
| Mobile app login                                                             | anyone with the app | phone steps C                                                                                                                             | each step works                         |
| Powered by listing unchanged                                                 | Sarah               | `$R/powered-by-names.sh --base-url https://www.sefariastaging.org` with `--record before.json`, then `--compare before.json`; or prompt D | PASS: every project still listed        |
| Logs redact `api_key`, pods healthy                                          | Brendan             | `staging-smoke.sh --context` (log check) and the commands in E                                                                            | no key value in any log                 |
| Next release on semantic-release 24                                          | Brendan             | `$R/check-next-release.sh --since <merge commit>`                                                                                         | PASS (WAIT until another team releases) |
| Library Assistant through `/api/knn-search`                                  | Yotam               | `staging-smoke.sh --knn-token-file` and prompt F                                                                                          | answers with sources                    |
| Tiers and the auth registry (needed only before the auth service is enabled) | Yotam               | `$R/auth-registry-setup.sh --env staging --context $D`                                                                                    | step 1 and 2 pass                       |
| Old code on the phase 1 schema (dev cauldrons without the auth service)      | Yotam               | `$R/cauldron-schema-compat.sh --context $D brb`                                                                                           | all PASS                                |

## The smoke run (Yotam)

```bash
C=~/.config/sefaria-apikeys-smoke
$R/listing-count.sh --env staging --context $D --listing before --record listing-staging.json   # before the merge
$R/staging-smoke.sh --base-url https://www.sefariastaging.org --context $D --listing-record listing-staging.json \
  --session-cookie-file $C/session-cookie --knn-token-file $C/knn-token --legacy-apikey-file $C/legacy-apikey
```

On master's staging (2026-11-17) this fails exactly 5 checks, all phase 1: `X-Frame-Options` on the three auth pages,
the `OPTIONS /api/*` preflight, and the `api_key` value in the logs. After the merge all of them must pass.

## Claude-in-Chrome prompts

Each prompt is pasted into Claude in Chrome as written. They use your own staging account; log in first.

**A. Email change (Daniel or Penina).** The change takes effect at once; no confirmation email is sent.

> Open https://www.sefariastaging.org/settings/account. I'm logged in. Note the email address shown. Click "Change
> Email", enter a new address I control in both fields, enter my password, and click "Update Email" (that button, not
> the page's Save). Tell me exactly what the page says, then reload and tell me which address it shows. Then change it
> back the same way and confirm the original address is shown again. Report any error text, any console error (read
> the console), and any step where a button did nothing.

**B. Look and feel, and the Google Drive disconnect (Penina).** "Disconnect" removes the account's Google Drive access
(used to export sheets) at once, with no confirmation. It shows only on an account with Drive connected. Use a staging
test account you can reconnect, and say in the prompt whether to click it.

> Open https://www.sefariastaging.org/settings/account while logged in. Take a screenshot at desktop width and at
> 390 px wide. Check that every section shows: email notifications, site language, reading history, textual custom,
> Library Assistant, email. If a Google Drive connection is shown, tell me what it says, but do not click Disconnect
> unless I write "click Disconnect" here: [ ]. Then switch the site language to Hebrew, save, and screenshot the page in
> Hebrew; switch back to English and save. List anything misaligned, untranslated, cut off or unreadable.

**D. Powered by listing (Sarah), if not using `powered-by-names.sh`.** Yotam records the listing before the merge with
`powered-by-names.sh --base-url https://www.sefariastaging.org --record before.json` (project ids and names) and gives Sarah the file.

> Open https://www.sefariastaging.org/api/powered-by and list the id and project_name of every project in the JSON.
> Compare with the file before.json I give you (id to name, recorded before the merge): list every id that is in the
> file and not on the page, and every id on the page and not in the file, with its name. The expected answer is 177
> projects and no id missing.

**F. Library Assistant (Yotam).**

> Open https://www.sefariastaging.org while logged in and open the Library Assistant. Ask "What does Rashi say about
> the first verse of Genesis?" Wait for the full answer. Tell me whether it cites sources with links, open one link and
> confirm it goes to the right text. Read the console and the network log: report any 401, 403 or 5xx, especially on
> /api/knn-search.

## C. Mobile app (manual; the app logs in through `/api/login/`, so the header cannot affect it)

Use a build that points at staging (or skip to the web checks, which cover the pages themselves):

1. Log in with email and password. 2. Register a new account. 3. Tap "Forgot password" and request a reset.
2. Open the reset email on the phone: the link opens in the phone's browser and shows the new-password form.
3. Tap a sefariastaging.org/login link from inside the app: it opens in the browser, logged-out login page shown.

No first-party client frames these pages (checked 2026-11-17: the mobile app uses the native API, the extensions never
frame sefaria.org, the Google Docs add-on and the linker have no login UI), so step 4 and 5 are the only ones that
touch the pages that carry the header.

## E. Logs (Brendan)

`staging-smoke.sh --context $D` sends a request with a known `api_key` value and fails if that value appears in the
web or nginx logs. To look by hand after the merge:

```bash
curl -s -o /dev/null "https://www.sefariastaging.org/api/texts/Genesis.1?api_key=brendan-redaction-check-$(date +%s)"
kubectl --context $D -n default logs -l app=web-sefariastaging -c web --since=5m | grep -c 'brendan-redaction-check'    # 0
kubectl --context $D -n default logs -l app=nginx-sefariastaging --since=5m | grep -c 'brendan-redaction-check'           # 0
kubectl --context $D -n default logs -l app=nginx-sefariastaging --since=5m | grep -c 'api_key=\[REDACTED\]'             # 1 or more
# Counts only: these commands never print a key value, even when redaction is broken.
kubectl --context $D -n default get pods | grep sefariastaging                                                          # Running, restarts unchanged
```

## Penina's Developer Settings (draft for Daniel and Penina to go over)

Drafted 2026-11-17 from the wiki's `projects/api-key-program/developer-settings-as-built`, for the joint merge
(#4042 into #3774). Developer settings stay **off on staging**, so run these on the rehearsal cauldron, which has them
on for every account: `https://www.p1merge.cauldron.sefaria.org` (`DEVELOPER_SETTINGS_ENABLED` and
`DEVELOPER_SETTINGS_STAFF_ONLY` set there only). Log in with your own account or the throwaway one
(`staging-smoke-creds.sh --cauldron p1merge`). Each prompt is pasted into Claude in Chrome as written.

**G1. First-time setup.**

> Open https://www.p1merge.cauldron.sefaria.org/settings/developer (logged in, no developer profile yet). Walk the
> setup: the welcome screen ("Get a free API key", Get started), confirm email if asked (report the step count shown),
> About you (pick "Somewhat technical", leave the rest empty), Your project (name "Claude test project", what you're
> building "Testing", short description "Test", no website), then Create an API key ("Claude test key", limit switch
> off). Report each screen's title and step counter, that "Creating your key…" shows, and that the home lists the
> project with its new key row tinted. Read the console and network log: report any 4xx/5xx or console error.

**G2. Keys: show, hide, copy, limit, delete.**

> On https://www.p1merge.cauldron.sefaria.org/settings/developer, in the project "Claude test project": Show the key
> (the full value appears, starting sfr_), Hide it, then Copy it and say what the page shows ("Copied"). Turn on
> "Limit to website" for the key: since the project has no website, a window asks for one; enter example.com and save;
> report that the switch is on and the project shows example.com ↗. Add a second key, then delete it (report the
> dialog text). Report any error text, console error, or 4xx/5xx in the network log.

**G3. Removing a website that keys are limited to.**

> Edit "Claude test project", empty the Website field and save. A window "Remove the website?" must list the limited
> key. Click "Keep the website" and check nothing changed; then do it again and click "Remove the website": report that
> the website is gone and the key's "Limit to website" switch is off.

**G4. Publish to Powered by Sefaria.**

> Click "Publish project" on "Claude test project" (or the "Publish a project" header link and pick it). Fill the
> required fields (website example.com, kind of project: any one), leave "Show my name" unchecked, submit for review.
> Report the confirmation screen text and that the project's chip now reads "Submitted for review". Do not submit
> anything else.

**G5. Phone width.**

> Resize to 390 px wide. Open /settings/developer: report that the tabs read "Account" and "Developer", that each key
> is a stacked card, and that the header links moved to a Resources section at the bottom. Screenshot each.

**G6. Clean up.**

> Delete "Claude test project" (the dialog lists its keys as stopping immediately; confirm). Report the empty state
> ("No projects or keys yet").

The API itself for these flows is covered by Jest on #4068 (1042 tests pass on the combined tree). Playwright specs for
the new screens are not written yet: the `ui/` specs on this branch target the old settings design.
