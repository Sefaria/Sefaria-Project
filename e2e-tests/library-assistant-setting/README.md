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
| Registration | `reader/tests/register_library_assistant_test.py` | that a brand-new account is given the key |
| **Migration + rollback** | `reader/tests/library_assistant_migration_test.py` | cohort selection, idempotency, the archive, rollback's only-what-we-wrote rule |
| **Browser, all phases** | `library-assistant-setting.spec.ts` | the cohort matrix as a user experiences it, the settings toggle, the promo banner, the enable landing |

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
| LAS-051 | `/enable-library-assistant` turns it on and returns the user where they were |
| LAS-060/061 | The promo never invites a user who opted out, or who already has it |

**Registration is deliberately not driven from here.** `sefaria/views.py` writes
`settings.library_assistant = True` outright when an account is created, so a brand-new
account *is* the `explicit_on` cohort — on in both phases, and already asserted by the
matrix. Registering for real to observe that costs a Salesforce contact, a gravatar fetch
into the profiles bucket, and an account with an id below `SYNTHETIC_USER_ID_FLOOR` that no
cleanup will ever reap, on whichever environment the suite is pointed at. The one line in
the registration view itself is covered by a Django test instead —
`reader/tests/register_library_assistant_test.py`, which drives a real `POST /register` and
asserts on the profile document the view was about to store.

That test cannot let registration persist, for the same id-floor reason: registration takes
its user id from the auto-increment sequence, so the account lands in the low ids where the
restored dump holds real people and where `purge_test_profiles` refuses to delete. It
patches `UserProfile.save` to capture the document instead, and asserts the captured
profile's `_id` is still `None` — so if that interception ever stops covering the write, the
test fails rather than writing into the dump. The captcha, the Salesforce contact and the
gravatar fetch are stubbed out for the same reason.

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
| `explicit_on` *(also: any brand-new account)* | none | `True` | on | on |
| `explicit_off` | none | `False` | off | off |
| `toggler` *(scratch)* | none | `True` | on | on |
| `enable_landing` *(scratch)* | none | `False` | off | off |

`toggler` and `enable_landing` are the only accounts any test writes to, and both are
deliberately **excluded from the LAS-001 / LAS-020 matrices**. Keeping `toggler` in meant
that when LAS-040 failed and left the account off, the next run reported three failures
instead of one — a real bug buried under two false ones. LAS-040 also establishes its own
starting state rather than assuming it.

`enable_landing` exists because LAS-051 turns the assistant **on** for whichever account it
drives. Pointing it at `explicit_off` put a mutation inside the read-only cohort matrix:
three other tests assert that account is off, and under `fullyParallel` they can read it
mid-flip. A scratch account that starts off is the only safe subject.

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

The suite runs under the shared `playwright.config.ts` as the `la-setup` + `la-setting`
projects, pointed at whatever `SANDBOX_URL` says — the same variable every other e2e suite
reads. Put it in `e2e-tests/.env` (or export it) alongside the rest:

```bash
SANDBOX_URL=http://localhost:8000
```

A URL that has to be used exactly as written — `localhost`, an explicit port, or plain
`http` — is used verbatim; a bare domain such as `https://sefariastaging.org` still has
`www.` / `voices.` prefixed onto it as before. The two `la-*` projects appear only once the
cohort manifest exists, so `npx playwright test` on a machine that has never seeded skips
them rather than failing.

`SANDBOX_URL` is shared, so pointing it at a development server points every suite in the
repo there. Prefer `SANDBOX_URL=http://localhost:8000 npx playwright test --project=la-setting`
for a single command over leaving `localhost` sitting in `.env`.

```bash
# 1. Cohort accounts. --reset makes it idempotent. Writes e2e-tests/.la-e2e-users.json,
#    which is also what makes the la-* Playwright projects exist.
python scripts/dev/seed_library_assistant_e2e_users.py --reset

# 2. Python layers.
python -m pytest sefaria/helper/tests/library_assistant_test.py
python -m pytest reader/tests/library_assistant_setting_test.py \
                 reader/tests/enable_library_assistant_test.py \
                 reader/tests/experiments_admin_test.py \
                 reader/tests/library_assistant_migration_test.py

# 3. Browser, Phase 1 (before the migration).
npx playwright test --project=la-setting

# 4. The migration itself. NOTE the ./run wrapper — see §6.
./run scripts/migrations/migrate_experiments_to_library_assistant.py --dry-run
./run scripts/migrations/migrate_experiments_to_library_assistant.py

# 5. Browser again, Phases 2 and 3. Identical file, one env var.
LA_PHASE=post npx playwright test --project=la-setting

# 6. Rollback, then prove Phase 1 behaviour came back.
./run scripts/migrations/rollback_library_assistant_migration.py --dry-run
./run scripts/migrations/rollback_library_assistant_migration.py
npx playwright test --project=la-setting -g "LAS-001|LAS-020"
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
- **Full parallelism by default; cap it if your dev server can't keep up.** `LA_WORKERS=4`
  caps the whole run — it is Playwright's global worker count, not a per-project one, so
  set it only for a run pointed at a development server. `manage.py runserver` renders the
  reader page slowly enough that a laptop's worth of workers can push a page load past the
  90-second budget; nothing here contends on sqlite writes any more.
- **Seeding pushes the sqlite id sequence up — and that is not harmless.** sqlite derives
  the next rowid from `max(rowid) + 1`, so once these explicit 2.09-billion ids exist,
  *every* account subsequently registered on that local database gets an id above
  `SYNTHETIC_USER_ID_FLOOR`. That floor is the only thing distinguishing a test account
  from a real one: `purge_test_profiles` and `build/ci/cleanup_test_data.py` delete
  anything above it without complaint. Real local accounts enrolled into that class are
  deleted silently. On a local dump-restored database that is an annoyance; know it before
  you seed a database you care about, and use `--teardown` when you are done.

  Staging Postgres does **not** behave this way — an INSERT with an explicit id does not
  advance the sequence, so accounts registered there keep their ordinary low ids and stay
  outside the id-floor class.

---

## 4. Running against staging after code freeze

> **Not yet proven remotely.** Every run so far has been against `http://localhost:8000`.
> The remote path below is designed but unexercised — the seeding round trip, the HTTPS
> `www.` host. **Do a rehearsal run against staging before the day it is needed**, so the
> first remote run is not the rollout itself.

Everything above works unchanged against a remote target; only the inputs differ.

```bash
export SANDBOX_URL=https://sefariastaging.org            # www. is prefixed for you
export LA_E2E_PASSWORD=<a password chosen for this run>  # not "password"
```

Staging is Postgres behind several web pods and is not the bottleneck a dev server is, so
leave `LA_WORKERS` unset and let Playwright choose.

### Precheck — do this the day before, not on the day

Each of these fails the run for a reason that looks like a product bug if you meet it cold.

```bash
POD=<web-pod>

# 1. Is the seed script even in the deployed image? It ships on this branch only, and
#    staging deploys from master — until this merges, kubectl exec cannot find it.
kubectl exec $POD -- ls scripts/dev/seed_library_assistant_e2e_users.py

# 2. Remote config. The promo flag gates LAS-060/061 (without it they refuse to pass).
#    chatbot.hide is the dangerous one: set to 1, the client withholds the assistant from
#    everybody, and every "assistant on" assertion fails for a reason that has nothing to
#    do with the setting under test.
curl -s "https://www.sefariastaging.org/api/remote-config" | python -m json.tool
#    → feature.client.show_join_chatbot_banner
#    → feature.client.remote_config_json, whose parsed body must NOT have chatbot.hide == 1
```

**Both were verified on staging on 2026-08-05**: `feature.client.show_join_chatbot_banner`
is **on**, and `chatbot.hide` is **0**. Re-check on the day — they are remote config and can
change under you — but as of that check staging needs no preparation for either.

### The run

1. **Confirm which phase staging is on.** `LA_PHASE=pre` until the migration has been run
   there; `post` afterwards. Getting this wrong shows up as exactly one failing cohort
   (`never_chose`), which is the signal, not a flake.
2. **Seed the cohorts on the target.** The seeding script needs Django and both databases,
   so it runs *in the environment*, not from a laptop. `--manifest-stdout` puts the manifest
   JSON — and only that — on stdout, so the round trip is one command:

   ```bash
   kubectl exec $POD -- env LA_E2E_PASSWORD="$LA_E2E_PASSWORD" \
     python scripts/dev/seed_library_assistant_e2e_users.py --reset --manifest-stdout \
     > e2e-tests/.la-e2e-users.json
   ```

   Note no `-it`: a TTY merges stderr into the captured stream and corrupts the JSON. If the
   pod writes anything to stdout of its own, fall back to letting the script write its file
   and fetching it: `kubectl cp $POD:/app/e2e-tests/.la-e2e-users.json e2e-tests/.la-e2e-users.json`
   (adjust the path to the image's working directory).
3. **Run the browser suite from your laptop** against `SANDBOX_URL`:
   `npx playwright test --project=la-setting`.
4. **Then the migration**, per the Phase 2 runbook on sc-46273: dry-run, check the three
   cohort counts against expected user numbers, run for real, re-run the browser suite with
   `LA_PHASE=post`.
5. **Tear the cohorts down** when the rollout is done:
   `kubectl exec $POD -- python scripts/dev/seed_library_assistant_e2e_users.py --teardown`.

**Do not run the Python layers in a pod.** They already run on every pull request as
*Continuous Testing: PyTest*, so a staging run would re-prove nothing — and Django's test
runner creates and drops a `test_<dbname>` on the Postgres instance the pod is pointed at,
which staging shares. A staging run is the browser suite only; the pod is used for seeding
and teardown and nothing else.

The suite writes only to the accounts it seeds, but it does write to them — **do not point
it at production.**

### What a staging run leaves behind

Reversible is not the same as reversed. Everything below outlives the run. Every account
the suite touches is one it seeded, so `--teardown` reaches all of them; what is left is
the sessions those logins created and the migration's own audit trail.

| Residue | How to clean it |
| --- | --- |
| The seeded cohort accounts (Postgres users, `UserExperimentSettings` rows, Mongo profiles) and the manifest | `--teardown`. This is the only piece that is fully automated. |
| ~7 `django_session` rows (one per logged-in account) | Leave them; they expire on their own. |
| The migration archive collection | Left deliberately — it is the audit record and the input rollback reads. **Rollback restores the prior state except for the archive**; a claim that it "restores prior state exactly" is wrong. Drop it only when you are certain no rollback will be wanted. |

---

## 5. Not automated

| Check | Why not, and how to do it |
| --- | --- |
| Registration writes the setting key — *in the browser* | Driving a real registration costs a CRM contact and an unreapable account wherever it runs (see §1). The state it produces is covered as the `explicit_on` cohort, and the write itself is covered by `reader/tests/register_library_assistant_test.py`. Nothing here is uncovered; it is simply covered a layer down. |
| Cohort counts are plausible for the real userbase | Only a human knows what "right" looks like. `--dry-run` prints the three numbers; compare against the known beta size before running for real. |
| No CRM webhook burst during the migration | Nothing should fire at all — `CHATBOT_OPT_IN_WEBHOOK_DEACTIVATED = True` short-circuits the dispatch, and the migration never calls it. Confirm by grepping the run's logs for `chatbot_opt_in_webhook`. |
| The assistant actually answers a question | Owned by the existing `chrome-assistant` suite against a real backend. This suite deliberately asserts only on whether the widget is *offered*. |
| Hebrew interface | The existing LA suite covers the Hebrew widget via a dedicated `.org.il` account. The setting is language-independent; the toggle's labels are in `account_settings.html` and render from `int-en`/`int-he` spans. |
| Widget open/minimised memory | Out of scope by decision — the external `lc-chatbot` bundle owns it. |

---

## 6. Findings from the first full execution (2026-08-05, local, Phase 1 and Phase 3)

Findings a, b and e were fixed on #3584 (merged). c is a note about existing test machinery.
d was fixed on #3579 on 2026-08-06.

**a. The scripts cannot be run the way their own docstrings say.** *(fixed here.)* Both scripts document
`python scripts/migrations/<name>.py`, which fails immediately with
`ModuleNotFoundError: No module named 'sefaria'` — `sys.path[0]` is the script's directory
and `DJANGO_SETTINGS_MODULE` is unset. The working invocation is the repo's `./run` wrapper.
The Phase 2 runbook on sc-46273 carries the same wrong command.

**b. Rollback's report is badly wrong once two migration runs are archived.** *(fixed here.)*
The data is correct; the summary is not. Measured locally:

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
which someone reaches for rollback a second time. *(Fixed here: one entry per user, latest
wins, ordered by `_id`.)*

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

The banner is behind `feature.client.show_join_chatbot_banner`, so the blast radius depended
on whether that flag was on when Phase 3 shipped.

***Fixed on #3579, 2026-08-06.*** The promo is now gated on `!Sefaria._uid` — logged-out
visitors only. That matches its stated purpose as a "log in to try" acquisition funnel, and
post-migration it is equivalent to "don't ask anyone who has already answered", because
after the flip everyone logged in *has* answered. Re-run against the fixed Phase 3 branch:
**19/19**, identical to Phase 2.

**If you run a fix-carrying branch at `LA_PHASE=pre`, `LAS-061` will fail — correctly.** Its
`pre` branch asserts the promo *is* visible to a logged-in `never_chose` user, which the fix
makes false. Phase 3 only ever runs `post`, so this never arises in practice; read it as the
suite noticing a real difference, not as a flake. Its comment about `never_chose` being the
only cohort where the two suppression rules disagree also no longer describes why the
assertion holds post-migration.

---

**e. Both scripts counted documents, not users** — found only because fixing b removed the
noise that hid it. With the double-count gone, `left alone` came out **negative**:

```
library_assistant unset on 248373 profiles
left alone (user changed it after the migration, or profile gone): -18
```

The cause is in the data, not the code's arithmetic: **15 user ids in the public dump own
more than one `db.profiles` document** (18 extra documents; 248,394 documents against
248,376 distinct ids). `kept += len(batch) - matching` compared a count of ids against a
count of documents, so `matching` could exceed the batch size. The migration had the same
class of error — `written` counted documents, and the archive gained a duplicate row per
extra document.

*(Fixed here: rollback counts `db.profiles.distinct("id", …)`, the migration deduplicates
`pending`. `DuplicateProfileDocumentTest` also pins that every document belonging to a
duplicated id still receives the setting, so those users are not left half-migrated.)*

**The durable rule: any per-user count over `db.profiles` must count distinct ids.** Why
those duplicates exist, and whether production Mongo has them too, is not established — the
counters are correct either way, but it may be worth its own ticket.

## 7. Running the same suite against a different phase

The branches are stacked (Phase 3 sits on Phase 1), so the suite reaches Phase 3 with a
merge. It is deliberately **not** merged into `chore/sc-46274/...`, to keep PR #3579 as the
reviewed change and nothing else:

```bash
git checkout chore/sc-46274/phase-3-remove-legacy-fallback
git merge fix/sc-46273/rollout-readiness-migration-fixes-and-tests
npx webpack --config ./node/webpack.client.js   # or the browser runs the other phase's React
# restart the server, then:
LA_PHASE=post npx playwright test --project=la-setting
```

Undo with `git branch -f chore/sc-46274/phase-3-remove-legacy-fallback origin/chore/sc-46274/phase-3-remove-legacy-fallback`.
