---
name: create-cauldron
description: |
  Creates a new Sefaria cauldron (a temporary test copy of the Sefaria site) with default settings, running the branch currently checked out in the user's Sefaria-Project folder, under a name the user chooses. Wraps create-cauldron.sh from the Sefaria/cauldrons repo and adds safety checks first (branch pushed, CI images built, name not already taken). Use when the user asks to "create a cauldron", "spin up a cauldron for my branch", "make a new cauldron called X", or mentions create-cauldron.sh.
---

# Create a cauldron for the current Sefaria-Project branch

This skill runs `create-cauldron.sh` from the `Sefaria/cauldrons` repo as `./create-cauldron.sh -n <name> -b <branch>` — nothing else. Every other setting stays at its default:

- the database is a fresh copy of **today's production backup**,
- the latest Helm chart (the template that describes how a cauldron is set up),
- the cauldron **follows the branch**: each new build of the branch is deployed to it automatically,
- no custom secrets, no linker/GPU server, no background task workers.

If the user wants any non-default option (pin to a commit, a different database backup, `--dryrun`, `--linker`, `--tasks`, `--secret`, …), tell them this skill only makes default cauldrons, and show them the `create-cauldron.sh --help` usage so they can run it themselves.

## What the script actually does (explain this to the user before running it)

It doesn't talk to the cluster directly. It writes a small config file named `<name>.yaml`, **commits it, and pushes it straight to the `main` branch of the shared `Sefaria/cauldrons` GitHub repo**, under the user's GitHub identity. A deployment tool running in the cluster (Flux) watches that repo and builds the cauldron from the file within a few minutes. So:
- the push is visible to the whole team and takes effect by itself — there is no review step,
- if a `<name>.yaml` already exists, the script **overwrites it**, replacing someone else's cauldron — Step 4 prevents that,
- the cauldron runs the Docker images CI built for the branch; if none exist, the cauldron is created but has nothing to run — Step 3 checks this.

## Rules

- Get an explicit "yes" from the user after showing the Step 5 summary, before running the script. Never run it otherwise.
- Never use `--force`, never edit or delete other cauldrons' files, and never run `delete-cauldron.sh` or `repoint-cauldron.sh`.
- If the local `cauldrons` checkout has uncommitted changes, stop and ask — don't stash, reset, or discard anything.

## Step 1 — Find the two repos

This skill lives inside the Sefaria-Project repo, so `<Sefaria-Project>` below means the root of that repo (`git rev-parse --show-toplevel` from the project). The cauldrons repo is expected in the folder next to it: `<Sefaria-Project>/../cauldrons`, containing `create-cauldron.sh`. If it isn't there, ask the user where their cauldrons checkout is; if they don't have one, offer to clone it next to Sefaria-Project with `git clone https://github.com/Sefaria/cauldrons.git` — ask first.

## Step 2 — Name and branch

**Branch:** `git -C <Sefaria-Project> branch --show-current`. If empty (the checkout isn't on a branch), stop and tell the user to check out the branch they want.

**Name:** ask the user for the cauldron name (unless given). Clean it up the way the script does: lowercase it, then keep only `a-z`, `0-9` and `-` (the script would also keep `.`, but a dot would add an extra level to the web address, so remove dots too). It must be 1–63 characters (the script cuts off longer names from the front, which is confusing). If cleaning changed the name, show the user the result and confirm.

The cauldron's address will be `https://www.<name>.cauldron.sefaria.org`.

**Image name:** work out which set of Docker images the cauldron will use — the script's own rule:

```bash
echo "<branch>" | awk '{print tolower($0)}' | sed -e 's|.*/\([^/]*\)/.*|\1|' -e 'tx' -e 's/\(.*\)/\1/' -e ':x' | sed 's/[^a-z0-9\.\-]//g'
```

For a Shortcut-style branch like `feature/sc-12345/some-name` this gives `sc-12345`.

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
   - No open PR → warn clearly: the cauldron will be created but won't start, because no images exist. Offer to open a **draft** PR for the branch (ask first; this is visible to the team). Opening one starts the image build, which usually takes several minutes.
   - PR exists but the latest `Continuous` run is still in progress → the cauldron will pick up the images when the build finishes; fine to go ahead.
   - Latest run failed → warn that there may be no usable images; let the user decide.
   - Optional, only if `gcloud` is installed and logged in: list the newest web image directly (`timeout 120` because it can be slow):
     ```bash
     timeout 120 gcloud artifacts docker images list "us-east1-docker.pkg.dev/development-205018/containers/sefaria-web-<imagename>" --include-tags --sort-by=~UPDATE_TIME --limit 1 --format="value(tags,updateTime)"
     ```
     Tags look like `sha-<short commit>-<timestamp>`; compare the short commit with the branch's latest pushed commit.

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
- Results of the Step 3 checks, especially any warnings
- That this pushes a commit to `main` of the shared `Sefaria/cauldrons` repo, under their GitHub account, and the cauldron then deploys automatically
- The exact command: `./create-cauldron.sh -n <name> -b <branch>`

Wait for an explicit yes.

## Step 6 — Run it

From the cauldrons folder:

```bash
./create-cauldron.sh -n "<name>" -b "<branch>"
```

The script clones a fresh copy of the cauldrons repo into a temporary folder, downloads a small helper tool (`yq`), writes the files, commits, and pushes. Read the output:
- `Not running on tip of main, please pull before running script` → Step 4 didn't take; redo it.
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
- To copy local content into it, use the `move-text-to-cauldron` skill.
- This skill doesn't delete cauldrons. When it's no longer needed, the user can run `./delete-cauldron.sh -n <name>` in the cauldrons repo themselves.
