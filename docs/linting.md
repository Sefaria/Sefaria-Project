# Linting & Formatting — Engineer Guide

Sefaria uses automated linters and formatters for Python, JavaScript, and SCSS so that style is never debated in code
review and common bugs are caught before merge.

| Language         | Linter                               | Formatter     | Config                                  |
| ---------------- | ------------------------------------ | ------------- | --------------------------------------- |
| Python           | [Ruff](https://docs.astral.sh/ruff/) | `ruff format` | `pyproject.toml`                        |
| JavaScript / JSX | ESLint 9 (flat config)               | Prettier      | `eslint.config.mjs`, `.prettierrc.json` |
| SCSS             | Stylelint (`standard-scss`)          | Prettier      | `.stylelintrc.json`                     |
| Markdown / JSON  | —                                    | Prettier      | `.prettierrc.json`                      |

Files that are never linted (build output, vendored libraries, migrations, lockfile) are listed in `.prettierignore`
and in the `ignores` / `exclude` sections of the ESLint, Stylelint and Ruff configs.

## One-time setup

```bash
# JS/CSS tooling + git hooks (husky is installed by the `prepare` script)
npm install

# Python tooling (ruff is pinned in requirements.txt) — inside your virtualenv
pip install -r requirements.txt   # or just: pip install ruff==0.17.0

# Make `git blame` skip the one-time bulk-formatting commit(s)
git config blame.ignoreRevsFile .git-blame-ignore-revs
```

Node 18.18+ is required for ESLint 9 (CI lints with Node 20).

## What happens when you commit

`.husky/pre-commit` runs automatically on `git commit`:

1. `npm run scss-compile` — recompiles SCSS (pre-existing behavior).
2. `lint-staged` — on **staged files only**:
   - `static/js/**/*.{js,jsx}` → `prettier --write`, then `eslint --max-warnings=0`
   - `static/css/**/*.scss` → `prettier --write`, then `stylelint --max-warnings=0`
   - `**/*.{json,md}` → `prettier --write`
3. Ruff on staged `.py` files: `ruff check --fix`, `ruff format`, then re-stages the files.
   If `ruff` is not on your `PATH` the hook prints a warning and **skips** Python linting (CI will still catch it).

If the hook fails, the commit is aborted. Fix what it reports (many things are auto-fixed and re-staged), then commit
again. Avoid `--no-verify`; CI runs the same checks and will fail the PR.

> Heads-up: because the hook rewrites staged files, partially staged files (`git add -p`) will have their unstaged hunks
> staged too after a Python commit. Stage whole files when committing Python.

The existing conventional-commit message hook in `.githooks/commit-msg` is unchanged.

## What happens in CI

`.github/workflows/linting.yaml` runs on every non-draft PR and on pushes to `master` (and manually via
_Run workflow_). Four independent jobs:

| Job                         | Command                                             |
| --------------------------- | --------------------------------------------------- |
| Lint: Python (Ruff)         | `ruff check` + `ruff format --check`                |
| Lint: JavaScript (ESLint)   | `eslint 'static/js/**/*.{js,jsx}' --max-warnings=0` |
| Lint: CSS/SCSS (Stylelint)  | `stylelint 'static/css/**/*.scss' --max-warnings=0` |
| Lint: Formatting (Prettier) | `prettier --check` on JS/JSX, SCSS and Markdown     |

Warnings fail the build (`--max-warnings=0`). Reproduce a failure locally with the commands below.

## Everyday commands

```bash
# Check everything (same as CI)
npm run lint            # ESLint + Stylelint + Prettier check
npm run lint:py         # ruff check + ruff format --check

# Fix everything that can be fixed automatically
npm run lint:fix        # JS, SCSS, Prettier, and Python
npm run lint:fix:py     # Python only  (ruff check --fix && ruff format)
npm run lint:fix:js     # ESLint --fix
npm run lint:fix:css    # Stylelint --fix
npm run format          # Prettier --write

# Just the files you touched
ruff check --fix path/to/file.py && ruff format path/to/file.py
npx eslint --fix static/js/MyComponent.jsx
npx prettier --write static/js/MyComponent.jsx
```

Editor integration (recommended): install the Ruff, ESLint, Prettier and Stylelint extensions for VS Code / PyCharm and
enable format-on-save. They read the same config files, so results match the hooks and CI.

## Working with the rules

- **Rules are deliberately lenient for legacy code.** `pyproject.toml` and `eslint.config.mjs` contain long `ignore` /
  `"off"` lists, each with a comment explaining why. These are _deferred_, not _approved_ — see below.
- **Suppress a single occurrence** only with a reason:
  - Python: `x = foo()  # noqa: B006 — reason`
  - JS: `// eslint-disable-next-line react-hooks/exhaustive-deps -- reason`
  - SCSS: `// stylelint-disable-next-line <rule> -- reason`
- **Do not fix unrelated lint in a feature PR.** Keep diffs reviewable. Fix lint only in the lines you touch, and put
  broader cleanups in a dedicated `chore:`/`style:` PR.
- **Tightening a deferred rule** (e.g. enabling `no-unused-vars`): remove it from the ignore list in a PR that also fixes
  all resulting violations (use `ruff check --select RULE --statistics` / `eslint --rule` to size it first).
- **Adding a rule**: same process — land config and fixes together so `master` always passes CI.
- **Django migrations** are excluded from formatting (`.prettierignore`) and relaxed in Ruff `per-file-ignores`; don't
  reformat them.

## Git blame

The initial repo-wide formatting commit(s) touch nearly every line. Their SHAs are listed in `.git-blame-ignore-revs`.
GitHub honors this file automatically; locally run `git config blame.ignoreRevsFile .git-blame-ignore-revs` once.

## Merging a long-lived branch that predates the linting rollout

See [`docs/runbooks/linting-rollout.md`](runbooks/linting-rollout.md#updating-an-open-branch-after-the-rollout).

## Troubleshooting

| Symptom                                             | Fix                                                                          |
| --------------------------------------------------- | ---------------------------------------------------------------------------- |
| `ruff not found — Python linting skipped`           | Activate your venv or `pip install ruff==0.17.0`.                            |
| ESLint: `Cannot find module '@eslint/js'`           | Run `npm install` (new devDependencies).                                     |
| ESLint requires newer Node                          | Use Node 18.18+ (`nvm install 20`).                                          |
| Pre-commit hook doesn't run                         | `npm install` (runs `husky install`), and check `git config core.hooksPath`. |
| CI Prettier job fails on a Markdown file            | `npx prettier --write path/to/file.md`.                                      |
| `'Foo' is not defined` for a Django-injected global | Add it to `sefariaGlobals` in `eslint.config.mjs`.                           |
