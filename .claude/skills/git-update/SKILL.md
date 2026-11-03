---
name: git-update
description: |
  Makes sure that the branch checked out in the user's Sefaria-Project folder is up to date: downloads from GitHub, merges in the branch's own GitHub copy (like git pull), merges GitHub's master into it, and pushes the branch back to GitHub. On master it only updates master and never pushes. Also puts the user's cauldrons folder on its main branch and pulls GitHub's main into it (never pushes). Stops without changing anything if there are uncommitted changes, and undoes a merge that conflicts. Works on Mac/Linux, and on Windows when Claude runs inside WSL. (The WSL case assumes that `cauldron-setup` has already been run.) Run this skill at the start of create-cauldron, move-text-to-cauldron, and move-lexicon-to-cauldron. Also use when the user asks to "run git-update" or to "update my branch with master and push it".
---

# Update the current Sefaria-Project branch and the cauldrons folder

This updates two folders:

- **Sefaria-Project**: makes the checked-out branch up to date with its copy on GitHub, merges GitHub's `master` into it, and pushes the result. On `master` itself it only updates `master`; it never pushes `master`.
- **cauldrons**: switches to its `main` branch if another branch is checked out, then pulls GitHub's `main` into it. It never pushes.

It never force-pushes, stashes, resets, or discards anything.

## How to talk to the user

Say nothing while it runs. The only things you say are:
- **Problems**: the one-line messages in Steps 1, 3 and 5.
- **Switched branch**: if the cauldrons result says `switched from <x>`, say `Switched your cauldrons folder from <x> to main.`
- **Success**: if another skill ran this one, say nothing more and go back to that skill. If the user asked for this skill directly, reply in one line: `<branch> is up to date with master and pushed, and cauldrons is up to date.` (or `master is up to date, and cauldrons is up to date.`).

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

## Step 3 — Read the Sefaria-Project result

`GIT_OK` → go on to Step 4.

`GIT_STOP` → tell the user in one line and stop; skip the cauldrons steps. If another skill ran this one, that skill stops too.
- `no-repo` → `Couldn't find Sefaria-Project at <path>.`
- `no-branch` → `You're not on a branch. Check one out, then try again.`
- `uncommitted` → `You have uncommitted changes in <files>. Commit or discard them, then try again.`
- `fetch-failed` → `Couldn't download from GitHub: <git's last error line>.`
- `merge-failed origin/<x>` with file names after it → `Merging <x> into <branch> conflicts in <files>. I undid that merge. Resolve it yourself, then try again.` With no file names, git refused before starting: `Couldn't merge <x> into <branch>: <git's last error line>.`
- `push-failed` → `Merged master into <branch>, but couldn't push it to GitHub: <git's last error line>.`

## Step 4 — Update the cauldrons folder (silent)

Find `<cauldrons>`:
- If `~/.sefaria/cauldron-setup.md` exists (Step 1), it's that file's `cauldrons_repo:` value.
- Otherwise it's the folder next to Sefaria-Project: `<Sefaria-Project>/../cauldrons`.

Run the script from the scratchpad copy of this skill's folder, the same way as Step 2:

```bash
cp "<Sefaria-Project>/.claude/skills/git-update/cauldrons-update.sh" "<scratchpad>/cauldrons-update.sh" && bash "<scratchpad>/cauldrons-update.sh" "<cauldrons>"
```

## Step 5 — Read the cauldrons result

`CAULDRONS_OK` → success (see "How to talk to the user").

`CAULDRONS_STOP` → tell the user in one line:
- `not-found` → with a setup file: `Couldn't find your cauldrons folder at <cauldrons>. Run the cauldron-setup skill again.` Without one: `Couldn't find your cauldrons folder at <cauldrons>.`
- `uncommitted` → `Your cauldrons folder has uncommitted changes in <files>, so I didn't update it. Commit or discard them, then try again.`
- `fetch-failed` → `Couldn't download cauldrons from GitHub: <git's last error line>.`
- `checkout-failed <x>` → `Couldn't switch your cauldrons folder from <x> to main: <git's last error line>.`
- `merge-failed` with file names after it → `Pulling GitHub's main into your cauldrons main conflicts in <files>. I undid that merge. Resolve it yourself, then try again.` With no file names, git refused before starting: `Couldn't pull GitHub's main into your cauldrons main: <git's last error line>.`

Whether a cauldrons problem stops anything depends on who ran this skill:
- **`create-cauldron` ran it** → this skill has stopped, so `create-cauldron` stops too (it needs an up-to-date cauldrons folder).
- **Anyone else** (`move-text-to-cauldron`, `move-lexicon-to-cauldron`, or the user directly) → the one-line message is only a warning. Sefaria-Project's result is what counts: if it was `GIT_OK`, this skill succeeded, and a calling skill goes on as usual. When the user ran this skill directly, give the warning line and then `<branch> is up to date with master and pushed.` (or `master is up to date.`).
