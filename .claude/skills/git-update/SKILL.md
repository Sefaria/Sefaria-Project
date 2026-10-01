---
name: git-update
description: |
  Brings the branch checked out in the user's Sefaria-Project folder up to date: downloads from GitHub, merges in the branch's own GitHub copy (like git pull), merges GitHub's master into it, and pushes the branch back to GitHub. On master it only updates master and never pushes. Stops without changing anything if there are uncommitted changes, and undoes a merge that conflicts. Works on Mac/Linux, and on Windows when Claude runs inside WSL (after cauldron-setup). Run at the start of create-cauldron, move-text-to-cauldron, and move-lexicon-to-cauldron. Also use when the user asks to "run git-update" or to "update my branch with master and push it".
---

# Update the current Sefaria-Project branch

This brings the checked-out branch up to date with its copy on GitHub, merges GitHub's `master` into it, and pushes the result. On `master` itself it only updates `master`; it never pushes `master`. It never force-pushes, stashes, resets, or discards anything.

## How to talk to the user

Say nothing while it runs. The only things you say are:
- **Problems**: the one-line messages in Steps 1 and 3.
- **Success**: if another skill ran this one, say nothing and go back to that skill. If the user asked for this skill directly, reply in one line: `<branch> is up to date with master and pushed.` (or `master is up to date.`).

## Step 1 — Find the repo (silent)

Run `cat ~/.sefaria/cauldron-setup.md 2>/dev/null`. The `cauldron-setup` skill writes this file on Windows computers, where Claude runs inside WSL. There is no such file on a Mac.

- **The file exists** → `<Sefaria-Project>` is its `sefaria_project:` value. If `test -d <Sefaria-Project>/.git` fails, say `~/.sefaria/cauldron-setup.md is out of date. Run the cauldron-setup skill again.` and stop.
- **No file** → run `uname -s`.
  - `Darwin` or `Linux` → `<Sefaria-Project>` is `git rev-parse --show-toplevel`.
  - Anything else (`MINGW…`, `MSYS…`, `CYGWIN…`) means Claude is running on plain Windows, not inside WSL. Say this and stop:
    > This has to run in a WSL session. In the Code tab, start a new session, choose your Ubuntu distribution under **WSL** in the environment picker, and open your Sefaria-Project folder there. If you haven't yet, run the `cauldron-setup` skill in that session first.

## Step 2 — Run the update (silent)

Write this to `<scratchpad>/git-update.sh` with the Write tool:

```bash
cd "<Sefaria-Project>" || { echo "GIT_STOP: no-repo"; exit 0; }
branch=$(git branch --show-current)
[ -z "$branch" ] && { echo "GIT_STOP: no-branch"; exit 0; }
# Only edits to files git tracks count; untracked files are left alone (git refuses a merge that would overwrite one).
dirty=$(git status --porcelain --untracked-files=no)
[ -n "$dirty" ] && { echo "GIT_STOP: uncommitted"; echo "$dirty"; exit 0; }
git fetch origin || { echo "GIT_STOP: fetch-failed"; exit 0; }
merge() {
  if ! git merge --no-edit "$1"; then
    echo "GIT_STOP: merge-failed $1"
    git diff --name-only --diff-filter=U
    git merge --abort 2>/dev/null
    exit 0
  fi
}
# Same as "git pull": bring in commits pushed to this branch on GitHub (skipped if it was never pushed).
git rev-parse --verify --quiet "origin/$branch" >/dev/null && merge "origin/$branch"
[ "$branch" = master ] && { echo "GIT_OK: master updated, not pushed"; exit 0; }
merge origin/master
git push -u origin "$branch" || { echo "GIT_STOP: push-failed"; exit 0; }
echo "GIT_OK: $branch updated and pushed"
```

Run it with `bash "<scratchpad>/git-update.sh"`.

## Step 3 — Read the result

`GIT_OK` → success (see "How to talk to the user").

`GIT_STOP` → tell the user in one line. If another skill ran this one, that skill stops too.
- `no-repo` → `Couldn't find Sefaria-Project at <path>.`
- `no-branch` → `You're not on a branch. Check one out, then try again.`
- `uncommitted` → `You have uncommitted changes in <files>. Commit or discard them, then try again.`
- `fetch-failed` → `Couldn't download from GitHub: <git's last error line>.`
- `merge-failed origin/<x>` with file names after it → `Merging <x> into <branch> conflicts in <files>. I undid that merge. Resolve it yourself, then try again.` With no file names, git refused before starting: `Couldn't merge <x> into <branch>: <git's last error line>.`
- `push-failed` → `Merged master into <branch>, but couldn't push it to GitHub: <git's last error line>.`
