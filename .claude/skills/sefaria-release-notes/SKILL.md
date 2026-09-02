---
name: sefaria-release-notes
description: |
  Writes a Sefaria production release notes (tech) file and release announcement (product) file in Slack mrkdwn format from a shipped-stories JSON file. Use when asked to "create release notes", "generate deploy notes", "write sprint release notes", "summarize the deploy for Slack", "write up what shipped", or when given a shipped-stories JSON produced by build/ci/shipped_stories.py. Produces two Slack-ready .txt files: release notes for engineers (story links + PR refs) and a release announcement for product, leadership, and partners.
---

# Sefaria Release Notes Generator

Reads a shipped-stories JSON file (produced upstream by `build/ci/shipped_stories.py`, which deterministically walks the git tree between two prod tags and calls the Shortcut API) and writes two Slack-formatted files from it: release notes for engineers, and a release announcement for everyone else. This skill does not fetch anything from GitHub or Shortcut and does not mutate any Shortcut story — it only reads the JSON and writes prose. In a non-interactive run, never ask a clarifying question — proceed with the Edge Cases table's defaults.

## Inputs

- **Path to the shipped-stories JSON file** — default filename `shipped-stories.json`
- **Output directory** — defaults to the project root

The JSON has this shape:
```json
{
  "version": "6.111.0-prod.2",
  "chart_version": "0.87.5-prod.1",
  "release_date": "2026-08-31T07:17:36+00:00",
  "range": {"previous_tag": "...", "current_tag": "...", "spec": "PREV..CUR"},
  "commits": [{"subject": "...", "pr_number": "3644", "branch": "feature/sc-11111/x", "story_ids": ["11111"]}],
  "commits_without_story": ["subject", ...],
  "reverted_commits": [{"subject": "Revert \"...\"", "suppressed_story_ids": ["11111"]}],
  "story_ids": ["11111", ...],
  "stories": [{"id": 11111, "name": "...", "description": "...", "url": "...", "workflow_state_id": 500000045, "story_type": "feature"}],
  "hydrated": true,
  "unresolved_story_ids": []
}
```

- **`release_date`** — ISO 8601 creation timestamp of the resolved current tag, or `null` if it couldn't be resolved (e.g. an explicit `--range` against a non-tag ref). This is the header date's only legitimate source — see "Header date" below.
- **`reverted_commits`** — commits whose subject matched the `Revert "..."` / `revert:` / `revert(...)` convention, each with the story ids THAT REVERT COMMIT referenced. **Never list a story appearing here as shipped**, even if you spot it elsewhere while reading the JSON — `shipped_stories.py` has already excluded it (and, where the reverted original is also in this range, excluded that original's ids too) from `story_ids` / `stories` for exactly this reason, unless another independent, non-reverted commit also carries the same id.

## Phase 1 — Read and summarise

Read the JSON file. Before generating any output, summarise what you found so the user (or the CI log) can catch issues early:
- Version: `app X.X.X / chart X.X.X` (from `version` and `chart_version`, stripping any `-prod.N` suffix)
- N commits, N with a resolved story, N in `commits_without_story`
- N stories in `stories`, N `unresolved_story_ids` (note these — they had a story ID but the Shortcut lookup failed; mention them in the tech file as unresolved rather than silently dropping them)

Categorise each story (and, for commits with no story, each commit) into one of four buckets:
1. **User-facing** — visible feature, UI change, or user-impacting bug fix
2. **Backend / performance** — API changes, query optimisation, data or matching fixes
3. **Infrastructure / DevOps** — Helm, CI/CD, Kubernetes, observability
4. **AI / eval / platform** — chatbot, eval pipeline, ML work shipping in this deploy

Items with no story and no clear user impact can be omitted or listed briefly under backend/infra.

**Header date:** this runs AFTER the rollout is already confirmed healthy, so both files' headers describe something that already happened, not something upcoming. Format `release_date` (ISO 8601, e.g. `2026-08-31T07:17:36+00:00`) as a human-readable date (e.g. `Aug 31, 2026`) and use it in both files' headers — see `references/slack-format.md`. If `release_date` is `null`, omit the date line entirely rather than guessing or fabricating one. There is no sprint/date-range field in the JSON — do not invent one.

## Phase 2 — Generate output files

Read `references/slack-format.md` before writing any output. It contains Slack mrkdwn rules, the exact section structures, and short examples of correct output.

Write two files to the output directory:

### `release-notes-tech-slack.txt`
The release notes. Audience: engineers in a Slack channel. Include story links, PR refs, and technical detail.

- One bullet per item, using the section structure in `references/slack-format.md`
- 1–3 sentences per item: what changed, root cause for bugs, what it enables for features
- **Every item with a story (from the JSON's `stories` list) MUST include its story link** — cross-check each bullet against `commits[].story_ids` / `stories` before finalizing
- Flag high-risk items with `:warning:` (major framework upgrades, DB migrations, iOS SDK changes)

### `release-announcement-product-slack.txt`
The release announcement. Audience: non-engineers. Plain language, no PR numbers, no stack names (Django → "our web framework", Postgres → "the database", etc.).

- Group by impact: what users see, bug fixes, partner/API changes, stability
- Each bullet: 1–2 sentences, named after the feature or fix, not the technical mechanism
- Translate every technical term — if you're unsure whether a term needs translation, translate it
- **Ordering rule for `:eye: *What users will see and feel*`**: content updates (new library texts, new books, new categories, newly linked sources) ALWAYS go first — before page retirements, UI fixes, or AI features. These are the most tangible user-facing changes and are what non-technical stakeholders care about most.

## Edge Cases

| Situation | Handling |
|-----------|----------|
| `commits_without_story` is non-empty | List briefly under backend/infra in the tech file if there's any signal in the subject line; otherwise omit |
| `hydrated` is `false` | Shortcut was never queried (no API token), so `stories` is empty by design — this is NOT a lookup failure. Title items from their commit subjects, still link each `story_ids` entry, and say the details were unavailable rather than reporting them as missing |
| `unresolved_story_ids` is non-empty | Note in the tech file's summary line so a human can look them up manually; do not guess at their content |
| `reverted_commits` is non-empty | Do not list any of these story ids as shipped in either file, even if they also appear in `story_ids`/`stories` for an unrelated reason (see the JSON shape note above) |
| `release_date` is `null` | Omit the date line in both files' headers rather than guessing |
| Version not found | Use `unknown` and flag it |
| JSON file missing or unreadable | Stop and report the problem — do not fabricate a release |

## Output Confirmation

After writing both files, report:
- File paths written
- Item counts by section (e.g. "7 user-facing, 5 backend, 4 infra")
- Any `:warning:` high-risk items by name so the user knows what to watch post-deploy
- Any unresolved story IDs or story-less commits that need human follow-up
