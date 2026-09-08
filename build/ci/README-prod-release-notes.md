# Prod rollout → Slack + release notes: manual setup

This repo's changes are necessary but not sufficient — some setup below
requires a human with real credentials.

## Pipeline

```
Argo post-promotion analysis (prod)
  -> repository_dispatch (prod-rollout-succeeded, carries `version` + `chartVersion`)
  -> build/ci/shipped_stories.py        — resolves shipped Shortcut stories for the release
  -> build/ci/mark_stories_deployed.py  — moves those stories Deploy Ready -> Done
  -> build/ci/reconcile_deploy_ready.py — org-wide Deploy Ready sweep (independent of this release)
  -> build/ci/merge_release_backfill.py — folds any current-release backfill into shipped-stories.json
  -> build/ci/triage_explainer.py       — opt-in: proposes hypotheses for the reconcile sweep's triage bucket
     + headless `claude -p`
  -> sefaria-release-notes skill        — reads shipped-stories.json, writes prose only
  -> scripts/post_to_slack.py           — posts both files to Slack
```

Only the release-notes prose step and the opt-in triage explainer are LLM
steps; everything else is deterministic Python or a REST call.

## Running the scripts

```
python3 build/ci/shipped_stories.py --version 6.111.0-prod.2 [--out shipped-stories.json] [--repo Sefaria/Sefaria-Project] [--chart-version 0.87.5-prod.1]
python3 build/ci/shipped_stories.py --range <prev-tag>..<cur-tag> [--out shipped-stories.json]
```
Requires `git` and `gh` on PATH. `SHORTCUT_API_TOKEN` is optional; without
it, story ids are still emitted but hydration and the PR-link fallback are
skipped.

```
python3 build/ci/mark_stories_deployed.py --input shipped-stories.json [--dry-run] \
    [--workflow-id 500000005] [--from-state-id 500000045] [--done-state-id 500000010]
```
Requires `SHORTCUT_API_TOKEN` unless `--dry-run` is passed.

```
python3 build/ci/reconcile_deploy_ready.py [--dry-run]
python3 build/ci/reconcile_deploy_ready.py --apply
python3 build/ci/reconcile_deploy_ready.py --apply --prod-tag prod/6.111.0-prod.2+chart.0.87.5-prod.1 --out report.json
```
`--dry-run` is the default; nothing is transitioned without `--apply`.
Requires `git`, `gh`, and `SHORTCUT_API_TOKEN` (required even for `--dry-run`).

```
python3 build/ci/merge_release_backfill.py \
    --shipped-stories-out shipped-stories.json \
    --reconcile-report reconcile-deploy-ready-report.json
    # writes the merged result back to --shipped-stories-out by default; pass --out to write elsewhere
```

```
python3 build/ci/triage_explainer.py extract --report reconcile-deploy-ready-report.json --out triage-only.json
python3 build/ci/triage_explainer.py resolve-enabled --event-name workflow_dispatch --explain-triage-input true --enable-var ""
```

## What's already wired up in this repo

- `helm-chart/sefaria/templates/analysistemplate/rollout-complete.yaml` —
  fires `repository_dispatch` (`prod-rollout-succeeded`) once Argo's
  post-promotion analysis confirms the prod rollout healthy. Uses a
  `GH_DISPATCH_TOKEN` from its own dedicated secret
  (`.Values.secrets.ghDispatch.ref`, default `gh-dispatch-token`).
- `.github/workflows/prod-release-notes.yaml` — listens for that dispatch
  (or a manual `workflow_dispatch`), runs the pipeline above, and posts to
  Slack.
- `.claude/skills/sefaria-release-notes/` — the release-notes skill,
  shipped in-repo, takes a shipped-stories JSON file as its only input.
- Preprod needs no changes — `rollout-complete-preprod` already exists and
  posts to Slack on a successful preprod rollout (as long as `SLACK_URL`
  is populated; see below).

## Still required — infrastructure repo (SOPS-encrypted secret)

1. Create a GitHub PAT scoped to `Sefaria/Sefaria-Project` only —
   fine-grained, **Contents: read and write** permission.
2. SOPS-encrypt it into the `infrastructure` repo as its own dedicated
   Secret under key `GH_DISPATCH_TOKEN`, named `gh-dispatch-token-production`
   to match `envs/prod/helmrelease.yaml`'s `secrets.ghDispatch.ref`.
3. Confirm `flux reconcile` picks it up before the next prod rollout.

Without this, `GH_DISPATCH_TOKEN` is absent, the dispatch curl 401s and
falls through `|| /bin/true`, and the whole feature is a silent no-op.

## Still required — Sefaria-Project GitHub Actions secrets

Add these under repo Settings → Secrets and variables → Actions:

| Secret | Purpose | Notes |
|---|---|---|
| `SHORTCUT_API_TOKEN` | Story hydration, PR-link fallback, and state transitions for all three CI scripts | Shortcut → Settings → API Tokens |
| `SLACK_PRODUCT_WEBHOOK` | Non-technical release announcement | A second Slack incoming webhook. Until set, that post step is a guarded no-op |

Already exist and are reused as-is: `SLACK_DEPLOY_WEBHOOK`, `GITHUB_TOKEN`,
`ANTHROPIC_API_KEY`.

Optional — to have the triage explainer opt in automatically on the real
`repository_dispatch` trigger (a manual `workflow_dispatch` run can already
opt in per-run via its `explain_triage` input): add a repo-level Actions
**Variable** (not Secret) named `ENABLE_TRIAGE_EXPLAINER` set to `true`.

## Worth verifying, not something this session could check

`SLACK_URL` in `local-settings-secrets` — confirm it's actually populated
for both `preprod` and `prod`. The existing `rollout-complete` Slack ping
silently no-ops if it's empty or missing (`optional: true`).

## End-to-end verification

1. Dry-run the whole pipeline without a real deploy:

   ```
   gh workflow run "Prod Release Notes" -f version=<a past prod version, bare, no leading v> -f dry_run=true
   ```

   Add `-f chart_version=<chart version>` for a chart-only rollout.

2. Then confirm the real trigger path: promote something small through to
   prod normally.
3. Watch for the existing terse Slack ping from `rollout-complete-production`.
4. Watch the `Prod Release Notes` GitHub Actions workflow run. If it
   doesn't fire, check the `notify-github` container's logs on the
   `rollout-complete-production` Job pod for the dispatch curl's
   exit/response.
5. Confirm both Slack files post correctly, and confirm the shipped
   stories actually moved Deploy Ready → Done in Shortcut.

## Running the tests

```
python3 -m pytest build/ci/tests/ -q -p no:django -c /dev/null
```

Both `-c /dev/null` and `-p no:django` are needed: the repo-root
`pytest.ini` sets `DJANGO_SETTINGS_MODULE`, which makes `pytest-django` try
to `django.setup()` the whole app even when only these standalone,
stdlib-only scripts' tests are selected. `-c /dev/null` stops that ini from
being read; `-p no:django` disables the plugin as a second line of defense.

No network access, `git`, or `gh` binary is required — everything that
would otherwise shell out or call the Shortcut API is monkeypatched in the
tests.
