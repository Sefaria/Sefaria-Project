# Library Assistant opt-out — test plan and runbook

Test coverage for [sc-46240](https://app.shortcut.com/sefaria/story/46240): the Library
Assistant switching from opt-in beta to opt-out for every logged-in user.

The change ships in three phases, and **the migration run is the launch** — not the deploy.
That shapes everything here: the risky moment is a script run against production data, and
the thing that must not break is a person who deliberately left the beta.

| Phase | What happens | `LA_PHASE` |
| --- | --- | --- |
| 1 (sc-46272) | Setting ships, behaviourally inert. A profile with no key falls back to the experiments rule. | `pre` |
| 2 (sc-46273) | `migrate_experiments_to_library_assistant.py` runs. Every profile gets an explicit value. | `post` |
| 3 (sc-46274) | The legacy fallback is deleted. Nothing reads it any more, so nothing changes. | `post` |

**One suite runs against all three.** Everything is written against the product rule — "the
assistant is on unless this user turned it off" — never against the mechanism implementing
it. `LA_PHASE` changes the expectation for exactly one cohort: the user who never made a
choice, who is off before the migration and on after it. Phase 3 runs with `post`,
unchanged from Phase 2 — and that is the point. If deleting the fallback were observable,
this suite would go red.

---

## 1. Coverage map

| Layer | Where | Covers |
| --- | --- | --- |
| Decision logic | `sefaria/helper/tests/library_assistant_test.py` | `normalize` coercion, the read rule, `set_enabled` |
| Views & template | `reader/tests/library_assistant_setting_test.py` | `/api/profile`, `/api/profile/sync`, the script-tag gate, the settings page |
| Landing view | `reader/tests/enable_library_assistant_test.py` | `/enable-library-assistant` |
| **Migration + rollback** | `reader/tests/library_assistant_migration_test.py` | cohort selection, idempotency, the archive, rollback's only-what-we-wrote rule |
| **Browser, all phases** | `library-assistant-setting.spec.ts` | the cohort matrix as a user experiences it, the settings toggle, the promo banner, registration, the enable landing |

The migration tests point the scripts' module-level `db` at a scratch database and call the
real `migrate()` / `rollback()`. A developer's local `profiles` collection is a restored
public dump holding ~248,000 real people; nothing here writes to it.

### What the browser suite asserts

| ID | Test |
| --- | --- |
| LAS-001 | Five read-only cohorts × the right answer for the phase (see §2) |
| LAS-010 | A logged-out visitor never gets the assistant |
| LAS-011 | Not loaded on a mobile viewport (server says on, client withholds it) |
| LAS-020 | The toggle exists for every logged-in user and shows the *effective* value |
| LAS-030 | Saving unrelated settings does **not** write the assistant key |
| LAS-031 | Changing the toggle **does** post the key |
| LAS-040 | Turn it off → gone and remembered; turn it back on → returns |
| LAS-050 | A brand-new account has it from its first page view |
| LAS-051 | `/enable-library-assistant` turns it on and returns the user where they were |
| LAS-060/061 | The promo never invites a user who opted out, or who already has it |

LAS-030 matters more than it looks. The migration skips any profile that already carries
the key, so if the settings page posted the toggle unconditionally, anyone who changed an
unrelated preference before launch day would be stamped with their pre-migration value and
silently excluded from the flip. That decision lives in jQuery in
`templates/account_settings.html` and is invisible to the Python tests, so the test asserts
on the posted request body.

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
| `explicit_on` | none | `True` | on | on |
| `explicit_off` | none | `False` | off | off |
| `toggler` *(scratch)* | none | `True` | on | on |

`toggler` is the only account any test writes to, and it is deliberately **excluded from the
LAS-001 / LAS-020 matrices**. Keeping it in meant that when LAS-040 failed and left the
account off, the next run reported three failures instead of one — a real bug buried under
two false ones. LAS-040 also establishes its own starting state rather than assuming it.

`beta_opt_out` is the one that must never break: a person who joined the beta and turned
the assistant off stays off through the flip. `never_chose` is the only row whose answer
changes, and it is the entire user-visible effect of the launch.

Note the trap the cohorts encode: `never_chose` carries `experiments: False` in Mongo
without ever having chosen anything, because `UserProfile` defaults the field and
serializes it on every save. A migration keyed on the Mongo field would read the whole
userbase as deliberate opt-outs. Cohorts come from Postgres.

---

## 3. Running it locally

Assumes Mongo and the Django server are already up (see the repo `CLAUDE.md`).

```bash
# 1. Cohort accounts. --reset makes it idempotent.
python scripts/dev/seed_library_assistant_e2e_users.py --reset

# 2. Python layers.
python -m pytest sefaria/helper/tests/library_assistant_test.py
python -m pytest reader/tests/library_assistant_setting_test.py \
                 reader/tests/enable_library_assistant_test.py \
                 reader/tests/experiments_admin_test.py \
                 reader/tests/library_assistant_migration_test.py

# 3. Browser, Phase 1 (before the migration).
npx playwright test --config=playwright.la.config.ts

# 4. The migration itself. NOTE the ./run wrapper — see §6.
./run scripts/migrations/migrate_experiments_to_library_assistant.py --dry-run
./run scripts/migrations/migrate_experiments_to_library_assistant.py

# 5. Browser again, Phases 2 and 3. Identical file, one env var.
LA_PHASE=post npx playwright test --config=playwright.la.config.ts

# 6. Rollback, then prove Phase 1 behaviour came back.
./run scripts/migrations/rollback_library_assistant_migration.py --dry-run
./run scripts/migrations/rollback_library_assistant_migration.py
npx playwright test --config=playwright.la.config.ts -g "LAS-001|LAS-020"
```

Inspect cohort state at any point with
`python scripts/dev/seed_library_assistant_e2e_users.py --report`.

To exercise LAS-060/061 the promo has to be switched on, and it is a server-side remote
config value. Locally:

```python
from remote_config.models import RemoteConfigEntry, ValueType
from remote_config.keys import SHOW_JOIN_CHATBOT_BANNER
RemoteConfigEntry.objects.update_or_create(
    key=SHOW_JOIN_CHATBOT_BANNER,
    defaults={"raw_value": "1", "value_type": ValueType.BOOL, "is_active": True})
```

`raw_value` must be `"1"` / `"0"` — `parse_value` rejects `"true"`. The cache is
process-local with no TTL, so **restart the server** after changing it. Without the flag the
two tests skip with a message naming the key; they never silently pass.

### Local gotchas

- **`npm run w` dies in a non-TTY shell.** Build the client bundle with
  `npx webpack --config ./node/webpack.client.js`. Rebuild it when switching phase
  branches, or the browser runs the previous phase's React.
- **Two workers, not full parallelism.** `manage.py runserver` over sqlite serializes
  writes; registration is one long `transaction.atomic()` and returns a 500
  "database is locked" under concurrent load. `registerViaApi` retries it. Raise with
  `LA_WORKERS=8` against a cauldron or staging, where Postgres makes it a non-issue.
- **Seeding pushes the sqlite id sequence up.** Explicit ids in the 2.09 billion range mean
  subsequently registered local accounts get ids in that range too. Harmless (still under
  int4 max), and it makes them purgeable by `purge_test_profiles`.

---

## 4. Running against staging after code freeze

Everything above works unchanged against a remote target; only the inputs differ.

```bash
export LA_BASE_URL=https://www.sefariastaging.org
export LA_MOBILE_APP_KEY=<the environment's MOBILE_APP_KEY secret>   # for LAS-050
export LA_WORKERS=6
```

1. **Confirm which phase staging is on.** `LA_PHASE=pre` until the migration has been run
   there; `post` afterwards. Getting this wrong shows up as exactly one failing cohort
   (`never_chose`), which is the signal, not a flake.
2. **Seed the cohorts on the target.** The seeding script needs Django and both databases,
   so it runs *in the environment*, not from a laptop:
   `kubectl exec -it <web-pod> -- python scripts/dev/seed_library_assistant_e2e_users.py --reset`
   then copy the printed manifest to `e2e-tests/.la-e2e-users.json` locally, or re-create it
   by hand — it is just emails, ids and the shared password.
3. **Run the Python layers in the pod**, not locally: they need that environment's
   databases.
4. **Run the browser suite from your laptop** against `LA_BASE_URL`.
5. **Then the migration**, per the Phase 2 runbook on sc-46273: dry-run, check the three
   cohort counts against expected user numbers, run for real, re-run the browser suite with
   `LA_PHASE=post`.

Two things to know before running LAS-050 anywhere shared: registration calls
`CrmMediator().create_crm_user(...)`, so it creates a real contact in that environment's
CRM (the Salesforce **sandbox** for dev/staging), and it leaves a real account behind. Both
are acceptable on staging and neither is acceptable on production — **do not point this
suite at production.**

---

## 5. Not automated

| Check | Why not, and how to do it |
| --- | --- |
| Cohort counts are plausible for the real userbase | Only a human knows what "right" looks like. `--dry-run` prints the three numbers; compare against the known beta size before running for real. |
| No CRM webhook burst during the migration | Nothing should fire at all — `CHATBOT_OPT_IN_WEBHOOK_DEACTIVATED = True` short-circuits the dispatch, and the migration never calls it. Confirm by grepping the run's logs for `chatbot_opt_in_webhook`. |
| The assistant actually answers a question | Owned by the existing `chrome-assistant` suite against a real backend. This suite deliberately asserts only on whether the widget is *offered*. |
| Hebrew interface | The existing LA suite covers the Hebrew widget via a dedicated `.org.il` account. The setting is language-independent; the toggle's labels are in `account_settings.html` and render from `int-en`/`int-he` spans. |
| Widget open/minimised memory | Out of scope by decision — the external `lc-chatbot` bundle owns it. |

---

## 6. Findings from the first full execution (2026-08-05, local, Phase 1 and Phase 3)

**a. The scripts cannot be run the way their own docstrings say.** Both scripts document
`python scripts/migrations/<name>.py`, which fails immediately with
`ModuleNotFoundError: No module named 'sefaria'` — `sys.path[0]` is the script's directory
and `DJANGO_SETTINGS_MODULE` is unset. The working invocation is the repo's `./run` wrapper.
The Phase 2 runbook on sc-46273 carries the same wrong command.

**b. Rollback's report is badly wrong once two migration runs are archived.** The data is
correct; the summary is not. Measured locally:

```
library_assistant unset on 248377 profiles
left alone (user changed it after the migration, or profile gone): 248381
```

The true "left alone" was **2**. The archive holds one entry per profile *per run*, and
`rollback()` with no `--run-id` iterates every entry across every run, so each profile is
processed once per run; on the second pass it no longer matches and is counted as
"left alone". `--dry-run` over-reports the unset count the same way (496,754 against 248,377
real profiles). An operator reading that would conclude a quarter of a million users had
changed their setting and the rollback had failed.

Two runs get archived whenever a launch is rolled back and re-run — the exact situation in
which someone reaches for rollback a second time. Fix: dedupe uids across runs before
counting, or default `--run-id` to the most recent run.

**c. `reader/conftest.py`'s `create_test_user` produces accounts that cannot log in.**
Sefaria authenticates through `emailusernames`, which stores a hash of the address in
`username` and looks accounts up by it. The factory sets a readable username instead, which
is invisible to the auth backend. It has never mattered because every caller uses
`client.force_login`, but anything driving a real login must set
`username=_email_to_username(email)` — as the seeding script now does.

**d. Phase 3 shows the promo banner to users who just opted out.** Reproduced: the whole
suite was run against a Phase 1 checkout pre-migration, and then — the same 19 tests, one
env var different — against Phase 3 post-migration. **Phase 1: 19/19. Phase 3: 18/19, the
one failure being LAS-060.** Every other assertion is identical across the two, which is
the evidence that removing the fallback is otherwise unobservable.

`ReaderApp.jsx:2451` moves the gate from `!Sefaria.in_chatbot_experiment` to
`!this.props.chatbot_enabled`. Before Phase 3 a user who deliberately turned the assistant
off is shielded from the promo, because `in_chatbot_experiment` is true once the key
exists — the user has made a choice, whatever it was. After Phase 3 the only input is
whether the assistant is currently on, so the person who just opted out is exactly the
person the banner targets: *"Enhance Your Learning Experience — Try our AI-powered Library
Assistant"*, with a **Try It** button.

It is immediate and it is on the settings page itself. Turning the toggle off reloads the
page, and the banner is there when it comes back — over the save controls, which is how it
first surfaced (LAS-040 failed with `.siteWideBannerContent … intercepts pointer events`
before the assertion it actually cared about). `goToAccountSettings` now hides the banner so
that only LAS-060 speaks to this.

The banner is behind `feature.client.show_join_chatbot_banner`, so the blast radius depends
on whether that flag is on when Phase 3 ships. Worth deciding before it does: the
pre-Phase-3 rule was "don't ask someone who already answered", and the natural replacement
is to keep suppressing the promo when `settings.library_assistant` is present at all,
rather than only when it is true.

---

## 7. Running the same suite against a different phase

The branches are stacked (Phase 3 sits on Phase 1), so the suite reaches Phase 3 with a
merge. It is deliberately **not** merged into `chore/sc-46274/...`, to keep PR #3579 as the
reviewed change and nothing else:

```bash
git checkout chore/sc-46274/phase-3-remove-legacy-fallback
git merge chore/sc-46273/phase-2-migration-and-e2e-tests
npx webpack --config ./node/webpack.client.js   # or the browser runs the other phase's React
# restart the server, then:
LA_PHASE=post npx playwright test --config=playwright.la.config.ts
```

Undo with `git branch -f chore/sc-46274/phase-3-remove-legacy-fallback origin/chore/sc-46274/phase-3-remove-legacy-fallback`.
