# Prod rollout → Slack + release notes: manual setup

This repo's changes (below) are necessary but not sufficient — the following
still needs a human with real credentials, since none of it can be
generated or guessed by an agent.

## What's already wired up in this repo

- `helm-chart/sefaria/templates/analysistemplate/rollout-complete.yaml` —
  prod-only `notify-github` container fires a `repository_dispatch`
  (`event_type: prod-rollout-succeeded`) once Argo's post-promotion analysis
  confirms the rollout healthy. Reads a `GH_DISPATCH_TOKEN` key from the
  same `local-settings-secrets` secret `SLACK_URL` already comes from.
- `.github/workflows/prod-release-notes.yaml` — listens for that dispatch,
  resolves the merged `prod` PR, runs the `sefaria-release-notes` skill
  headlessly, posts both output files to Slack.
- `.claude/skills/sefaria-release-notes/` — the skill, now shipped in-repo
  (was previously only in `~/.claude/skills/`), with a CI/headless-mode
  section that swaps OAuth-only Shortcut MCP calls for direct REST API
  calls, and explicitly skips Shortcut story mutation (Phase 4) in CI —
  that phase assumes a human reviews the match before it fires, which
  doesn't hold in an unattended run.
- **preprod needs no changes.** `rollout-complete-preprod` already exists
  (same chart, templated per `deployEnv`) and already posts to Slack on a
  successful preprod rollout — assuming its `SLACK_URL` is populated (see
  below).

## Still required — infrastructure repo (SOPS-encrypted secret)

1. Create a GitHub PAT scoped to `Sefaria/Sefaria-Project` only —
   fine-grained, **Contents: read and write** permission (required for the
   `repository_dispatch` API endpoint; this token never needs push/admin
   access, it only fires a dispatch event).
2. SOPS-encrypt it into the `infrastructure` repo's prod
   `local-settings-secrets` under key `GH_DISPATCH_TOKEN`, alongside where
   `SLACK_URL` / `SLACK_CHANNEL` already live for that same secret ref
   (`.Values.secrets.localSettings.ref` in this chart).
3. Confirm `flux reconcile` picks it up (or wait for the next 5-minute
   poll) so the key exists on the `rollout-complete-prod` Job's pod before
   the next prod rollout.

## Still required — Sefaria-Project GitHub Actions secrets

Add these under repo Settings → Secrets and variables → Actions:

| Secret | Purpose | Notes |
|---|---|---|
| `SHORTCUT_API_TOKEN` | Headless Shortcut REST access | Shortcut → Settings → API Tokens. Not the same as the OAuth MCP connection used interactively. |
| `SLACK_PRODUCT_WEBHOOK` | Non-technical release notes | A second Slack incoming webhook, pointed at whichever channel should get `release-notes-product-slack.txt`. Until this is set, that post step is a guarded no-op (won't fail the workflow). |

Already exist and are reused as-is: `ANTHROPIC_API_KEY`, `SLACK_DEPLOY_WEBHOOK`, `GITHUB_TOKEN`.

## Worth verifying, not something this session could check

`SLACK_URL` in `local-settings-secrets` — confirm it's actually populated
for **both** `preprod` and `prod` (not just present as a key). The existing
`rollout-complete` Slack ping silently no-ops if it's empty or missing
(`optional: true`), so a misconfigured value wouldn't surface as an error
anywhere — it would just be quiet.

## End-to-end verification, once the above is done

1. Promote something small through to prod normally.
2. Watch for the existing terse Slack ping from `rollout-complete-prod`
   (confirms the AnalysisTemplate ran and Slack posting works at all).
3. Watch the `Prod Release Notes` GitHub Actions workflow run
   (`repository_dispatch` → `prod-rollout-succeeded`). If it doesn't fire,
   check the `notify-github` container's logs on the `rollout-complete-prod`
   Job pod (`kubectl logs -n default -l job-name=...`) for the dispatch
   curl's exit/response — it fails silently (`|| /bin/true`) by design so a
   bad token never blocks a rollout, which also means failures here are
   invisible unless you go look.
4. Confirm both Slack files post correctly, including the
   "Still awaiting release" Shortcut items that Phase 4 would have
   auto-transitioned interactively — in CI mode those need a human to move
   them from Deploy Ready → Done by hand.
