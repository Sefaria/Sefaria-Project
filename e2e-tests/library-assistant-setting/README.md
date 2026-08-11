# Library Assistant opt-out — test suite

Coverage for the Library Assistant's opt-out switch: **the assistant is on unless this user
turned it off.**

Everything here is written against that product rule, never against the mechanism that
currently implements it. That is what let one suite serve the whole opt-in → opt-out
rollout, and it is what keeps the suite meaningful now the rollout is done.

A user's answer comes from one place: `settings.library_assistant` on their profile. Every
account carries it — registration writes it for new accounts, and the rollout migration
backfilled the rest — so there is one world to test, not a before and an after.

> **One assertion runs ahead of `master`.** LAS-062 describes the promo banner's gate
> *after* the legacy-fallback removal, where the invitation goes to everyone the assistant
> is not running for. Against a build that still gates the promo on whether the user has
> made a choice, that test fails and nothing else does. See §7.

---

## 1. Coverage map

| Layer | Where | Covers |
| --- | --- | --- |
| Decision logic | `sefaria/helper/tests/library_assistant_test.py` | `normalize` coercion, the read rule, `set_enabled` |
| Views & template | `reader/tests/library_assistant_setting_test.py` | `/api/profile`, `/api/profile/sync`, the script-tag gate, the settings page |
| Landing view | `reader/tests/enable_library_assistant_test.py` | `/enable-library-assistant` |
| Registration | `reader/tests/register_library_assistant_test.py` | that a brand-new account is given the key |
| Browser | `library-assistant-setting.spec.ts` | the cohort matrix as a user experiences it, the settings toggle, the promo banner, the enable landing |

### What the browser suite asserts

| ID | Test |
| --- | --- |
| LAS-001/002 | The two read-only cohorts × the right answer (§2) |
| LAS-010 | A logged-out visitor never gets the assistant |
| LAS-011 | Not loaded on a mobile viewport (server says on, client withholds it) |
| LAS-020/021 | The toggle exists for every logged-in user and shows the *effective* value |
| LAS-030 | Saving unrelated settings does **not** write the assistant key |
| LAS-031 | Changing the toggle **does** post the key |
| LAS-040 | Turn it off → gone and remembered; turn it back on → returns |
| LAS-051 | `/enable-library-assistant` turns it on and returns the user where they were |
| LAS-060 | The promo never invites a user the assistant is already running for |
| LAS-061 | A logged-out visitor *is* invited, through the enable landing |
| LAS-062 | So is a user who turned it off — the promo audience is "assistant off" (§7) |

**Registration is deliberately not driven from the browser.** `sefaria/views.py` writes
`settings.library_assistant = True` outright when an account is created, so a brand-new
account *is* the `explicit_on` cohort — already asserted by the matrix. Registering for real
costs a Salesforce contact, a gravatar fetch into the profiles bucket, and an account with
an id below `SYNTHETIC_USER_ID_FLOOR` that no cleanup will ever reap, on whichever
environment the suite is pointed at.

The write itself is covered a layer down by `reader/tests/register_library_assistant_test.py`,
which drives a real `POST /register` and asserts on the profile document the view was about
to store. That test cannot let registration persist for the same id-floor reason:
registration takes its user id from the auto-increment sequence, so the account lands in the
low ids where a restored public dump holds real people and where `purge_test_profiles`
refuses to delete. It patches `UserProfile.save` to capture the document instead, and asserts
the captured profile's `_id` is still `None` — so if that interception ever stops covering
the write, the test fails rather than writing into the dump. The captcha, the Salesforce
contact and the gravatar fetch are stubbed out for the same reason.

**The transferable technique: when a flow assigns its own low user id, the
`SYNTHETIC_USER_ID_FLOOR` factory cannot protect you — intercept the write and assert on the
document instead.**

---

## 2. The cohorts

`scripts/dev/seed_library_assistant_e2e_users.py` creates one account per cohort. They have
deterministic ids above `reader.conftest.SYNTHETIC_USER_ID_FLOOR`, so re-seeding reuses the
same accounts and no real profile document can ever be in range.

| Cohort | `settings.library_assistant` | Assistant |
| --- | --- | --- |
| `explicit_on` *(also: any brand-new account)* | `True` | on |
| `explicit_off` | `False` | **off** |
| `toggler` *(scratch)* | `True` | on |
| `enable_landing` *(scratch)* | `False` | off |

`explicit_off` is the one that must never break: a person who turned the assistant off stays
off, through any later change to how the setting is read.

Two cohorts the suite used to seed — a beta opt-in, a beta opt-out — carried no setting key
at all and were answered by the legacy experiments whitelist. That rule is gone: an absent
key reads as off, so those accounts described nothing. They are still torn down (their ids
are listed in the seed script) so an environment seeded by an older revision is left clean.

Inspect cohort state at any point with
`python scripts/dev/seed_library_assistant_e2e_users.py --report`.

---

## 3. Running it

Assumes Mongo and the Django server are already up (see the repo `CLAUDE.md`).

The suite runs under the shared `playwright.config.ts` as the `la-setup` + `la-setting`
projects, pointed at whatever `SANDBOX_URL` says — the same variable every other e2e suite
reads. The two `la-*` projects appear only once the cohort manifest exists, so
`npx playwright test` on a machine that has never seeded skips them rather than failing.

`SANDBOX_URL` is shared, so pointing it at a development server points *every* suite in the
repo there. Prefer a single command over leaving `localhost` sitting in `.env`.

```bash
# 1. Cohort accounts. --reset makes it idempotent. Writes e2e-tests/.la-e2e-users.json,
#    which is also what makes the la-* Playwright projects exist.
python scripts/dev/seed_library_assistant_e2e_users.py --reset

# 2. Python layers.
python -m pytest sefaria/helper/tests/library_assistant_test.py \
                 reader/tests/library_assistant_setting_test.py \
                 reader/tests/enable_library_assistant_test.py \
                 reader/tests/register_library_assistant_test.py

# 3. Browser.
SANDBOX_URL=http://localhost:8000 npx playwright test --project=la-setting

# 4. Remove the cohort accounts and the manifest when you are done.
python scripts/dev/seed_library_assistant_e2e_users.py --teardown
```

A URL that has to be used exactly as written — `localhost`, an explicit port, or plain
`http` — is used verbatim; a bare domain such as `https://sefariastaging.org` still has
`www.` / `voices.` prefixed onto it (see §8).

### The promo banner (LAS-060…062)

All three tests depend on a server-side remote-config value, which a browser test cannot
set. Without it they skip with a message naming the key; they never silently pass. Locally:

```python
from remote_config.models import RemoteConfigEntry, ValueType
from remote_config.keys import SHOW_JOIN_CHATBOT_BANNER
RemoteConfigEntry.objects.update_or_create(
    key=SHOW_JOIN_CHATBOT_BANNER,
    defaults={"raw_value": "1", "value_type": ValueType.BOOL, "is_active": True})
```

`raw_value` must be `"1"` / `"0"` — `parse_value` rejects `"true"`. The cache is
process-local with no TTL, so **restart the server** after changing it. Set
`LA_REQUIRE_PROMO=1` to make them fail rather than skip when the promo is off — use it when
the promo behaviour is what you are actually there to verify.

The promo keeps its dismissal history in `localStorage` under `promo_backoff_*`, which the
suite's overlay suppression deliberately leaves alone — it neutralises only `modal_*` and
`banner_*`. Each promo test builds its own context and no test ever clicks "Maybe later", so
there is never any dismissal state to hide the banner, which is what makes "the banner is
visible" a fair assertion rather than a coin flip.

### Local gotchas

- **`npm run w` dies in a non-TTY shell.** Build the client bundle with
  `npx webpack --config ./node/webpack.client.js`.
- **Full parallelism by default; cap it if your dev server can't keep up.** `LA_WORKERS=4`
  caps the whole run — it is Playwright's global worker count, not a per-project one, so set
  it only for a run pointed at a development server. `manage.py runserver` renders the reader
  page slowly enough that a laptop's worth of workers can push a page load past the
  90-second budget.
- **Seeding pushes the sqlite id sequence up — and that is not harmless.** sqlite derives
  the next rowid from `max(rowid) + 1`, so once these explicit 2.09-billion ids exist,
  *every* account subsequently registered on that local database gets an id above
  `SYNTHETIC_USER_ID_FLOOR`. That floor is the only thing distinguishing a test account from
  a real one: `purge_test_profiles` and `build/ci/cleanup_test_data.py` delete anything above
  it without complaint. Know it before you seed a database you care about, and use
  `--teardown` when you are done. Postgres does **not** behave this way — an INSERT with an
  explicit id does not advance the sequence.
- **`reader/conftest.py`'s `create_test_user` produces accounts that cannot log in.**
  Sefaria authenticates through `emailusernames`, which stores a hash of the address in
  `username` and looks accounts up by it. The factory sets a readable username instead, which
  is invisible to the auth backend. It has never mattered because every other caller uses
  `client.force_login`, but anything driving a real login must set
  `username=_email_to_username(email)` — as the seeding script does.

---

## 4. Running against a deployed environment

Everything above works unchanged against a remote target; only the inputs differ.

```bash
export SANDBOX_URL=https://<sandbox-domain>      # www. is prefixed for you
export LA_E2E_PASSWORD=<a password for this run> # not the default
```

**The suite writes to the accounts it seeds — do not point it at production.** `harness.ts`
refuses a live-site hostname outright rather than relying on whoever runs it to have
overridden `SANDBOX_URL`.

The seeding script needs Django and both databases, so it runs **in** the target
environment, not from a laptop; fetch the manifest it writes and run the browser suite
locally against `SANDBOX_URL`. Pass the password through a file rather than `env VAR=` in the
argv — exec arguments are recorded in cloud audit logs and in your shell history.

Cap the workers against a single-replica environment: `LA_WORKERS=2` is a safe default. An
uncapped Playwright run from a laptop can drive one web pod hard enough that the CDN starts
returning **504 Gateway time-out** pages, which surface as ordinary assertion failures.

**Do not run the Python layers in a pod.** They already run on every pull request as
*Continuous Testing: PyTest*, and Django's test runner creates and drops a `test_<dbname>` on
whatever Postgres instance the pod points at — which shared environments share.

Tear the cohorts down when you are finished:
`python scripts/dev/seed_library_assistant_e2e_users.py --teardown`. That reaches every
account the suite touches. The `django_session` rows those logins created are left behind and
expire on their own.

---

## 5. Not automated

| Check | Why not, and how to do it |
| --- | --- |
| Registration writes the setting key — *in the browser* | Driving a real registration costs a CRM contact and an unreapable account wherever it runs (§1). Covered a layer down instead. |
| The assistant actually answers a question | Owned by the existing `chrome-assistant` suite against a real backend. This suite deliberately asserts only on whether the widget is *offered*. |
| Hebrew interface | The existing LA suite covers the Hebrew widget via a dedicated `.org.il` account. The setting is language-independent; the toggle's labels render from `int-en`/`int-he` spans in `account_settings.html`. |
| Widget open/minimised memory | Out of scope by decision — the external `lc-chatbot` bundle owns it. |

---

## 6. How the suite is built

Three committed files, plus two Playwright projects defined in the shared
`playwright.config.ts`.

| File | Role |
| --- | --- |
| `harness.ts` | Everything that is not an assertion: cohort loading, login, the oracle, navigation, the settings-page helpers |
| `auth.setup.ts` | The `la-setup` project. Logs in every seeded cohort once and writes `.auth/<cohort>.json` |
| `library-assistant-setting.spec.ts` | The `la-setting` project. Assertions only |
| `.la-e2e-users.json` | The cohort manifest, written by the seed script. **Its existence is what makes the two projects exist.** Untracked — it holds credentials |

`la-setting` depends on `la-setup`, so one login per cohort happens before any worker starts
and the workers only ever read the storage-state files. This mirrors what `global-setup.ts`
does for the shared QA accounts, but deliberately does not reuse it — see §8.

### The oracle is the part that matters

`expectAssistant(page, on, because)` in `harness.ts` is the single place that answers "does
this user have the Library Assistant?", and every cohort test goes through it. It checks
**three** things, and the third is the one that was missing:

1. `Sefaria.chatbot_enabled` — the reader view's prop.
2. The presence of the `<lc-chatbot>` element — also from the reader view's props.
3. **The chatbot bundle's `<script>` tag.**

(1) and (2) come from the same place, so together they are one signal, not two. Whether the
assistant actually *loads* is decided independently: `chatbot_user_token` in
`sefaria/system/context_processors.py` makes its own `is_enabled_for_user()` call, and only
then does `base.html` emit the script tag. Without that tag, `<lc-chatbot>` is an un-upgraded
custom element — inert DOM that looks exactly like a working one to a test asserting on
presence. So the entire server-side gate could regress with every test green. And because
`local_settings.py` sets `CHATBOT_USE_LOCAL_SCRIPT = True`, pointing the bundle at a Vite dev
server, local runs were very likely taken against a dead element.

**The script-tag assertion is what closes this**, and it asserts in both directions — the tag
must be absent for a user who should not have the assistant. It passes with Vite **down**,
because the tag is emitted server-side: the assertion tests the gate, not the fetch.

> **The generalisable lesson: when a feature has two independent enablement calls, a test
> that exercises only one of them is not testing the feature.** Worth applying to anything
> else gated in both `context_processors` and the reader props.

### `logIn` verifies the login actually happened

An earlier version waited only for the URL to leave `/login`. A failed submit satisfies that,
and so does a cross-domain redirect — so the suite once reported every cohort logged in and
then failed most of its tests as though the product had regressed. It now asserts that the
browser is still on the expected origin **and** that `Sefaria._uid` is present, which the
server renders into the page props only for an authenticated request. (`/api/profile` has no
GET route and 404s, so it is not the check to reach for despite the name.)

It also pins the `interfaceLang` cookie. Sefaria serves each interface language from its own
domain and `LanguageSettingsMiddleware` redirects when the detected language disagrees with
the domain — so a run from Israel against a `.org` host is bounced to the `-il` host, the
session cookie is set *there*, and every later request comes back anonymous while the final
URL looks correct. Detection reads the cookie before `cf-ipcountry`, so pinning it to the
language the target domain already serves stops the redirect firing. Note that `curl` cannot
reproduce the fault: the middleware exempts curl and crawlers by user-agent, so a curl smoke
test of the same login passes while the browser fails.

> **The generalisable rule: an authentication helper must assert authentication, not
> navigation.** A suite that cannot tell "the login failed" from "the feature is broken" will
> send you hunting a product bug that does not exist.

### Two cohorts exist only to be written to

`toggler` and `enable_landing` are scratch accounts, excluded from the LAS-001 / LAS-020
matrices. This is not tidiness, it is a real failure this design fixed:

- Keeping `toggler` in the matrix meant that when LAS-040 failed and left the account off,
  the *next* run reported three failures instead of one — a real bug buried under two false
  ones. LAS-040 also establishes its own starting state rather than assuming it. LAS-030 and
  LAS-031 drive the same account, but fulfil the save request instead of letting it through,
  so they never write to it.
- `enable_landing` exists because LAS-051 turns the assistant **on** for whichever account it
  drives. Pointing it at `explicit_off` put a mutation inside the read-only matrix, where
  other tests assert that account is off and, under `fullyParallel`, can read it mid-flip.

> **Generalisable: a test that mutates shared state must own an account nothing else reads,
> and must set up its own starting state rather than inheriting the previous run's.**

### LAS-030 is doing more than it looks

It asserts on the *posted request body* — that saving an unrelated setting does not include
the assistant key. That decision lives in jQuery in `templates/account_settings.html` and is
invisible to every Python test. Without it, a user who changed their email preference in one
tab would silently stamp the assistant value that tab happened to render over whatever they
had since chosen elsewhere. It is the only assertion that the page sends what it means to
send.

---

## 7. The promo banner, and the one assertion that runs ahead

The assistant's own behaviour is phase-free: it reads one setting key, and every account has
one. The promo banner is not, because the rule for *who gets invited* changed with the
legacy-fallback removal.

| Viewer | Gate before the removal (`!in_chatbot_experiment`) | Gate after (`!chatbot_enabled`) |
| --- | --- | --- |
| Logged out | invited | invited |
| Assistant on | not invited | not invited |
| Assistant **off** | not invited | **invited** |

The first two rows are the same in both worlds, and they are what LAS-060 and LAS-061
assert. The third genuinely flips: the old gate suppressed the promo for anyone who had
*made a choice*, the new one suppresses it only for people the assistant is already running
for. Turning the assistant off no longer removes you from the audience — how often the
invitation may come back is the banner's own backoff schedule, not this setting.

**LAS-062 asserts the right-hand column.** It is the only test here that describes behaviour
a pre-removal build does not have, so a manual run against such a build fails that one test
and nothing else. That is the intended trade: the end state is the thing worth protecting,
and the window in which it is wrong is short.

If you are looking at a failing LAS-062 on a build that predates the removal, that is this
note, not a regression.

---

## 8. Changes this suite made to shared e2e infrastructure

Three changes are **not** scoped to the Library Assistant and affect every Playwright suite
in the repo. If something unrelated starts behaving differently, look here first.

**1. `e2e-tests/moduleUrls.ts` is the single derivation of module URLs**, used by
`playwright.config.ts`, `e2e-tests/constants.ts` and this suite. Those two files each rebuilt
the URLs from `SANDBOX_URL` independently, and `constants.ts` carried a "keep in sync with
playwright.config.ts" comment that nothing enforced.

A **loopback** host is now used verbatim; every other shape keeps the old
`https://www.<domain>` assembly. Assembling `https://www.` onto `localhost:8000` yields a
hostname that cannot resolve, which was the only reason this suite originally needed its own
config file. Verified byte-identical for a deployed sandbox, a bare domain, CI's in-cluster
host, and unset.

**2. `.env` no longer overrides the shell.** The merge in `playwright.config.ts` was
`{...process.env, ...env}`, so exported variables were silently ignored. Since `.env` holds
`https://www.sefaria.org`, `SANDBOX_URL=http://localhost:8000 npx playwright test` would have
run **against production**. Now the file supplies defaults and the environment wins; CI skips
dotenv entirely, so this is a local-runs-only change.

**3. `global-setup.ts` returns early when only `la-*` projects are selected.** This suite
reads none of the shared `auth_*.json` files, and against a dev server the four QA logins are
minutes of guaranteed failure. Written so that if `config.projects` isn't narrowed in this
Playwright version, the guard is simply false and today's behaviour stands.

**Expected noise:** when you run this suite via the full config, `global-setup` still logs
failures for `testUser` / `testAdminUser` and skips `testLAUser` / `testHeLAUser` for missing
env vars. Unrelated — the `la-*` projects authenticate through their own `auth.setup.ts`.
