# Runbook: Linting Rollout (one-time bulk cleanup)

This branch adds linting **configuration only** — no source files were reformatted. This runbook describes how to bring
the whole codebase up to the new standard on this branch, before merging. Day-to-day usage afterwards is described in
[`docs/linting.md`](../linting.md).

## What this branch contains

- `pyproject.toml` — Ruff lint + format config (`ruff==0.17.0` pinned in `requirements.txt`)
- `eslint.config.mjs`, `.prettierrc.json`, `.prettierignore`, `.stylelintrc.json`
- `package.json` — `lint*`, `lint:fix*`, `format` scripts, `lint-staged` config, new devDependencies (+ lockfile)
- `.husky/pre-commit` — lint-staged + Ruff on staged files
- `.github/workflows/linting.yaml` — four CI jobs
- `.git-blame-ignore-revs` — placeholder for the bulk-fix commit SHAs
- `docs/linting.md`, this runbook

CI on this branch's PR **will fail** until the bulk cleanup below has been committed. That is expected.

## Baseline (measured on `master` @ `94f7ada05`, read-only, before any fixes)

| Tool                                | Result                                                                  |
| ----------------------------------- | ----------------------------------------------------------------------- |
| `ruff check .`                      | 25,024 violations, 21,868 auto-fixable (397 more need `--unsafe-fixes`) |
| `ruff format --check .`             | 774 files would be reformatted (175 already formatted)                  |
| `eslint 'static/js/**/*.{js,jsx}'`  | 753 errors, 5 warnings, 121 auto-fixable, across 255 files              |
| `stylelint 'static/css/**/*.scss'`  | 109 errors                                                              |
| `prettier --check` (JS/JSX/SCSS/MD) | 350 files differ                                                        |

Top Ruff rules: `Q000` quotes (17.5k), `W191` tab indentation (2.5k), `UP032` f-strings (963), `I001` import order (872),
`UP009`, `UP006`, `RET505`, `UP045`, `W292`, `UP004`, `E701` (144), `UP008`. Numbers will shift slightly as `master` moves —
re-measure at the start of the run.

## Prerequisites

```bash
git checkout <this-branch> && git pull
git merge origin/master            # bring in latest master FIRST, so the lint run covers current code
npm ci                             # Node 18.18+ (use 20)
pip install -r requirements.txt    # or: pip install ruff==0.17.0
ruff --version                     # must print 0.17.0
```

Make sure the working tree is clean (`git status`) and the app's test suite passes before you start, so any later
failure is attributable to the lint changes.

**Freeze merges to `master`** from kickoff until this PR merges (announce in Slack). Anything merged in the meantime
must be re-linted.

## Step 1 — Automated fixes (one commit per tool)

Keep each tool in its own commit so reviewers can skim, bisect, and revert independently. Use `--no-verify` for these
bulk commits only (the pre-commit hook would re-run on thousands of files); the commit-message format still applies
(`style:`/`chore:`).

```bash
# 1a. Python — safe fixes, then formatter
ruff check --fix .
ruff format .
git add -A && git commit --no-verify -m "style(python): apply ruff safe fixes and formatting"

# 1b. JavaScript — eslint fixes, then prettier
npx eslint 'static/js/**/*.{js,jsx}' --fix
npx prettier --write 'static/js/**/*.{js,jsx}'
git add -A && git commit --no-verify -m "style(js): apply eslint fixes and prettier formatting"

# 1c. SCSS — stylelint fixes, then prettier
npx stylelint 'static/css/**/*.scss' --fix
npx prettier --write 'static/css/**/*.scss'
npm run scss-compile            # regenerate the committed compiled CSS from the reformatted SCSS
git add -A && git commit --no-verify -m "style(css): apply stylelint fixes and prettier formatting"

# 1d. Markdown / JSON
npx prettier --write '**/*.md'
git add -A && git commit --no-verify -m "style(docs): prettier formatting for markdown"
```

Notes:

- Do **not** use `--unsafe-fixes` blindly. Review the 397 unsafe Ruff fixes by category with
  `ruff check . --unsafe-fixes --diff | less` and apply per rule (`ruff check --select RULE --fix --unsafe-fixes .`)
  only for rules you've read through.
- `static/css/*.css` is committed compiled output. Check that `npm run scss-compile` didn't produce unexpected
  large diffs beyond whitespace.
- After 1a, spot-check that Python whitespace-only changes didn't touch multiline strings that are data (e.g. test
  fixtures, regexes, templates). `git diff -w --stat` vs `git diff --stat` highlights files with non-whitespace changes.

## Step 2 — Verify the automated pass didn't change behavior

```bash
# Python: byte-code equivalence is not guaranteed, so run the suite
python manage.py check
pytest sefaria reader sso powered_by          # same set as build/ci/createJobFromRollout.sh
# JS
npm run build                       # full webpack build (client + server bundles)
npm run jest-travis                 # one-shot jest run (`npm run jest` is watch mode)
```

Also run the app locally and click through reader, sheets, topics, and search. If you have a local stack, run the
Playwright sanity suite (`npm run test:sanity`). Compare to the pre-lint run, not to an idealized green.

## Step 3 — What remains: AI-agent-assisted fixes

Check what the autofixers could not resolve:

```bash
ruff check . --statistics                                   # remaining Python
ruff check . --output-format=concise > /tmp/ruff-remaining.txt
npx eslint 'static/js/**/*.{js,jsx}' -f unix > /tmp/eslint-remaining.txt
npx stylelint 'static/css/**/*.scss' -f unix > /tmp/stylelint-remaining.txt
```

Group remaining violations **by rule, then by directory** and hand each group (not each file) to an agent. Run agents
in parallel only on disjoint directories. Suggested prompt skeleton:

> You are fixing lint violations in the Sefaria codebase. Rule: `<RULE>`. Files: `<directory>`.
> List of violations: `<paste concise output for that rule+directory>`.
> Constraints: change behavior in **no** way; make the minimal edit that satisfies the rule; do not touch other rules'
> violations; do not reformat unrelated lines; do not edit files outside `<directory>`; do not edit config files.
> If a fix is not clearly behavior-preserving (e.g. changing exception handling, mutable default args that are relied
> upon, shadowed builtins used elsewhere), leave the line and add it to a `SKIPPED.md` list with the reason.
> After editing run `ruff check <files>` (or `npx eslint <files>`) and the nearest tests.

Guidance for typical leftovers:

| Rule family                           | Approach                                                                                            |
| ------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `W191` tabs, `E701`/`E702` one-liners | Formatter handles most; remaining are in files with syntax issues — fix by hand.                    |
| `B006` mutable default args           | Replace with `None` + in-body default **only after** checking callers don't depend on shared state. |
| `F811`, `F821`, `F841`                | Real bugs or dead code — human review; don't blindly delete.                                        |
| `no-undef` (ESLint)                   | Usually a Django-injected global → add to `sefariaGlobals`; otherwise a real bug.                   |
| `react-hooks/rules-of-hooks`          | Real bug risk — human review.                                                                       |
| `SIM`, `C4`, `RET` leftovers          | Safe for agents; keep one rule per commit.                                                          |

Anything an agent can't or shouldn't fix: **either** add a targeted `# noqa: CODE — reason` /
`// eslint-disable-next-line rule -- reason`, **or** add the rule to the `ignore` list (with a comment) in the config.
The goal of this PR is a green CI on `master`, not zero deferred rules — the ignore lists are the tracked backlog.

Commit agent work in small, reviewable commits (`style(python): fix B006 in sefaria/model`) and have a human skim
every diff.

## Step 4 — Final verification

```bash
npm run lint && npm run lint:py     # must exit 0 — this is exactly what CI runs
git status                           # clean
```

Re-run Step 2 (tests + build + manual smoke test). Then push and confirm all four **Linting** CI jobs and the existing
`continuous` pipeline (sandbox pytest + selenium) pass.

## Step 5 — Record the bulk commits for `git blame`

After the cleanup commits exist:

```bash
git log --format='%H # %s' <merge-base-with-master>..HEAD --grep='^style' >> .git-blame-ignore-revs
```

Edit `.git-blame-ignore-revs` so only full SHAs and `#` comments remain, commit it
(`chore: record bulk lint commits in .git-blame-ignore-revs`). **Merge with a merge commit or rebase-and-merge — not
squash**, otherwise the SHAs recorded here won't exist on `master`. (If squash is unavoidable, merge, then add the
resulting single SHA to the file in a follow-up commit.) Remind engineers to run
`git config blame.ignoreRevsFile .git-blame-ignore-revs`.

## Step 6 — Merge & announce

1. Re-merge `origin/master` one last time; if new/changed files appeared, run `npm run lint:fix` and re-verify.
2. Merge, then lift the merge freeze.
3. Announce in Slack: link to [`docs/linting.md`](../linting.md); everyone should run `npm install` and
   `pip install -r requirements.txt` after pulling, and configure editor integrations.
4. Consider marking the four **Linting** jobs as required status checks in GitHub branch protection for `master`.

## Updating an open branch after the rollout

Engineers with in-flight branches will hit conflicts on reformatted lines. Recommended recipe (in the branch):

```bash
git fetch origin
# 1. Take your branch's version of files you changed, re-applying formatting on top of YOUR code
git merge origin/master            # resolve conflicts preferring YOUR side ("ours") for content
npm run lint:fix                   # reformat your files with the new rules
git add -A && git commit -m "style: apply repo linting to branch"
```

For heavy conflicts, an alternative is to merge the **commit before** the bulk-cleanup into your branch, run the
formatters on your branch (`npm run lint:fix`), and then merge `master`: Git will see identical formatting on both sides
and the conflicts largely disappear.

## Rollback

The cleanup is split into tool-specific `style:` commits. If one tool's pass causes problems, `git revert <sha>` that
commit (CI will fail until the config is also relaxed for that tool). To disable CI enforcement entirely and quickly,
disable the **Linting** workflow in GitHub Actions; the pre-commit hook can be bypassed locally with `--no-verify`.
