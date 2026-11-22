# Feature specs: behavior-driven story tests

Product describes a feature's behavior in plain-English Gherkin (`Given / When / Then`). Engineering
binds each sentence to Playwright code. CI runs the result on every PR, and a PR cannot merge
while a story fails. Shortcut: [sc-48207](https://app.shortcut.com/sefaria/story/48207).

```
playwright.bdd.config.ts          # BDD config, separate from playwright.config.ts
.features-gen/                    # generated specs (gitignored, never edit)
e2e-tests/feature-specs/
  features/<area>/*.feature       # LOCKED: only spec editors may change these (CI check)
  steps/fixtures.ts               # the `visitor` fixture and guarded Given/When/Then
  steps/common.steps.ts           # shared step vocabulary (STEP-VOCABULARY.md)
  steps/<area>/*.steps.ts         # feature-specific steps: engineers edit freely
  templates/                      # spec template for product
```

Steps reuse the existing suite (`e2e-tests/pages/`, `utils.ts`, `constants.ts`, `global-setup.ts`)
and follow its rules in [`../CLAUDE.md`](../CLAUDE.md): page objects through `PageManager`, timeouts
wrapped in `t()`, no raw locators in step files.

## For product: one-time setup as a spec editor

Before your first spec, check all three. The `write-feature-spec` skill checks them too.

1. **You're listed.** Your GitHub login must be in the `SPEC_EDITORS` repo variable. Ask the GitHub
   admin to add it if you're new.
2. **Your commits are yours.** `git config user.email` must be an email on your GitHub account
   (github.com/settings/emails). The lock checks who authored each spec commit.
3. **Claude Code knows you're an editor.** Add this to `.claude/settings.local.json` in the repo
   (create it if missing; it's personal and never committed), then restart Claude Code:

   ```json
   { "env": { "SEFARIA_SPEC_EDITOR": "1" } }
   ```

   Without it, Claude Code's agent guard blocks you from saving a `.feature` file. Only spec
   editors should set it: for anyone else the CI lock still fails the PR.

## Who does what

| Step                 | Who                                                                 | What                                                                                                                                                                                                                                           |
| -------------------- | ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Write the spec    | Product (often with an agent, using the `write-feature-spec` skill) | One `.feature` file per Shortcut story, using the template                                                                                                                                                                                     |
| 2. Hand off          | Product                                                             | Create the story's branch (Shortcut's suggested branch name, copied exactly), commit **only** the `.feature` file, push, and tell the engineer the branch name. CI then commits a stub for every new sentence to the branch (see "Step stubs") |
| 3. Make it red       | Engineer                                                            | Pull the branch: `steps/<area>/<name>.steps.ts` has a stub per new sentence, and `npm run test:bdd` fails with "Step not implemented yet"                                                                                                      |
| 4. Bind the steps    | Engineer (or their agent)                                           | Reuse the shared vocabulary where it fits; write the rest in `steps/<area>/`; add page-object methods                                                                                                                                          |
| 5. Build the feature | Engineer                                                            | Until `npm run test:bdd` is green locally                                                                                                                                                                                                      |
| 6. Open the PR       | Engineer                                                            | CI runs the BDD suite (blocking) and the Chrome `@pr` core journeys (warning only for now; see `E2E_PR_BLOCKING`)                                                                                                                              |
| 7. Merge             | Engineer                                                            | The lock passes on its own: the only commit that touches the spec is product's. No spec review is needed                                                                                                                                       |

## Running locally

```bash
cp e2e-tests/example.env e2e-tests/.env       # once; set SANDBOX_URL (and credentials for logged-in steps)
npm run bddgen                                # generate; prints snippets for missing steps
npm run bdd:stubs                             # write stubs for missing steps (what CI does at handoff)
npm run test:bdd                              # generate, then run every story
npm run test:bdd -- --project=chrome-bdd -g "opens a chapter"   # one scenario
npm run test:bdd -- --ui                      # Playwright UI mode
```

Outside CI, `e2e-tests/.env` **overrides** your shell (same as the main suite), so set
`SANDBOX_URL` there. A local dev server works: `SANDBOX_URL=http://localhost:8000`.

## Writing steps

1. **Start from the stub.** CI has already written one per new sentence (see "Step stubs"):
   ```ts
   Then('the reader shows the text of {string}', async ({ visitor }, arg: string) => {
     // Step: And the reader shows the text of "Genesis 1:1"
     // From: e2e-tests/feature-specs/features/library/reading-a-text.feature:9:5
     throw new Error('Step not implemented yet: And the reader shows the text of "Genesis 1:1"');
   });
   ```
   Replace the `throw` with the real step. If a sentence matches an existing step's wording, delete
   the stub and reuse that step; move steps other features can use to `common.steps.ts`.
2. **Import from `fixtures.ts`, never from `playwright-bdd`.** Our `Given/When/Then` refuse a step
   with an empty body, for example a hand-pasted `bddgen` snippet that was never filled in. It
   would otherwise pass while checking nothing.
3. **Use the `visitor` fixture.** It holds who the story is about (logged in or out, interface
   language) and opens the page lazily: `await visitor.page()`, `await visitor.pm()` (the
   `PageManager`), `visitor.urlFor('Library', '/Genesis.1')`.
4. **Keep steps thin.** A step calls a page-object method; locators and waits live in
   `e2e-tests/pages/`. See `steps/library/reader.steps.ts` for the pattern.
5. **A Then-step must assert.** Use `expect(...)` or a page-object `expect*` method.
6. **Check the step fails when it should.** Before trusting a green run, break the expectation
   once and watch it go red.

### Step stubs

When a push changes `features/` on any branch but `master`, the **`BDD step stubs`** workflow
(`.github/workflows/bdd-stubs.yaml`) runs `build/ci/bdd-stubs/generate-step-stubs.cjs`. It
finds every sentence with no step definition, desktop and `@mobile` alike, and commits a stub
for each to `steps/<area>/<name>.steps.ts`, appending if the file exists. The commit is
`github-actions[bot]`'s and touches only `steps/`, so the lock is unaffected.

- **At handoff:** product pushes the spec; within a few minutes the branch has the stubs. The
  engineer pulls before starting.
- **On an amendment:** new sentences get stubs the same way. Removed sentences leave their steps
  behind; delete them by hand.
- **No PR CI run for the stub commit:** a push made by the workflow doesn't trigger other
  workflows, so if a PR is already open its CI runs again on your next push.
- **If the workflow fails,** the spec most likely has a Gherkin syntax error; the run log says
  where. Ask the spec editor to fix it.
- **Locally:** `npm run bdd:stubs` does the same, and `npm run bdd:stubs -- --check` lists what it
  would write.
- It hooks into playwright-bdd internals (`build/ci/bdd-stubs/capture-missing-steps.cjs`), which
  is why `playwright-bdd` is pinned to an exact version. After upgrading it, check that
  `npm run bdd:stubs -- --check` still finds a missing step.

Tags: `@mobile` runs a scenario in the phone project (Pixel 5) instead of desktop Chrome;
`@manual` documents a behavior that is never automated. `@sc-<id>` links a scenario to its story.

## The lock

Only the spec editors may change a `.feature` file: add, edit, rename or delete it. They are the people
listed in the `SPEC_EDITORS` repo variable. That includes engineers and their
agents. This stops anyone, human or agent, from "fixing" a failing test by changing the behavior
it describes. Steps, page objects, fixtures and test data are not locked.

GitHub can't stop someone from editing a file on their own branch, so the lock works at merge
time. The **`Feature Spec Lock`** check (`.github/workflows/feature-spec-lock.yaml`) looks at
every commit in the PR that changes a locked file and fails the PR if any of them was authored by
someone else. Nobody has to review anything: when product's spec commit is the only one that
touches `features/`, the check passes by itself.

- **Locked files:** `features/`, this folder's `CLAUDE.md`, the agent guard hook (below), and the
  lock's own workflow and `build/ci/check-feature-spec-lock.sh`, so nobody can quietly switch it off.
- **The check can't be edited by the PR it checks.** It runs on `pull_request_target`, which always
  uses `master`'s copy of the workflow and script.
- **Merging `master` into your branch is fine.** A clean merge adds nothing of its own, so it
  passes. If you edit a locked file _while_ merging (for example when resolving a conflict), that
  edit counts as yours, and the check fails unless you are a spec editor.
- **Every locked file the PR changes must trace back to a commit.** If a change to a locked file
  can't be attributed to one of the PR's commits, the check fails.
- **Don't squash the branch yourself** if it contains a spec editor's commit: that makes you the
  author of their change, and the check fails. GitHub's "Squash and merge" button is fine, because
  the check has already passed by then.
- **If you edited a spec by mistake,** revert that commit (or drop it with a rebase) so no
  commit of yours touches `features/`.
- **Authorship comes from the commit's email.** Anyone can set that, so the check stops mistakes
  and shortcuts, not someone determined to cheat. Setting the repo variable
  `SPEC_LOCK_REQUIRE_SIGNED=true` also requires a verified signature on spec commits, and that the
  commit was _committed_ by a spec editor, since GitHub verifies the signature against the
  committer, not the author. Edits made in GitHub's web editor are signed automatically and pass.

Local git hooks are deliberately not used. They can be bypassed with `--no-verify`.

### The agent guard (local, Claude Code)

The CI check only catches a spec change when the PR is opened. Two things stop an agent earlier, so
it doesn't spend a session "fixing" a story by rewriting it:

- **[`CLAUDE.md`](CLAUDE.md)** in this folder tells agents the specs are a contract they never edit,
  and to stop and explain when a spec looks wrong.
- **A Claude Code hook** (`.claude/hooks/guard-feature-specs.sh`, registered in
  `.claude/settings.json`) blocks the agent's edits to locked files: file edits, and shell commands
  that look like writes (`sed -i`, redirects, `rm`, `mv`, `cp`, `git checkout`/`restore`). Reading
  and running the specs is unaffected.

**Spec editors** turn the hook off for their own sessions. Add this to `.claude/settings.local.json`
(personal, not committed) and restart Claude Code:

```json
{ "env": { "SEFARIA_SPEC_EDITOR": "1" } }
```

This is a speed bump, not security: a person, or a script an agent writes, can still change the
files. The CI check is the real control. Idea from Yotam, 2026-11-17.

**Editing the hook:** run `bash -n .claude/hooks/guard-feature-specs.sh` before saving. A syntax
error makes bash exit with code 2, which Claude Code reads as "block", so a broken hook stops every
agent edit and shell command in the repo until it's fixed.

## Changing a spec (amendments)

Requirements change, and specs turn out ambiguous, wrong or untestable. When that happens:

1. **Ask.** Whoever finds the problem (engineer, QA, product) comments on the Shortcut story:
   which scenario, what is wrong, and the proposed wording. Engineers do not edit the file.
2. **Decide.** A spec editor agrees or declines on the story.
3. **Change.** A spec editor commits the edited `.feature` file themselves, either to the
   engineer's branch or in a separate PR. The commit must be theirs. The `Feature Spec Lock`
   check enforces this.
4. **Record.** Above the changed scenario, add a comment:
   `# Amended 2026-11-16 (sc-12345): <why>, approved by <name>`. Git history and the PR keep the
   rest.

If a scenario cannot be automated yet, a spec editor can tag it `@manual`. The behavior stays
documented and is no longer run.
