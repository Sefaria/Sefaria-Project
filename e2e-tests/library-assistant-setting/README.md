# Library Assistant opt-out — test suite

Coverage for the Library Assistant's opt-out switch: **the assistant is on unless this user
turned it off.**

Everything here is written against that product rule, never against the mechanism that
currently implements it. That is what let one suite serve the whole opt-in → opt-out
rollout, and it is what keeps the suite meaningful now the rollout is done.

## `LA_PHASE`

One environment variable, `LA_PHASE=pre|post`, changes the expectation for exactly one
cohort — the user who never made a choice.

| `LA_PHASE` | Meaning | The `never_chose` cohort |
| --- | --- | --- |
| `pre` *(default)* | A profile with no setting key falls back to the legacy experiments rule. | off |
| `post` | Every profile carries an explicit value. | on |

Freshly seeded cohorts are always in the `pre` state — the seed script deliberately leaves
the key absent on three of them — so `pre` is the mode an ordinary run uses. `post` is for a
run taken *after* the migration script has been applied to the seeded accounts, which is how
the suite proved that removing the legacy fallback is unobservable.

> **The legacy fallback is scheduled for removal.** When it goes, an absent key reads as
> off, and the three cohorts that rely on the fallback (`beta_opt_in`, `beta_opt_out`,
> `never_chose`) no longer describe anything real. That removal owns updating them and
> retiring `LA_PHASE`; see the note in §7.

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
| LAS-001…005 | Five read-only cohorts × the right answer for the phase (§2) |
| LAS-010 | A logged-out visitor never gets the assistant |
| LAS-011 | Not loaded on a mobile viewport (server says on, client withholds it) |
| LAS-020…024 | The toggle exists for every logged-in user and shows the *effective* value |
| LAS-030 | Saving unrelated settings does **not** write the assistant key |
| LAS-031 | Changing the toggle **does** post the key |
| LAS-040 | Turn it off → gone and remembered; turn it back on → returns |
| LAS-051 | `/enable-library-assistant` turns it on and returns the user where they were |
| LAS-060/061 | The promo never invites a user who opted out, or who already has it |

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

| Cohort | Postgres row | `settings.library_assistant` | `pre` | `post` |
| --- | --- | --- | --- | --- |
| `beta_opt_in` | `experiments=True` | absent | on | on |
| `beta_opt_out` | `experiments=False` | absent | **off** | **off** |
| `never_chose` | none | absent | off | **on** |
| `explicit_on` *(also: any brand-new account)* | none | `True` | on | on |
| `explicit_off` | none | `False` | off | off |
| `toggler` *(scratch)* | none | `True` | on | on |
| `enable_landing` *(scratch)* | none | `False` | off | off |

`beta_opt_out` is the one that must never break: a person who joined the beta and turned the
assistant off stays off. `never_chose` is the only row whose answer depends on the phase.

Note the trap the cohorts encode: `never_chose` carries `experiments: False` in Mongo without
ever having chosen anything, because `UserProfile` defaults the field and serializes it on
every save. Any rule keyed on the Mongo field would read the whole userbase as deliberate
opt-outs. Enrollment comes from Postgres.

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

### The promo banner (LAS-060/061)

Both tests depend on a server-side remote-config value, which a browser test cannot set.
Without it they skip with a message naming the key; they never silently pass. Locally:

```python
from remote_config.models import RemoteConfigEntry, ValueType
from remote_config.keys import SHOW_JOIN_CHATBOT_BANNER
RemoteConfigEntry.objects.update_or_create(
    key=SHOW_JOIN_CHATBOT_BANNER,
    defaults={"raw_value": "1", "value_type": ValueType.BOOL, "is_active": True})
```

`raw_value` must be `"1"` / `"0"` — `parse_value` rejects `"true"`. The cache is
process-local with no TTL, so **restart the server** after changing it. Set
`LA_REQUIRE_PROMO=1` to make the two tests fail rather than skip when the promo is off — use
it when the promo behaviour is what you are actually there to verify.

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
and so does a cross-domain redirect — so the suite once reported all seven cohorts logged in
and then failed 13 of 19 tests as though the product had regressed. It now asserts that the
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
  ones. LAS-040 also establishes its own starting state rather than assuming it.
- `enable_landing` exists because LAS-051 turns the assistant **on** for whichever account it
  drives. Pointing it at `explicit_off` put a mutation inside the read-only matrix, where
  three other tests assert that account is off and, under `fullyParallel`, can read it
  mid-flip.

> **Generalisable: a test that mutates shared state must own an account nothing else reads,
> and must set up its own starting state rather than inheriting the previous run's.**

### LAS-030 is doing more than it looks

It asserts on the *posted request body* — that saving an unrelated setting does not include
the assistant key. That decision lives in jQuery in `templates/account_settings.html` and is
invisible to every Python test. It mattered during the rollout because the migration skipped
any profile that already carried the key, so a settings page that posted the toggle
unconditionally would have stamped anyone who changed an unrelated preference with their
pre-flip value. It still matters: it is the only assertion that the page sends what it means
to send.

---

## 7. What the legacy-fallback removal owns

The removal of the legacy experiments fallback lands after this suite. When it does:

- `beta_opt_in`, `beta_opt_out` and `never_chose` stop describing anything — all three have
  no setting key, and an absent key will read as off. Their `expected_*` values in
  `scripts/dev/seed_library_assistant_e2e_users.py` need updating or the cohorts need
  retiring.
- `LA_PHASE` has one remaining meaning (`post`) and should be removed along with the
  `expected_pre` / `expected_post` split in `harness.ts`.
- `LAS-061`'s `pre` branch asserts the promo *is* visible to a logged-in `never_chose` user.
  Any change to the promo gate makes that false; it is a real difference, not a flake.

Nothing in this suite needs changing before then — every assertion describes code that is
live today.

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
