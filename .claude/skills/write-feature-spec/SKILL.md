---
name: write-feature-spec
description: For Product. Turns a Shortcut story into a behavior spec (a Gherkin .feature file) in e2e-tests/feature-specs/features/, then hands it to engineering on the story's branch. Use when someone asks to "write the behavior spec", "write the feature file", "write given/when/then for sc-NNNNN", or "hand off this story to engineering".
---

# Write a feature spec and hand it off

You help a product person turn a Shortcut story into a behavior spec that engineering will make
pass. The spec is a contract. Once it lands, only spec editors (the people listed in the `SPEC_EDITORS` repo variable) may change
it, so get it right with the person before committing. Process reference:
`e2e-tests/feature-specs/README.md`.

## 0. Check the person is set up as a spec editor

Do this first. A spec editor can't hand off a spec without all three:

1. **Their GitHub login is in `SPEC_EDITORS`.** Ask for their login. If they aren't sure they're
   listed, they ask the GitHub admin (it's a repo variable, under Settings > Secrets and variables >
   Actions > Variables). If they're not listed, stop: the PR will fail the lock.
2. **Their commits carry their GitHub identity.** Run `git config user.email` and confirm with them
   that it's an email on their GitHub account (github.com/settings/emails). If not, set it with
   `git config user.email <their GitHub email>`.
3. **The agent guard knows they're an editor.** Run `echo "${SEFARIA_SPEC_EDITOR:-unset}"`.
   If it isn't `1`, `.claude/settings.local.json` needs `"SEFARIA_SPEC_EDITOR": "1"` under its
   `"env"` key (create the file or add the key; keep anything already in it):

   ```json
   { "env": { "SEFARIA_SPEC_EDITOR": "1" } }
   ```

   Then they restart Claude Code and start again. Without it, saving the spec is blocked.
   Never set this for someone who isn't in `SPEC_EDITORS`.

## 1. Read the story

Ask for the Shortcut story id if you don't have it. Fetch the story (Shortcut MCP `get_story`)
and note:

- its **id**, **name**, **story type** and **description** (acceptance criteria, designs, edge cases);
- `formatted_vcs_branch_name`, Shortcut's suggested branch name.

## 2. Draft the behaviors with the person

- Start from `e2e-tests/feature-specs/templates/TEMPLATE.feature`.
- Prefer the sentences in `e2e-tests/feature-specs/STEP-VOCABULARY.md`: they already work. When
  none fits, write a clear new sentence. An engineer will implement it.
- Describe what a person **sees and does**. Never mention CSS classes, element ids, API calls or
  component names.
- One behavior per scenario, named after the behavior. Cover the edge cases the story mentions
  (logged out, Hebrew interface, empty states, errors, phone).
- Tag the feature or each scenario `@sc-<id>`. Tag phone-only behavior `@mobile`.
- Use real example values. If a value depends on site data (a text, a topic), check it exists on
  www.sefaria.org.
- List anything ambiguous as a question for the person. Don't guess. Show them the full draft and
  get an explicit "yes" before step 3.

## 3. Save and check the file

- Path: `e2e-tests/feature-specs/features/<area>/<slug>.feature`. `<area>` is one of the existing
  folders (`library`, `voices`, `assistant`, `account`, ...); create a new one only if none fits.
  `<slug>` is the slug part of Shortcut's suggested branch name.
- If saving is blocked with "BLOCKED: ... is locked", step 0.3 was missed. Go back to it. Never
  save the file another way.
- Run `npm run bddgen`. Expected: it reports **missing step definitions** for sentences not in
  the vocabulary. That is fine, and it is the engineer's starting point. Any **other** error
  (a Gherkin parse error) must be fixed.

## 4. Create the branch and commit only the spec

```bash
git fetch origin master
git switch -c <branch> origin/master
git add e2e-tests/feature-specs/features/<area>/<slug>.feature
git commit -m "spec(sc-<id>): <story name>"
git push -u origin <branch>
```

- `<branch>` is Shortcut's suggested branch name (`formatted_vcs_branch_name`), copied exactly.
  Shortcut already picks the prefix from the story type (`feature/`, `chore/`, `bug/`).
  Example: `feature/sc-48500/show-reading-time-on-texts`.
- The commit must be authored by the spec editor's own GitHub account: check that
  `git config user.email` is an email on their GitHub account. The lock checks who authored each
  commit that changes a spec, and fails the PR for anyone else.
- Commit **only** the `.feature` file. Check with `git show --stat HEAD` before pushing. If
  anything else is staged, unstage it.
- Do not open a pull request. The engineer opens it after the tests pass.

## 5. Hand off

First check that CI added the step stubs. The push starts the **BDD step stubs** workflow:
`gh run list --branch <branch> --workflow bdd-stubs.yaml --limit 1` should show it succeeded
within a few minutes. If it failed, open the log (`gh run view --log-failed`): it is almost
always a Gherkin syntax error in the spec. Fix it in a new commit and push again.

Post a comment on the Shortcut story (Shortcut MCP `create_story_comment`):

> Behavior spec ready on branch `<branch>`:
> `e2e-tests/feature-specs/features/<area>/<slug>.feature` (<N> scenarios).
> CI has added a step stub for each new sentence. Engineering: pull the branch and run
> `npm run test:bdd`; the new scenarios fail with "Step not implemented yet" until the stubs are
> filled in.
> Process: e2e-tests/feature-specs/README.md. Open questions: <list, or "none">.

Then tell the person the branch name. No approval is needed on the eventual PR: the lock passes
because the spec commit is theirs.

## Changing an existing spec

Only a spec editor may change a spec, and the commit must be authored by them. Follow "Changing a spec (amendments)" in `e2e-tests/feature-specs/README.md`, and add
the `# Amended <date> (sc-<id>): <why>, approved by <name>` comment above the changed scenario.
