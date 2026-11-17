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
