# Prod rollout → Slack + release notes: manual setup

This repo's changes (below) are necessary but not sufficient — the following
still needs a human with real credentials, since none of it can be
generated or guessed by an agent.

## How it works

```
Argo post-promotion analysis (prod)
  -> repository_dispatch (prod-rollout-succeeded, carries `version` + `chartVersion`)
  -> build/ci/shipped_stories.py   — walks the prod/* tag range in git,
                                      resolves Shortcut story codes from
                                      commit subjects, merged-PR branch
                                      names, AND (as a third, fallback
                                      source) Shortcut's own PR<->story
                                      link, hydrates story details
  -> build/ci/mark_stories_deployed.py — moves each shipped story
                                      Deploy Ready -> Done via the
                                      Shortcut API, then posts a write-back
                                      comment naming this release. A
                                      failure here (missing token, API
                                      error, nothing to move) is logged and
                                      Slack-alerted but never blocks the
                                      steps below.
  -> build/ci/reconcile_deploy_ready.py — separately, sweeps EVERY
                                      non-archived Deploy Ready story
                                      org-wide (not just this release's
                                      commit range) and transitions any
                                      whose linked PR already reached prod,
                                      then posts its own write-back comment
                                      naming the release that ACTUALLY
                                      shipped it (never this one) — see
                                      "Reconciliation sweep" and "Write-back
                                      release comment" below. Its output
                                      NEVER reaches the two steps that
                                      follow.
  -> sefaria-release-notes skill   — reads shipped-stories.json, writes
                                      prose only
  -> scripts/post_to_slack.py      — posts both files to Slack
```

Only the release-notes generation step is an LLM. Deciding which stories a given deploy closed
is a graph walk over git history, Shortcut IDs and the Shortcut API, and
flipping a story's workflow state is a for-loop over a REST API — none of
that is a job for a model. The skill's only input is the JSON that
`shipped_stories.py` already produced; it does not call GitHub or Shortcut
itself, and it does not mutate any story.

## Three discovery sources in `shipped_stories.py`

For each commit in the resolved tag range, a story id is looked for in, in
order:

1. **The commit subject itself** (`sc-NNNNN` in any of its usual shapes —
   `fix(sc-123):`, `[sc-123]`, `feature/sc-123`, ...).
2. **The branch name of the commit's merged PR**, when the commit carries a
   `(#N)` reference or is a bare "Merge pull request #N from ..." — some
   teams put the story code in the branch instead of the commit message.
3. **Shortcut's own PR<->story link** (`GET search/stories?query=pr:<N>`),
   used ONLY as a fallback for a commit whose PR carries no story id from
   either source above. This exists because git text is not the only place
   a story/PR link can live — a story can be attached to a PR from the
   Shortcut UI with no story code ever appearing in the branch name.
   `branch:"..."` and `pull-request:N` do NOT resolve this on this org;
   only the `pr:N` search operator does. The id is adopted ONLY when the
   search returns EXACTLY one story — an ambiguous match (>1) is logged and
   skipped rather than guessed.

   **This fallback is guarded the same way `reconcile_deploy_ready.py`'s
   sweep is (via the shared `shortcut_pr_guards.py`), and for the same
   reason: a bare `pr:<N>` match only proves Shortcut linked SOME story to
   that PR number, not that the PR is real shipping evidence.** Verified
   live: a promotion PR (head branch `master`/`preprod`/`prod`, merging
   into the next environment) resolves via `pr:<N>` to a real story just as
   readily as that story's actual feature PR does, while proving nothing
   about whether that story's own change shipped. So the fallback (a) is
   never even attempted for a commit whose subject is auto-generated
   merge/branch-sync noise (`NOISE_PATTERN` — the same pattern already used
   to keep such commits out of `commits_without_story`) or whose PR's own
   head branch is a long-lived environment branch, and (b) re-checks the
   single search result's own linked-PR entry against the three PR-level
   guards (merged / Sefaria-Project repo / target branch master) before
   adopting it — a match that fails those guards is a warn-and-skip.

   Ids recovered this way are echoed separately in the output's
   `stories_from_shortcut_pr_link` list (in
   addition to the ordinary `story_ids`) so a report can call out what only
   Shortcut knew. Gated on `SHORTCUT_API_TOKEN`; without it (or on any
   per-lookup failure) this step is skipped/warned and the run continues
   with git-only discovery — it never aborts `shipped_stories.py`.

## Reconciliation sweep: `build/ci/reconcile_deploy_ready.py`

`shipped_stories.py` + `mark_stories_deployed.py` only ever look at ONE
release's commit range (`prev-tag..cur-tag`). A story whose PR merged and
shipped in an EARLIER release — or before this pipeline existed — never
gets revisited by that pair of scripts; nothing ever walks backward and
re-checks a story sitting in Deploy Ready. Of the stories stuck in Deploy
Ready when this was diagnosed, ten times as many were this class of gap as
were the discovery gap `shipped_stories.py`'s third source fixes above.

`reconcile_deploy_ready.py` is a standalone, org-wide sweep that closes
that gap. It enumerates every non-archived Deploy Ready story, resolves
each one's linked merged PR(s), and checks whether any of those PRs'
merge commits are an ancestor of the current prod tag. It classifies every
story into exactly one of three buckets:

- **shipped** — at least one qualifying PR is in prod. Transitioned
  Deploy Ready (500000045) -> Done (500000010).
- **pending** — has a qualifying merged PR, but none are in prod yet. Left
  alone — this is the correct state, not a bug.
- **triage** — no qualifying PR at all, or the story lives in a
  non-Standard Shortcut workflow. Left alone and reported; this is the
  part of the output a human actually has to look at.

### The four guards

Each of these caught a real false positive while this script was verified
against live data — skipping any one of them silently mis-transitions a
story. The first three (merged / repo / target branch) are PR-level checks
shared with `shipped_stories.py`'s own RC1 PR-link fallback via
`build/ci/shortcut_pr_guards.py` — both scripts ask the same underlying
question ("does this linked PR actually prove a story's change reached
prod?") and a promotion PR is exactly as good at fooling either one, so
there is exactly one implementation of these three checks, not two
parallel copies that could silently drift apart:

1. **`repository_id` must be Sefaria-Project's (`500000103`).** A story can
   link a PR from a different repo; resolving that PR number against
   Sefaria-Project instead finds an unrelated (often much older) PR that
   happens to share the number — and that PR can easily already be in
   prod, which would report "shipped" for a story that never touched this
   repo.
2. **`target_branch_name` must be `"master"`.** Some stories link a
   promotion PR (preprod -> prod, or master -> preprod) instead of, or
   alongside, the actual feature PR. A promotion PR merges constantly and
   proves nothing about whether this story's own change reached prod.
3. **`merged` must be `true`.** An open or closed-without-merging PR is not
   evidence anything shipped.
4. **`workflow_id` must be the Standard workflow (`500000005`), and
   `workflow_state_id` must be exactly the numeric Deploy Ready id
   (`500000045`).** The Shortcut state named "Deploy Ready" — note its real
   name carries a trailing space, `"Deploy Ready "` — is workflow-specific:
   `500000045` doesn't exist as a concept in, say, the Content workflow.
   Enumeration is keyed on the state NAME (the search endpoint has no other
   way to filter it), so classification re-checks the NUMERIC ids before
   trusting a match; a story on any other workflow, or at any other state
   id despite matching the name, is routed to triage with its actual
   workflow/state ids reported — mirroring `mark_stories_deployed.py`'s
   `skipped_different_workflow` handling.

Enumeration uses the token'd search endpoint
(`search/stories?query=state:"Deploy Ready" !is:archived`), paginated via
its `next` cursor. This is deliberately NOT `iterations-get-active` — that
endpoint is silently scoped to the calling token's own teams and has
already produced an incomplete picture for this team once; the search
endpoint returns every matching story across every team.

A qualifying PR's merge commit is resolved via `gh pr view --json
mergeCommit` and tested with `git merge-base --is-ancestor <sha> <prod
tag>` — verified to correctly discriminate a merged-but-not-yet-promoted PR
from one that already reached prod. `git log --grep="(#N)"` was tried and
rejected: it misses squash-merge subjects and can't tell a real promotion
merge apart from an unrelated one.

### Dry-run by default

Unlike `mark_stories_deployed.py` (which mutates by default and needs
`--dry-run` to preview), `reconcile_deploy_ready.py` inverts that: **it
never mutates anything unless you pass `--apply`.** This is a bulk mutation
of shared state across potentially many stories and several different
teams, and — unlike a single release's handful of stories — there's no
natural moment (a deploy just happened) that makes running it low-risk. An
explicit `--dry-run` flag also exists, purely for symmetry with
`mark_stories_deployed.py` and CI readability; it's a no-op since dry-run
is already the default, and it always wins if both flags are passed
together.

```
python3 build/ci/reconcile_deploy_ready.py --dry-run                 # classify + report, mutate nothing (default)
python3 build/ci/reconcile_deploy_ready.py --apply                   # actually transition the "shipped" bucket
python3 build/ci/reconcile_deploy_ready.py --apply --prod-tag prod/6.111.0-prod.2+chart.0.87.5-prod.1 --out report.json
```

**Critical: this script never reads or writes `shipped-stories.json` and
never feeds the release-notes prose step.** The stories it backfills
shipped in EARLIER releases — leaking them into today's release
announcement would have Slack claim a dozen old features shipped today.
Reconciliation transitions Shortcut state only; it has no opinion about
what today's release notes should say. In the workflow, its step runs
after `mark_stories_deployed.py` and writes its own separate report file
to `$RUNNER_TEMP` (NOT the checkout / `GITHUB_WORKSPACE`) — a distinct
filename alone is a naming convention, not an access boundary, and the
release-notes step's headless Claude run holds `Glob`+`Read` over its whole
working directory, so a same-directory JSON full of real, recently-shipped
story names would be one bad glob away from leaking into the prose it
writes. Keeping the report outside the checkout entirely is what actually
enforces the separation. A failure here is warned/Slack-alerted the same way a
`mark_stories_deployed.py` failure is, and never blocks release-notes
generation or posting.

## Write-back release comment

Until this feature, the pipeline only ever WROTE a story's workflow state
(the `PUT` that moves it Deploy Ready -> Done) — nothing recorded WHICH
release actually carried a story, so a person reading it in Shortcut could
see it became Done but had no way to tell what shipped it without going and
digging through CI logs or git. Both `mark_stories_deployed.py` and
`reconcile_deploy_ready.py` now post a short, factual comment
(`POST /stories/{id}/comments`) immediately after a story is ACTUALLY
transitioned by that run — never for already-Done/skipped stories, and
never merely because a dry-run run classified something as a candidate.

The POST mechanics (`build/ci/shortcut_comment.py`) are shared between the
two scripts for the same drift-prevention reason `shortcut_pr_guards.py`
is shared for the PR-level guards — one implementation, not two copies that
could quietly diverge. The comment TEXT is deliberately **not** shared,
because the two scripts know different things about which release actually
shipped a story:

- **`mark_stories_deployed.py`** is reading THIS release's own
  shipped-stories.json, so it already has `version`, `chart_version` and
  `release_date` for exactly the release a story just shipped in — the
  comment states that directly, plus the PR(s) that carried it (resolved
  from the JSON's own `commits` list).
- **`reconcile_deploy_ready.py`** does NOT know that — a story it backfills
  shipped in some EARLIER release, and if its comment named the CURRENT
  prod tag, a reader would reasonably conclude that story shipped in
  TODAY's release. That is exactly the "old features shipped today" error
  class the `shipped-stories.json` / reconcile-report separation already
  documented above exists to prevent — just showing up in a Shortcut
  comment instead of a Slack post. So it instead asks git for the TRUE
  release:

  ```
  git tag --list 'prod/*' --contains <merge-oid> --sort=creatordate | head -1
  ```

  the first (earliest-created) `prod/*` tag that actually contains the
  winning PR's merge commit — the release that really carried it. Note the
  ascending `--sort=creatordate` here, the OPPOSITE of
  `resolve_default_prod_tag`'s `-creatordate`: that one wants the newest
  tag (today's release); this one wants the OLDEST tag that still contains
  the commit, i.e. the first release it ever reached. If that lookup can't
  be resolved for any reason (shallow checkout, a genuine gap in tag
  history, ...), the comment degrades HONESTLY — it says only that the
  story was detected as already present in production as of the current
  prod tag, and names the PR. It never guesses or implies a specific
  release.

Safety properties, both scripts:

- Posted ONLY after a transition actually succeeds; a failed transition
  posts nothing.
- Never posted in `--dry-run` (or reconcile's default no-`--apply` mode) —
  the report instead shows what WOULD be posted (`would_comment` in the
  JSON, a preview line in the stdout summary).
- A comment failure is logged (`WARNING` to stderr) and recorded
  (`comment_failed` in the JSON summary/report) but never fails the run or
  rolls back the already-successful transition — the state change is the
  valuable, already-durable part; the comment is a best-effort annotation
  on top of it.
- `--no-comment` on both scripts opts out of the annotation entirely while
  still transitioning.
- No separate dedupe index: a transitioned story leaves Deploy Ready, so a
  re-run's search/classify simply never sees it again — idempotency falls
  out of the state machine for free.

## What's already wired up in this repo

- `helm-chart/sefaria/templates/analysistemplate/rollout-complete.yaml` —
  a `notify-github` container, gated on `deployEnv == "production"` (the
  prod HelmRelease sets `deployEnv: production`, not `"prod"`), fires a
  `repository_dispatch` (`event_type: prod-rollout-succeeded`) once Argo's
  post-promotion analysis confirms the rollout healthy. Reads a
  `GH_DISPATCH_TOKEN` key from its OWN dedicated secret
  (`.Values.secrets.ghDispatch.ref`, default `gh-dispatch-token`) — kept
  separate from `local-settings-secrets` because that secret is mounted via
  `envFrom` into every web/task/monitor/cronjob pod, which is far too broad
  a blast radius for a GitHub PAT.
- `.github/workflows/prod-release-notes.yaml` — listens for that dispatch
  (or a manual `workflow_dispatch`), resolves the version (and optional
  chart version, for disambiguating a chart-only rollout), runs
  `shipped_stories.py` and `mark_stories_deployed.py`, separately runs
  `reconcile_deploy_ready.py` (its report never reaches the steps below),
  runs the `sefaria-release-notes` skill headlessly, and posts both output
  files to Slack via `scripts/post_to_slack.py`. The reconcile step honors
  the same `workflow_dispatch` `dry_run` input as `mark_stories_deployed.py`
  does — real trigger or `dry_run=false` passes `--apply`; the default
  `workflow_dispatch` (`dry_run=true`) leaves it in its default dry-run
  mode.
- `.claude/skills/sefaria-release-notes/` — the skill, shipped in-repo,
  now takes a shipped-stories JSON file as its only input and only writes
  prose. It no longer talks to GitHub or Shortcut.
- **preprod needs no changes.** `rollout-complete-preprod` already exists
  (same chart, templated per `deployEnv`) and already posts to Slack on a
  successful preprod rollout — assuming its `SLACK_URL` is populated (see
  below).

## Still required — infrastructure repo (SOPS-encrypted secret)

**This is the step that makes the whole pipeline live — without it,
`GH_DISPATCH_TOKEN` is simply absent, the dispatch curl gets a 401, falls
through `|| /bin/true`, and the entire feature is a silent no-op with
nothing failing anywhere.**

1. Create a GitHub PAT scoped to `Sefaria/Sefaria-Project` only —
   fine-grained, **Contents: read and write** permission (required for the
   `repository_dispatch` API endpoint; this token never needs push/admin
   access, it only fires a dispatch event).
2. SOPS-encrypt it into the `infrastructure` repo as its OWN dedicated
   Secret (NOT `local-settings-secrets` — that secret is mounted into every
   pod in the deployment; see above) under key `GH_DISPATCH_TOKEN`. This
   repo's `envs/prod/helmrelease.yaml` already points
   `secrets.ghDispatch.ref` at `gh-dispatch-token-production`; the
   infrastructure repo needs to create a Secret with that exact name.
3. Confirm `flux reconcile` picks it up (or wait for the next 5-minute
   poll) so the key exists on the `rollout-complete-production` Job's pod
   before the next prod rollout.

## Still required — Sefaria-Project GitHub Actions secrets

Add these under repo Settings → Secrets and variables → Actions:

| Secret | Purpose | Notes |
|---|---|---|
| `SHORTCUT_API_TOKEN` | `shipped_stories.py` story hydration and PR-link fallback, `mark_stories_deployed.py` state transitions, `reconcile_deploy_ready.py` enumeration and transitions | Shortcut → Settings → API Tokens. Not the same as the OAuth MCP connection used interactively. |
| `SLACK_PRODUCT_WEBHOOK` | Non-technical release announcement | A second Slack incoming webhook, pointed at whichever channel should get `release-announcement-product-slack.txt`. Until this is set, that post step is a guarded no-op (won't fail the workflow). |

Already exist and are reused as-is: `SLACK_DEPLOY_WEBHOOK`, `GITHUB_TOKEN`,
`ANTHROPIC_API_KEY`.

## Worth verifying, not something this session could check

`SLACK_URL` in `local-settings-secrets` — confirm it's actually populated
for **both** `preprod` and `prod` (not just present as a key). The existing
`rollout-complete` Slack ping silently no-ops if it's empty or missing
(`optional: true`), so a misconfigured value wouldn't surface as an error
anywhere — it would just be quiet.

## End-to-end verification, once the above is done

1. **Dry-run the whole pipeline without a real deploy.** Run:

   ```
   gh workflow run "Prod Release Notes" -f version=<a past prod version, bare, no leading v> -f dry_run=true
   ```

   Add `-f chart_version=<chart version>` if that app version has more than
   one `prod/*` tag (a chart-only rollout) and you need a specific one.

   This exercises tag-range resolution, story hydration, release-notes
   generation, and both Slack posts, with `mark_stories_deployed.py` run in
   `--dry-run` mode so nothing in Shortcut actually moves. It's the fastest
   way to validate a change to any of the scripts or the skill without
   waiting on a real rollout.

2. **Then confirm the real trigger path.** Promote something small through
   to prod normally.

3. Watch for the existing terse Slack ping from `rollout-complete-production`
   (confirms the AnalysisTemplate ran and Slack posting works at all).

4. Watch the `Prod Release Notes` GitHub Actions workflow run
   (`repository_dispatch` → `prod-rollout-succeeded`). If it doesn't fire,
   check the `notify-github` container's logs on the `rollout-complete-production`
   Job pod (`kubectl logs -n default -l job-name=...`) for the dispatch
   curl's exit/response. The curl runs with `-sS -f --max-time 30
   --connect-timeout 10`, so a bad/missing token (HTTP 401/403) or a
   timeout now prints to stderr in the pod logs — but the call still falls
   through `|| /bin/true` by design so it never blocks or fails the
   rollout, which means a failure here still won't surface anywhere except
   those logs unless you go look.

5. Confirm both Slack files post correctly, and confirm the shipped
   stories actually moved Deploy Ready → Done in Shortcut.

## Running the tests

The tests for these scripts (`build/ci/tests/test_shipped_stories.py`,
`test_mark_stories_deployed.py`, `test_reconcile_deploy_ready.py`) are
**not** collected by the repo's root `pytest.ini` (that config is scoped to
the Django app's own test suites), so run them by explicit path from the
repo root:

```
python3 -m pytest build/ci/tests/test_shipped_stories.py build/ci/tests/test_mark_stories_deployed.py build/ci/tests/test_reconcile_deploy_ready.py -q -p no:django -c /dev/null
```

Both flags are needed even though only explicit file paths are passed:
`pytest` still discovers and loads the repo-root `pytest.ini` from the
current directory regardless of which paths are given on the command line,
and that ini sets `DJANGO_SETTINGS_MODULE` — which makes the `pytest-django`
plugin try to `django.setup()` the whole app (and fail with
`ModuleNotFoundError: No module named 'allauth'` in an environment that
hasn't installed the full Django app's dependencies, which these
standalone, stdlib-only scripts have no need of). `-c /dev/null` stops
`pytest.ini` from being read at all; `-p no:django` disables the
`pytest-django` plugin itself as a second, independent line of defense
(matters if some other ini/plugin-autouse path re-enables it). Depending on
which Python environment you invoke `pytest` from, the plain command
without these flags may happen to work (if that environment has the full
Django app's dependencies installed) or may not — the flagged command works
regardless.

No network access, `git`, or `gh` binary is required — everything that
would otherwise shell out or call the Shortcut API is monkeypatched at the
same boundary the module itself uses (`subprocess.run`,
`urllib.request.urlopen`, or the module's own `run_git`/helper functions).
