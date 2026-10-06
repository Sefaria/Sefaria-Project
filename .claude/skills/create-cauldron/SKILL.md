---
name: create-cauldron
description: |
  Creates a new Sefaria cauldron (a temporary test copy of the Sefaria site) with default settings, running the branch currently checked out in the user's Sefaria-Project folder, under a name the user chooses. Wraps create-cauldron.sh from the Sefaria/cauldrons repo and adds safety checks first (branch pushed, CI images built, name not already taken), opening a draft PR for the branch if it has none. Requires the cauldron-setup skill to have been run first (on a Mac, on Linux, or on Windows inside WSL); stops if ~/.sefaria/cauldron-setup.md is missing. Use when the user asks to "create a cauldron", "spin up a cauldron for my branch", "make a new cauldron called X", or mentions create-cauldron.sh.
---

# Create a cauldron for the current Sefaria-Project branch

This skill runs `create-cauldron.sh` from the `Sefaria/cauldrons` repo as `./create-cauldron.sh -n <name> -b <branch>` — nothing else. Every other setting stays at its default:

- the database is a fresh copy of **today's production backup**,
- the latest Helm chart (the template that describes how a cauldron is set up),
- the cauldron **follows the branch**: each new build of the branch is deployed to it automatically,
- no custom secrets, no linker/GPU server, no background task workers.

If the user wants any non-default option (pin to a commit, a different database backup, `--dryrun`, `--linker`, `--tasks`, `--secret`, …), tell them this skill only makes default cauldrons, and show them the `create-cauldron.sh --help` usage so they can run it themselves.

## Before anything else — run git-update

Run the `git-update` skill first, before any other step. If it stops, stop this skill too. If it succeeds, go on to the rest of this skill without saying anything.

## What the script actually does (explain this to the user before running it)

It doesn't talk to the cluster directly. It writes a small config file named `<name>.yaml`, **commits it, and pushes it straight to the `main` branch of the shared `Sefaria/cauldrons` GitHub repo**, under the user's GitHub identity. A deployment tool running in the cluster (Flux) watches that repo and builds the cauldron from the file within a few minutes. So:
- the push is visible to the whole team and takes effect by itself — there is no review step,
- if a `<name>.yaml` already exists, the script **overwrites it**, replacing someone else's cauldron — Step 4 prevents that,
- the cauldron runs the Docker images CI built for the branch; if none exist, the cauldron is created but has nothing to run — Step 3 checks this.

## Rules

- Get an explicit "yes" from the user after showing the Step 5 summary, before running the script. Never run it otherwise.
- Never use `--force`, never edit or delete other cauldrons' files, and never run `delete-cauldron.sh` or `repoint-cauldron.sh`.
- If the local `cauldrons` checkout has uncommitted changes, stop and ask — don't stash, reset, or discard anything.

## Step 1 — Read the setup file

Run `cat ~/.sefaria/cauldron-setup.md 2>/dev/null`. The `cauldron-setup` skill writes this file (on a Mac, on Linux, and on Windows inside WSL). It is the only place this skill takes locations from; there is no fallback. (`git-update` has already stopped if the file is missing, so this is a safety net.)

- **No file** → say `The cauldron skills aren't set up on this computer yet. Run the cauldron-setup skill first.` and stop.
- **The file exists** → take from it:
  - `<Sefaria-Project>` = `sefaria_project:`. If `test -d <Sefaria-Project>/.git` fails, say `~/.sefaria/cauldron-setup.md is out of date. Run the cauldron-setup skill again.` and stop.
  - the cauldrons folder = `cauldrons_repo:`. If it says `not found`, or `test -f <cauldrons_repo>/create-cauldron.sh` fails, say the same "out of date" line and stop.
  - `can_push_cauldrons:` and `github_user:`, for Step 5.

Then check that `gh` still works, since the file may be stale: `gh auth status`. If `gh` is missing or not logged in (Step 3 needs it), say `The GitHub tool isn't logged in. Run the cauldron-setup skill again.` and stop.

## Step 2 — Name and branch

**Branch:** `git -C <Sefaria-Project> branch --show-current`. If empty (the checkout isn't on a branch), stop and tell the user to check out the branch they want.

**Name:** ask the user for the cauldron name (unless given). Clean it up the way the script does: lowercase it, then keep only `a-z`, `0-9` and `-` (the script would also keep `.`, but a dot would add an extra level to the web address, so remove dots too). It must be 1–63 characters. If cleaning changed the name, show the user the result and confirm.

The cauldron's address will be `https://www.<name>.cauldron.sefaria.org`.

**Image name:** work out which set of Docker images the cauldron will use — the script's own rule:

```bash
echo "<branch>" | tr 'A-Z' 'a-z' | sed -e 's|.*/\([^/]*\)/.*|\1|' -e 'tx' -e 's/\(.*\)/\1/' -e ':x' | sed 's/[^a-z0-9\.\-]//g'
```

For a Shortcut-style branch like `feature/sc-12345/some-name` this gives `sc-12345`.

(The script lowercases with `awk`; this uses `tr`, which gives the same result, because Claude Code replaces `$` followed by a digit in a SKILL.md with the words typed after the skill's name, and the `awk` version needs one.)

## Step 3 — Is the branch ready to run in a cauldron?

Run these checks in Sefaria-Project and report each result in plain words:

1. **Uncommitted changes** — `git status --porcelain`. If there are any, warn: the cauldron only runs what is pushed to GitHub, so these edits won't be in it. (Warning only.)
2. **Branch exists on GitHub** — `git ls-remote --heads origin <branch>`. If empty, stop: the branch has never been pushed. Offer to push it (`git push -u origin <branch>`) — ask first.
3. **Latest commits pushed** — compare `git rev-parse HEAD` with the commit from check 2. If they differ, warn that the cauldron will run the older, pushed version; offer to push — ask first.
4. **Docker images get built** — Sefaria-Project's CI (`.github/workflows/continuous.yaml`) only builds cauldron images for `master` and for branches with an **open pull request**. Unless the branch is `master`, check:
   ```bash
   gh pr list --repo Sefaria/Sefaria-Project --head "<branch>" --state open --json number,url,isDraft
   gh run list --repo Sefaria/Sefaria-Project --branch "<branch>" --workflow continuous.yaml --limit 1 --json status,conclusion,headSha,createdAt
   ```
   - No open PR (the list above includes drafts, so "none" means neither kind) → open a **draft** PR without asking, so CI builds the images:
     ```bash
     gh pr create --repo Sefaria/Sefaria-Project --draft --base master --head "<branch>" --title "<branch>" --body "Draft PR opened so CI builds cauldron images."
     ```
     Tell the user in one line: `Opened draft PR: <link>`. Opening it starts the image build, which usually takes several minutes; the cauldron picks up the images when the build finishes, so it's fine to go ahead. If `gh pr create` fails, show its last error line and warn clearly: the cauldron will be created but won't start, because no images exist.
   - PR exists but the latest `Continuous` run is still in progress → the cauldron will pick up the images when the build finishes; fine to go ahead.
   - Latest run failed → warn that there may be no usable images; let the user decide.

## Step 4 — Get the cauldrons repo ready, and check the name is free

The script refuses to run unless the local `main` branch of the cauldrons repo is exactly the same as GitHub's. In the cauldrons folder:

```bash
git status --porcelain            # must be empty — otherwise stop and ask (see Rules)
git fetch origin
git branch --show-current         # which branch is checked out
```

- If `main` is checked out: `git merge --ff-only origin/main`
- If another branch is checked out: `git fetch origin main:main` (updates `main` without switching branches)

If either command fails, stop and show the error — don't force anything.

`create-cauldron.sh` reads the file `.git/refs/heads/main` directly instead of asking git. Git's automatic cleanup sometimes moves that file's contents into `.git/packed-refs` and deletes it; the script then always says "Not running on tip of main", and the commands above don't bring the file back when `main` is already up to date. So check it:

```bash
test -f .git/refs/heads/main && echo "ok" || echo "missing"
```

If it says `missing`, recreate it from what git already knows (this writes the same commit `main` already points to, so nothing about the branch changes):

```bash
sha=$(git rev-parse --verify refs/heads/main) && [ -n "$sha" ] && echo "$sha" > .git/refs/heads/main.tmp && mv .git/refs/heads/main.tmp .git/refs/heads/main && [ "$(cat .git/refs/heads/main)" = "$(git rev-parse origin/main)" ] && echo "ok"
```

Look up the commit first and write the file only after that succeeds. Never write it as `git rev-parse ... > .git/refs/heads/main`: the shell empties the file before git runs, git then sees an empty `main` and fails, and the empty file is left behind, hiding `main`'s real commit. If the command doesn't print `ok`, stop and show the error.

Then check that no cauldron already uses the name:

```bash
git cat-file -e "origin/main:<name>.yaml" 2>/dev/null && echo "TAKEN" || echo "free"
```

If it's taken, stop: running the script would overwrite that cauldron. Show the first lines of that file (`git show origin/main:<name>.yaml | head -12`, which include who created it and when) and ask the user for a different name.

## Step 5 — Show the plan and confirm

Tell the user, in plain words:
- Cauldron name and address: `https://www.<name>.cauldron.sefaria.org`
- Branch it will follow: `<branch>` (images: `sefaria-*-<imagename>`)
- Database: a fresh copy of today's production backup
- Results of the Step 3 checks, especially any warnings, and the draft PR's link if Step 3 opened one
- That this pushes a commit to `main` of the shared `Sefaria/cauldrons` repo, under their GitHub account, and the cauldron then deploys automatically
- If the setup file said `can_push_cauldrons: no` (or `unknown`): a warning that their GitHub account may not be allowed to push to `Sefaria/cauldrons`, so the push will probably fail until the engineering team grants write access
- The exact command: `./create-cauldron.sh -n <name> -b <branch>`

Wait for an explicit yes.

## Step 6 — Run it

From the cauldrons folder:

```bash
./create-cauldron.sh -n "<name>" -b "<branch>"
```

The script clones a fresh copy of the cauldrons repo into a temporary folder, downloads a small helper tool (`yq`), writes the files, commits, and pushes. Read the output:
- `Not running on tip of main, please pull before running script` → Step 4 didn't take; redo it, including the `.git/refs/heads/main` check.
- A `git push` error such as `403` / `Permission denied` → the user's GitHub account can't push to `Sefaria/cauldrons`; they need write access from the engineering team.

The script doesn't stop on every error, so confirm the push really happened:

```bash
git fetch origin && git cat-file -e "origin/main:<name>.yaml" && echo "pushed"
```

Then fast-forward the local `main` again (same command as Step 4) so the next run starts clean.

## Step 7 — Tell the user what happens next

- Flux notices the new file within about 5 minutes, then installs the cauldron. The first install also copies the full production database, so it can take a while longer — the deployment is allowed up to 30 minutes before it counts as failed.
- To check whether it's up (read-only):
  ```bash
  curl -s -o /dev/null -w "%{http_code}\n" --max-time 30 "https://www.<name>.cauldron.sefaria.org/api/v2/raw/index/Genesis"
  ```
  `200` means it's serving. Offer to check again in a few minutes.
- If the user has `kubectl` connected to the development cluster, `kubectl get helmrelease <name>` shows the install status (`READY True` = done). If it fails, `kubectl describe helmrelease <name>` explains why.
- New pushes to `<branch>` (with an open PR) are deployed to the cauldron automatically after CI builds them.
- To copy local content into it, use the `move-text-to-cauldron` or `move-lexicon-to-cauldron` skill.
- This skill doesn't delete cauldrons. When it's no longer needed, the user can run `./delete-cauldron.sh -n <name>` in the cauldrons repo themselves.
