# Reader Next: how the launch plan runs in parallel

Written 2026-11-10. Companion to `LAUNCH_PLAN.md` (task IDs `T-…` refer to it). Owner: Akiva Berger.

**Owner's rule for this run (2026-11-10):** all work lands on the `reader-next` branch in this worktree. No PRs to `master`, no
per-lane PRs. A lane's work enters `reader-next` only after Playwright and the full test suite pass on the merged result. The one
existing PR (#3788, draft) stays the only PR. This **amends LAUNCH_PLAN D-2 and workstream B**: the Django changes stay on
`reader-next` instead of going to `master` as small PRs; `reader-next` → `master` is one later merge, out of scope here.

---

## 1. Shape

- **One integrator** (the orchestrating session in `/Users/akiva/Sefaria/dev/Sefaria-Project-reader-next`) owns `reader-next`. Only the
  integrator merges, commits generated files and pushes. Lanes never touch `reader-next` directly.
- **Lanes** are agents, each in its own worktree `~/Sefaria/dev/rn-<lane>` on branch `rn/<wave><lane>` cut from `reader-next` at the
  start of its wave. A lane owns a set of paths (§4); it may read anything.
- **Three waves.** Wave 0 is the integrator alone. Wave 1 is L0 work (6 lanes). Wave 2 is L1 work (6 lanes). Wave 3 is verification.
  A wave starts from the `reader-next` produced by the previous wave, so lanes never build on each other's unmerged work.
- **Width.** At most 6 lanes at once, and at most 3 Playwright runs at once on this machine (each needs a dev server, the cassette
  proxy and Chromium). The integrator queues e2e runs.

---

## 2. The gate (what "passes" means)

A lane hands back only when all of this is green **in its own worktree, after merging the current `reader-next` into the lane**:

| Check | Command (from `reader-next/` unless noted) |
|---|---|
| Types | `npx tsc --noEmit` |
| Unit + architecture | `npm test` |
| Atlas IDs | `npm run features:coverage -- --unknown` |
| Stories | `npm run test:stories`, `npm run test:stories:hebrew`, `npm run test:stories:dark` (a gate once #3950 is in) |
| Playwright | `E2E_PORT=<p> E2E_AUTH_PORT=<p+12> E2E_API_PORT=<p+20> npx playwright test --project=desktop` (full suite, not only new specs) |
| Python (lanes that touch Django) | repo root: `SEFARIA_TEST_MONGO=1 .venv312/bin/python -m pytest <touched test files> reader/tests sefaria/helper/tests` against a local mongod on 27018. Test files are named `*_test.py` |
| Chart (lanes that touch `helm-chart/`) | `helm template` in `legacy`, `reader`, `optin`; `nginx -t` on the rendered config |
| Review | an independent reviewer agent reads the lane's diff (`/code-review` level high) with no access to the lane's reasoning; findings fixed or answered |

Ports per lane: A 3200, B 3240, C 3280, D 3320, E 3360, F 3400 (wave 2 reuses them). Never port 3100: Playwright reuses any server
already listening there, even from another checkout.

The lane reports: branch, commit list, the gate table with each command's last lines, atlas apply script name, and anything it could
not do. Code reading is not verification; every claim needs a command and its output.

**Rework cap.** If the integrator's post-merge gate or the reviewer sends a lane back twice for the same failure, the lane stops and
the integrator brings it to the owner with both failure notes.

---

## 3. Integration protocol (integrator)

For each finished lane, one at a time, in the order the wave lists:

1. In the main worktree: `git merge --no-ff rn/<lane>`. Conflicts in owned paths go back to the lane; conflicts in shared files (§5)
   the integrator resolves.
2. Run the lane's atlas apply script (§5), regenerate `FEATURES.md` and `routeTree.gen.ts`, commit as `chore(atlas): …`.
3. Run the full gate (§2) on `reader-next`. Red → `git reset --hard` to before the merge (nothing is pushed yet) and send the failure
   to the lane.
4. Green → next lane. The next lanes in the queue merge the new `reader-next` into their branch before their own gate.

End of wave: push `reader-next` to `origin` (owner's go-ahead the first time), check CI on #3788 for **the head commit**. A draft PR
skips PyTest and the sandbox job, so the Python gate is the local one until #3788 is marked ready; confirm with
`gh run view <id> --json jobs` that a job ran, never only that the check is green.

---

## 4. Lanes

### Wave 0 — integrator alone (½–1 day)

1. T-A01: finish and commit the uncommitted ref-resolution work (`src/lib/text/queries.ts`, `plan.test.ts`, `queries.test.ts`).
2. Commit `LAUNCH_PLAN.md`, this file, and the `DECISIONS.md` rows (plus a row for this amendment).
3. T-A02: merge `fix/reader-next-dark-a11y` and `fix/reader-next-lint` into `reader-next` (locally; #3950 and #3981 then show as
   merged on push). Fix #3981's failing CI first.
4. T-A03 (part): merge `origin/master` (2 commits behind).
5. Provision for lanes: local mongod on 27018 (`mongod --dbpath … --port 27018`), `.venv312` checked, one `npm ci` whose
   `node_modules` each lane worktree copies (`cp -c`, APFS clone) so lanes need no network for installs; `npx playwright install chromium`.
6. **Baseline:** full gate on `reader-next`. Any red test is fixed now or quarantined with a dated note; lanes must not inherit red.
7. Create the six wave-1 worktrees.

### Wave 1 — L0 (target: about a week)

| Lane | Tasks | Owns (writes only here) | Notes |
|---|---|---|---|
| **A Platform** | T-C01, T-C02, T-C03 (nginx and chart half), T-C04, T-C05, T-C06, T-C07, T-C08, T-A04, T-H04 | `helm-chart/**`, `build/**`, `.github/workflows/**`, `.dockerignore`, `reader-next/scripts/api-cassette.mjs`, `reader-next/Dockerfile`, `reader-next/server/index.mjs`, `reader-next/docs/DEPLOYMENT.md` | Flip `nodejs.mode` default to `legacy` first. T-C04 generates the nginx map from `DJANGO_PREFIXES` (reads `django-paths.ts`, does not edit it). Load tests run against a cauldron only with the owner's go-ahead |
| **B Django** | T-B01…T-B07, T-B05 staff-only audience key, the server half of T-D05 (an endpoint the new reader calls to switch back) | `reader/**`, `sefaria/**` (not `sefaria/model` unless needed), `sites/**`, `templates/**`, `remote_config/**`, `*_test.py` | Gate includes pytest. Django answers must send every key (null when unset). Ask Noah/Lev T-B01's question in the report, don't block on it |
| **C Observability** | T-D01, T-D02 (Node side), T-D03, T-D04, T-D05 (client), T-C03 (client half: remote-config kill switch) | `reader-next/src/lib/analytics/**`, `reader-next/src/lib/monitoring/**` (new), `reader-next/src/features/shell/**` except header markup, `reader-next/e2e/analytics*.spec.ts` | D-8: Datadog RUM if the org's plan allows (check with the Datadog MCP, read-only), else a beacon endpoint asked of lane B through the integrator. New npm dependency only with the integrator's OK (shared lockfile) |
| **D Data & column** | T-E01, T-E02, T-E03, T-E04, T-E08, T-H02 (SB-02, SB-03), T-H03 | `reader-next/src/lib/cache/**`, `src/lib/text/**`, `src/lib/ref/**`, `src/lib/connections/**`, `src/lib/workspace/**`, `src/features/reader/**`, `src/routes/$.tsx`, matching e2e specs, `scripts/ref-corpus*` | One lane on purpose: cache policy, sidebar loading, the text column, scroll and history are one coupled unit. Run `e2e/smoothness.spec.ts` on a production build too |
| **E Server routing** | T-E05, T-E07, T-F01, T-F02, T-F03, T-F26, T-F28 | `reader-next/src/start.ts`, `src/server/**`, `src/lib/routing/**`, `scripts/exits-crawl.mjs`, the allowlist file, `e2e/routing*.spec.ts`, `e2e/exits*.spec.ts`; link edits in `src/ui/**` limited to href rewrites | Owns `django-paths.ts` in wave 1. T-F01's crawl runs signed in and out; its allowlist starts as today's exits and shrinks each wave |
| **F Atlas & docs** | T-A07 (status for all 514 unstatused entries), T-A06, wiki corrections | writes no code: one apply script `apply_2026_11_10_triage.py`, `reader-next/docs/*.md` except DEPLOYMENT.md, the wiki pages under `projects/reader-next/` | Read-only on code. Output feeds wave 2's lane G task lists. Publishes the wiki with `scripts/wiki-sync.sh publish` |

Merge order: F, B, A, E, D, C (smallest blast radius first; D and C touch the most-tested code). T-C09 (staging, then production
staff opt-in) and T-E06 (the two first real writes) need the owner and run after wave 1 merges, not in a lane.

### Wave 2 — L1 (target: two to three weeks)

> **2026-11-10, owner: do not touch Voices at all.** Lane V below is cancelled. No lane edits Voices pages, the Voices host logic
> (`isVoicesHost`, the Voices half of `LIBRARY_ONLY_PREFIXES`) or the Voices server block in nginx. Links to sheets, sheets-with-ref,
> collections and profiles are accepted exits. Wave 2 runs five lanes: P, S, GR, GS, H.

| Lane | Tasks | Owns | Notes |
|---|---|---|---|
| ~~**V Voices**~~ CANCELLED | ~~T-F10…T-F16~~ | `src/features/sheets/**`, `features/collections/**`, `features/profile/**`, `src/lib/sheets/**` (new), `src/routes/sheets*`, `collections*`, `profile*`, `sheets-with-ref*`; the Voices server block in `helm-chart/sefaria/conf/nginx.template.conf.tpl` (lane A is done by then); the module route table in `src/lib/routing/**` | The long pole. T-F10 first and merged on its own (mid-wave merge) so other lanes see the module model. Parity script on 20 sheets, desktop and phone UA |
| **P Pages** | T-F20…T-F25, T-F27 | `src/features/notifications/**`, `features/torahtracker/**`, `features/updates/**`, matching routes and specs | Header link for notifications: a small edit in `SiteHeader.tsx`, coordinated with lane GS through the integrator |
| **S Static** | T-F31, T-F32 | `src/features/static-page/**`, `src/routes/` for the static paths, the content-only template flag if lane B left work | Needs T-B06 merged |
| **GR Polish, reader** | T-G01 for reader-shell, text-display, text-types, connections, versions; T-G04, T-G05 | `src/features/reader/**`, `src/ui/` components used only by the reader and sidebar | Takes over lane D's paths |
| **GS Polish, shell & library** | T-G01 for library-nav, book-pages, search, topics, global-ui; T-G02, T-G03, T-G06 | `src/features/{library,book,search,topics,shell}/**`, `src/ui/{SiteHeader,NavSidebar,…}` | G03 adds the minimal CMS reader in `src/lib/cms/**` |
| **H Performance** | T-H01 (pre-deploy list, on staging), T-H04 follow-ups, measurement for GR's fixes | `scripts/perf/**`, the wiki pre-deploy list's run log | Mostly measurement; fixes go to GR or V through the integrator |

Merge order: S, P, GS, GR, H. Each time a lane removes a prefix from
`DJANGO_PREFIXES` the exits allowlist shrinks in the same merge.

### Wave 3 — verification (integrator + 2 checker agents)

T-G07 full parity matrix, T-G08 accessibility, the exits crawl with only the Voices links and the D-6 allowlist, the L1 gate list (LAUNCH_PLAN §7.2).
Checkers are fresh agents that did not build the code. Staging work and the Support brief (T-I03) need the owner.

---

## 5. Shared files (the only places lanes collide)

| File | Rule |
|---|---|
| `docs/features/features.json`, `rebuild-status.json` | Lanes never edit them. Each lane writes one idempotent `docs/features/tools/apply_2026_11_<dd>_<lane>.py` (print names with IDs). The integrator runs it after merging and commits the result |
| `docs/features/CHANGELOG.md` | Lanes write `docs/features/changelog.d/<lane>.md`; the integrator folds them in |
| `docs/features/FEATURES.md`, `src/routeTree.gen.ts` | Generated. Lanes may commit them; on conflict the integrator regenerates (`build.py`, `npm run build`) |
| `package.json`, `package-lock.json` | A new dependency needs the integrator's OK; one lockfile change per wave, done by the integrator |
| `src/lib/routing/django-paths.ts` | Lane E in wave 1, lane V in wave 2; other lanes send a one-line request through the integrator |
| `SiteHeader.tsx`, i18n strings | Small edits allowed from any lane; the integrator resolves |
| `docs/reader-future/DECISIONS.md` | Lanes propose rows in their report; the integrator writes them |
| `reader/views.py`, `sefaria/urls_shared.py` | Lane B only, in both waves |

---

## 6. Lane brief template

Every lane agent gets: its tasks copied from `LAUNCH_PLAN.md` (not a pointer), its owned paths, the gate table with its ports,
the shared-file rules, the standing rules (LAUNCH_PLAN §1.2), "never push, never open a PR, never edit outside your paths", the
worktree path and branch, and "report with commands and outputs". It reads `LAUNCH_PLAN.md`, this file, and the docs §1.3 lists.

---

## 7. Risks of running it this way

- **One branch, many lanes:** the gate after each merge is the real protection. If the full Playwright suite takes longer than about
  30 minutes, merges become the bottleneck; then merge two lanes, gate once, and bisect only on red.
- **The live API under e2e:** until lane A finishes T-A04, the cassette runs in `auto` and parallel lanes can record different
  answers. Lanes keep their own cassette directory; the integrator's gate is the arbiter.
- **Draft PR skips Python CI:** until #3788 is ready for review, only the local pytest run proves the Django changes.
- **Review load:** six lanes produce more diff than one person reads. The reviewer agent per lane is the first read; the owner reads
  the integrator's per-wave summary and spot-checks.
