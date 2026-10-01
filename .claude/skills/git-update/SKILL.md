---
name: git-update
description: |
  Makes sure that the branch checked out in the user's Sefaria-Project folder is up to date: downloads from GitHub, merges in the branch's own GitHub copy (like git pull), merges GitHub's master into it, and pushes the branch back to GitHub. On master it only updates master and never pushes. Stops without changing anything if there are uncommitted changes, and undoes a merge that conflicts. Works on Mac/Linux, and on Windows when Claude runs inside WSL. (The WSL case assumes that `cauldron-setup` has already been run.) Run this skill at the start of create-cauldron, move-text-to-cauldron, and move-lexicon-to-cauldron. Also use when the user asks to "run git-update" or to "update my branch with master and push it".
---

# Update the current Sefaria-Project branch

This makes the checked-out branch up to date with its copy on GitHub, merges GitHub's `master` into it, and pushes the result. On `master` itself it only updates `master`; it never pushes `master`. It never force-pushes, stashes, resets, or discards anything.

## How to talk to the user

Say nothing while it runs. The only things you say are:
- **Problems**: the one-line messages in Steps 1 and 3.
- **Success**: if another skill ran this one, say nothing and go back to that skill. If the user asked for this skill directly, reply in one line: `<branch> is up to date with master and pushed.` (or `master is up to date.`).

## Step 1 — Find the repo (silent)

Run `cat ~/.sefaria/cauldron-setup.md 2>/dev/null`. The `cauldron-setup` skill writes the file cauldron-setup.md on Windows computers, where Claude runs inside WSL. There is no such file on a Mac.

- **The file exists** → `<Sefaria-Project>` is cauldron-setup.md's `sefaria_project:` value. If `test -d <Sefaria-Project>/.git` fails, say `~/.sefaria/cauldron-setup.md is out of date. Run the cauldron-setup skill again.` and stop.
- **No file** → run `uname -s`.
  - `Darwin` or `Linux` → `<Sefaria-Project>` is `git rev-parse --show-toplevel`.
  - Anything else (`MINGW…`, `MSYS…`, `CYGWIN…`) means Claude is running on plain Windows, not inside WSL. Say this and stop:
    > This has to run in a WSL session. In the Code tab, start a new session, choose your Ubuntu distribution under **WSL** in the environment picker, and open your Sefaria-Project folder there. If you haven't yet, run the `cauldron-setup` skill in that session first.

## Step 2 — Run the update (silent)

The script is `git-update.sh` in this skill's folder (`<Sefaria-Project>/.claude/skills/git-update/`). Copy it to the scratchpad and run the copy, because merging master can change the original while it runs:

```bash
cp "<Sefaria-Project>/.claude/skills/git-update/git-update.sh" "<scratchpad>/git-update.sh" && bash "<scratchpad>/git-update.sh" "<Sefaria-Project>"
```

Don't copy the script's commands into this file: Claude Code replaces `$` followed by a digit in a SKILL.md with the words typed after the skill's name, which would break them.

## Step 3 — Read the result

`GIT_OK` → success (see "How to talk to the user").

`GIT_STOP` → tell the user in one line. If another skill ran this one, that skill stops too.
- `no-repo` → `Couldn't find Sefaria-Project at <path>.`
- `no-branch` → `You're not on a branch. Check one out, then try again.`
- `uncommitted` → `You have uncommitted changes in <files>. Commit or discard them, then try again.`
- `fetch-failed` → `Couldn't download from GitHub: <git's last error line>.`
- `merge-failed origin/<x>` with file names after it → `Merging <x> into <branch> conflicts in <files>. I undid that merge. Resolve it yourself, then try again.` With no file names, git refused before starting: `Couldn't merge <x> into <branch>: <git's last error line>.`
- `push-failed` → `Merged master into <branch>, but couldn't push it to GitHub: <git's last error line>.`
