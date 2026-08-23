---
name: sefaria-release-notes
description: |
  Generates Sefaria production release notes in Slack mrkdwn format from a GitHub deploy PR and Shortcut sprint Done stories. Use when asked to "create release notes", "generate deploy notes", "write sprint release notes", "summarize the deploy for Slack", "write up what shipped", or when given a GitHub preprod→prod PR and notes are needed. Produces two Slack-ready .txt files: a technical version (engineers, story links + PR refs) and a non-technical version (product, leadership, partners). Always use this skill when the user provides a GitHub PR URL alongside any request about release communication.
---

# Sefaria Release Notes Generator

Produces two Slack-formatted release note files from a GitHub deploy PR and the current Shortcut sprint's Done stories. Before generating any output, summarise what you found (stories matched, stories unmatched, version numbers) so the user can catch issues early.

## Inputs

Ask for any of these if not provided:
- **GitHub PR URL or number** — the preprod→prod promotion PR (e.g. `#3318`)
- **Output directory** — defaults to the project root

## CI / headless mode

When the `SHORTCUT_API_TOKEN` environment variable is set (this is how `.github/workflows/prod-release-notes.yaml` invokes this skill via headless `claude -p`), there is no interactive user and no OAuth-based `mcp__shortcut__*` MCP tools available — Sefaria's Shortcut MCP server (`https://mcp.shortcut.com/mcp`) is OAuth-only and cannot authenticate non-interactively. In this mode:

- **Never ask a clarifying question.** Take the PR number and output directory from the invocation, proceed with the Edge Cases table's defaults for anything else ambiguous.
- **Phases 1b and 1c**: instead of `mcp__shortcut__*` tool calls, hit Shortcut's REST API v3 directly with `curl -H "Shortcut-Token: $SHORTCUT_API_TOKEN" https://api.app.shortcut.com/api/v3/...`. Reproduce the *same two-source logic* described in 1b/1c below — it is load-bearing, not incidental:
  - **Source A (iteration membership, all teams)**: list every team/group in the workspace, then for each one list its active iterations, then list each active iteration's stories — mirroring "loop every team, don't trust a single caller-scoped call" from 1b. Consult `https://developer.shortcut.com/api/rest/v3` for the exact current endpoint shapes if unsure; the principle (all-teams loop, not a single unscoped call) matters more than the precise path.
  - **Source B (direct PR search)**: for every PR number collected in 1a, search Shortcut stories for that PR number via the REST search endpoint, the same as the MCP `stories-search` call it replaces.
  - Merge A ∪ B by story ID exactly as 1c describes.
- **Phase 2 (`match_stories.py`) and Phase 3 (file generation)** are unchanged — pure local computation, no MCP/API dependency either way.
- **Phase 4 (Shortcut state mutation) is skipped entirely in CI mode.** Phase 4 was designed for an interactive session where a human sees the Phase-2 summary before any Shortcut story gets mutated; running unattended in CI removes that check, and a bad match would silently transition or comment on a live shared story with no one watching. Instead, list the Phase-2-matched Deploy-Ready stories (the ones Phase 4 would have transitioned) in the tech output file's existing structure so a human can transition them by hand, and do not call any Shortcut write endpoint.

## Phase 1 — Fetch (run all three in parallel)

### 1a. GitHub PR details
```bash
gh pr view {PR_NUMBER} --repo Sefaria/Sefaria-Project --json title,body,commits,labels
```

From the body, extract:
- The full commit list (lines starting with `-` under `### Changes`)
- Total commits / features / bug-fix counts from the metadata table
- App and chart version — look for `deploy(preprod): app=X.X.X-preprod.N chart=Y.Y.Y-preprod.N` and strip the `-preprod.N` suffix to get the production version

If the version cannot be found in deploy commits, use the highest `deploy(staging): app=X.X.X` version as a proxy.

**After extracting the commit list**, collect all PR numbers referenced via `(#XXXX)`. For each PR number, fetch its branch name:
```bash
gh pr view {PR_NUMBER} --repo Sefaria/Sefaria-Project --json headRefName,number
```
Run these in parallel (batch them). Build a JSON object `{"PR_NUMBER": "branch-name", ...}` — this is the `--branches` input for the cross-reference script. Branch names like `feature/sc-12345/...` or `sc-12345-some-fix` contain story IDs that may not appear in the commit message itself.

### 1b. Active Shortcut iterations — across ALL teams, not just your own

`mcp__shortcut__iterations-get-active` with no arguments is silently scoped to **the calling user's own team memberships**. It will not surface iterations owned by teams you don't belong to (e.g. MarCom, Content, Product Design) — it just returns fewer iterations with no error, which reads as "there's nothing else" when there really is. Do NOT call it bare and treat the result as exhaustive.

Instead:
1. Call `mcp__shortcut__teams-list` to get every team in the workspace.
2. For each team, call `mcp__shortcut__iterations-get-active` with that team's `teamId` (or `iterations-search` filtered to the team UUID + `status: started` — the `state`/`team`-by-name filters on `iterations-search` do not reliably work, only a team UUID does).
3. Collect all active iteration IDs across all teams, noting which team each belongs to.

Also note: an iteration that ended a day or two before this skill runs flips to `status: done` and drops out of "active" even though the deploy being promoted was very likely cut while it was still active. If a commit's PR number doesn't resolve to a story via any active iteration, don't assume "not this sprint" — 1c's PR-search step below is what actually catches this case, so it isn't a hole in practice.

### 1c. Done + Deploy Ready stories — two sources, merged

Iteration membership alone misses two real categories of story: (1) ad-hoc/maintenance stories with no iteration assigned at all (`iteration_id: null` — common on teams like MarCom), and (2) stories whose iteration recently ended and is no longer "active" per 1b. Both are common enough that iteration-only lookup is not sufficient on its own. Use two sources and merge by story ID (dedup):

**Source A — iteration membership.** For each active iteration ID found in 1b, call `mcp__shortcut__iterations-get-stories` with `iterationPublicId`. Filter to workflow states `500000010` (Done) OR `500000045` (Deploy Ready), AND `archived == false`.

**Source B — direct PR search.** For every PR number collected in 1a (from `(#XXXX)` refs in the commit list), call `mcp__shortcut__stories-search` for that PR number (Shortcut indexes PR/branch links, so a search on the PR number or its linked branch name reliably finds the story even with no iteration or a team you don't belong to). This is what actually catches MarCom-owned, iteration-less, or recently-unsprinted stories — treat it as load-bearing, not a fallback.

Merge A ∪ B by story ID. Keep track of which state each story came from (Done vs Deploy Ready) since sprint-only reporting should call out Deploy Ready items separately (they're still in flight, not fully shipped). Deploy Ready stories matched to a commit in this deploy are, by definition, now shipping — they feed Phase 4 regardless of which source (A or B) found them.

## Phase 2 — Cross-reference

Run `scripts/match_stories.py` with the commit list and the combined Done + Deploy Ready stories list. The script outputs a JSON map of `pr_number → {story_id, story_name, story_url}` for all matched pairs, plus lists of unmatched commits and unmatched stories.

```bash
python3 .claude/skills/sefaria-release-notes/scripts/match_stories.py \
  --commits '{JSON_ESCAPED_COMMIT_LIST}' \
  --stories '{JSON_ESCAPED_STORIES_LIST}' \
  --branches '{JSON_ESCAPED_BRANCHES_MAP}'
```

`--branches` is the `{"PR_NUMBER": "branch-name"}` map built in step 1a. Omit if no branch names were fetched.

**Before proceeding**, summarise findings to the user:
- Version: `app X.X.X / chart X.X.X`
- N commits, N matched to Shortcut stories, N unmatched
- N Done stories + N Deploy Ready stories in sprint, N shipping in this deploy, N still awaiting release (Deploy Ready, unmatched)

**Important — "not in this deploy" ≠ "not released":** Done stories that don't appear in this PR are presumed already shipped in an earlier prod deploy during the same sprint. Do **not** list them as unreleased. Only Deploy Ready (or otherwise stuck) stories that are *not* matched to this deploy count as awaiting release.

Categorise each item into one of four buckets:
1. **User-facing** — visible feature, UI change, or user-impacting bug fix
2. **Backend / performance** — API changes, query optimisation, data or matching fixes
3. **Infrastructure / DevOps** — Helm, CI/CD, Kubernetes, observability
4. **AI / eval / platform** — chatbot, eval pipeline, ML work shipping in this deploy

Items with no SC story and no clear user impact can be omitted or listed briefly under backend/infra.

**Sprint line in headers:** use date range only (e.g. `Sprint: Jul 27–Aug 9`). Do **not** include team names ("Team Platform", "sefaria.org", etc.).

## Phase 3 — Generate output files

Read `references/slack-format.md` before writing any output. It contains Slack mrkdwn rules, the exact section structures, and short examples of correct output.

Write two files to the output directory:

### `release-notes-tech-slack.txt`
Audience: engineers in a Slack channel. Include story links, PR refs, and technical detail.

- One bullet per item, using the section structure in `references/slack-format.md`
- 1–3 sentences per item: what changed, root cause for bugs, what it enables for features
- **Every item with a matched Shortcut story (per Phase 2's `matched` list) MUST include its story link** — cross-check each bullet against the matched-stories list before finalizing; it's easy to drop the `sc-XXXXX` link when a PR's commit message alone doesn't mention it (the match came from the branch name instead) and write the item as if it had no story
- Flag high-risk items with `:warning:` (major framework upgrades, DB migrations, iOS SDK changes)
- The `:test_tube:` trailing section is **only** for stories still awaiting release that ship via **this same release vehicle** (Sefaria-Project web preprod→prod). Omit the section entirely if there are none. Do **not** dump Done sprint stories that already shipped in earlier deploys. Do **not** list Deploy Ready work that ships elsewhere (e.g. `ai-chatbot` production promote, Sefaria-Mobile app store release) — those confuse readers of a web deploy note.

### `release-notes-product-slack.txt`
Audience: non-engineers. Plain language, no PR numbers, no stack names (Django → "our web framework", Postgres → "the database", etc.).

- Group by impact: what users see, bug fixes, partner/API changes, stability; trailing section only for still-unreleased items
- Each bullet: 1–2 sentences, named after the feature or fix, not the technical mechanism
- Translate every technical term — if you're unsure whether a term needs translation, translate it
- **Ordering rule for `:eye: *What users will see and feel*`**: content updates (new library texts, new books, new categories, newly linked sources) ALWAYS go first — before page retirements, UI fixes, or AI features. These are the most tangible user-facing changes and are what non-technical stakeholders care about most.
- `:sparkles: *Still awaiting release*` — same rule as tech: only Deploy Ready / stuck items that would ship via this web deploy. Omit if empty. Never frame Done sprint work as "may ship later." Never include mobile-app or ai-chatbot-only releases here.

## Phase 4 — Sync Shortcut story states (Deploy Ready → Done)

A story matched to a commit in this deploy (Phase 2 output) that is currently in Deploy Ready state is, by definition, now shipping to prod — Shortcut should reflect that as Done. (This closes the same gap as the "auto-transition Deploy Ready → Done on prod deploy" story; until that automation exists, this phase is the manual stand-in.)

**Do not ask the user for confirmation.** Validate each candidate yourself, then mutate.

1. From the Phase 2 matched-stories list, filter to those whose source state was Deploy Ready (not already Done).
2. For each candidate, self-validate before updating:
   - Strong match (story ID in commit message and/or branch name) AND the PR clearly ships that story's work → transition to Done.
   - Weak/ambiguous match (story whose work spans multiple PRs and only some are in this deploy, commit later reverted, match only via parent story, or you can't confidently say "this shipped") → do **not** transition. Call `mcp__shortcut__stories-create-comment` tagging `@hadara`, e.g. "@hadara — flagging for review: this story matched a commit in this deploy but I'm not confident it should move to Done yet, please confirm." Leave state unchanged.
3. For validated stories, call `mcp__shortcut__stories-update` with `id: <story_id>`, `workflow_state_id: 500000010` (Done).
4. Report which stories were updated, which were flagged for @hadara, and any that failed.

Skip this phase entirely if no matched stories are in Deploy Ready state.

## Edge Cases

| Situation | Handling |
|-----------|----------|
| No active iterations found | Note it and proceed with PR-only content |
| PR has no `### Changes` commit list | Parse from `commits` field directly |
| Done story has no matching PR commit | Already shipped earlier in the sprint — omit from release notes (do not list as unreleased) |
| Deploy Ready story has no matching PR commit | List under "Still awaiting release" only |
| Commit references SC story not in Done | Include commit, note story may be in a different sprint |
| Version not found | Use `unknown` and flag it |
| Story belongs to a team you're not a member of | Don't assume `iterations-get-active` saw it — 1c Source B (direct PR search) is required precisely for this case |
| Story has `iteration_id: null` (ad-hoc/maintenance work) | Same — only 1c Source B finds these |

## Output Confirmation

After writing both files, report:
- File paths written
- Item counts by section (e.g. "7 user-facing, 5 backend, 4 infra, 2 awaiting release")
- Any `:warning:` high-risk items by name so the user knows what to watch post-deploy
- After Phase 4 runs: which Deploy Ready stories were transitioned to Done (if any)
