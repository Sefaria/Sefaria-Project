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
                                      commit subjects / merged-PR branch
                                      names, hydrates story details
  -> build/ci/mark_stories_deployed.py — moves each shipped story
                                      Deploy Ready -> Done via the
                                      Shortcut API. A failure here (missing
                                      token, API error, nothing to move) is
                                      logged and Slack-alerted but never
                                      blocks the two steps below.
  -> sefaria-release-notes skill   — reads the JSON, writes prose only
  -> build/ci/post_to_slack.py     — posts both files to Slack
```

Only the release-notes generation step is an LLM. Deciding which stories a given deploy closed
is a graph walk over git history and Shortcut IDs, and flipping their
workflow state is a for-loop over a REST API — neither of those is a job
for a model. The skill's only input is the JSON that
`shipped_stories.py` already produced; it does not call GitHub or Shortcut
itself, and it does not mutate any story.

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
  `shipped_stories.py` and `mark_stories_deployed.py`, runs the
  `sefaria-release-notes` skill headlessly, and posts both output files to
  Slack via `build/ci/post_to_slack.py`.
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
| `SHORTCUT_API_TOKEN` | `shipped_stories.py` story hydration and `mark_stories_deployed.py` state transitions | Shortcut → Settings → API Tokens. Not the same as the OAuth MCP connection used interactively. |
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
