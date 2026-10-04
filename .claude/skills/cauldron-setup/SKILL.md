---
name: cauldron-setup
description: |
  One-time setup, on a Windows computer that runs Sefaria inside WSL, for the cauldron skills (create-cauldron, move-text-to-cauldron, move-lexicon-to-cauldron). Installs the GitHub tool (gh) and logs it in, sets the git name, downloads the Sefaria/cauldrons repo into the home folder, records which startup file defines SEFARIA_CAULDRON_API_KEY (never showing the key), and writes ~/.sefaria/cauldron-setup.md, which the other cauldron skills read. Safe to run again any time to check or refresh the setup. Use when the user asks to "set up cauldrons", "set up the cauldron skills", "run cauldron setup", "set up my cauldron API key", or when another cauldron skill says the setup is missing or out of date.
---

# One-time setup for the cauldron skills (Windows + WSL)

This skill assumes the Claude session is running **inside WSL** (the desktop app's WSL environment), opened on the WSL copy of Sefaria-Project (e.g. `/home/<user>/Sefaria-Project`). Step 0 checks this.

`<skill>` below means `<Sefaria-Project>/.claude/skills/cauldron-setup`, where `<Sefaria-Project>` is `git rev-parse --show-toplevel`.

## How to talk to the user

The user is not an engineer. Use plain, everyday words and short messages, one step at a time. When the user has to do something, give numbered steps with the exact text to type, then wait for them to say "done". Don't explain the checks you run unless asked. Don't show command output unless something went wrong.

## Rules

- **The API key is secret.**
  - Never ask the user to paste it into the chat. If they paste it anyway, don't repeat it and don't use it. Say: `Please don't paste the key here, because chats are saved.` Suggest they tell whoever gave them the key, in case it should be replaced, and continue with Step 6.
  - Never display the key. Don't Read, `cat`, `echo`, or print the startup files (`~/.bashrc`, `~/.bash_profile`, `~/.profile`, …) or the variable. Checking a file with `grep -q` or `grep -l` (which print nothing or only file names) is fine.
  - This skill never writes or edits the key or the file that holds it.
- **Passwords.** Never ask for the user's password in the chat and never type one. If a step needs `sudo` and `sudo -n true` fails, the user runs that step in the Ubuntu app (Step 2).
- Every step checks first and skips what's already done, so the skill is safe to run again.
- Change nothing that isn't described here.

## Step 0 — Check where Claude is running (silent)

```bash
bash "$(git rev-parse --show-toplevel)/.claude/skills/cauldron-setup/setup_status.sh"
```

(If `git rev-parse` fails, treat it like the "not inside WSL" case below.) It prints `name: value` lines, then `Problems:`. It never prints the key.

- If output says `STOP: this is not a Claude session running inside WSL`, or the problems say Sefaria-Project is "on the Windows drive" or the session "isn't inside a Sefaria-Project folder". Send this and stop:

  > This setup has to run in a WSL session. In the Claude app's Code tab:
  > 1. Start a new session.
  > 2. Open the environment picker and choose **Ubuntu** (under **WSL**).
  > 3. Choose the folder `/home/<your Linux user name>/Sefaria-Project`.
  > 4. Ask me to "run cauldron setup" again there.

- If problems say `No sefaria/local_settings.py`: say this copy of Sefaria-Project can't run Sefaria, and ask which folder they run local Sefaria from. Stop.

Keep the output. It tells you which of Steps 2–7 are needed.

## Step 1 — Say what will happen

If nothing in Steps 2–7 is needed, say `Everything is already set up. I'll just refresh the setup file.` and go to Step 8.

Otherwise, send one short message that lists only the steps still needed, for example:

> I'll set up the cauldron tools on this computer. Along the way you'll need:
> - your Ubuntu (Linux) password, to install a program
> - to log in to GitHub in your web browser
> - to know which file your cauldron API key is saved in (I'll help find it)
>
> I'll install the GitHub tool, connect it to your GitHub account, set your name for git, download the cauldrons project, and write a small settings file that the other cauldron skills use. OK to start?

Wait for a yes.

## Step 2 — Install missing programs

Needed if `gh_installed: no`, or `tools_missing:` lists `make`, `wget`, or `curl`. `<programs>` = `gh` (if missing) plus any missing ones of `make wget curl`.

1. Check that Ubuntu can install `gh`: `apt-cache policy gh | grep Candidate`. If it says `(none)`, `gh` has to come from GitHub's own package source. Fetch https://github.com/cli/cli/blob/trunk/docs/install_linux.md and use its "Debian, Ubuntu" commands in place of the `apt install` line below.
2. If `sudo -n true 2>/dev/null` succeeds (no password needed), run `sudo apt-get update && sudo apt-get install -y <programs>` yourself.
3. Otherwise send:

   > Next, one program needs to be installed. I can't do this part, because it needs your password.
   > 1. Open the **Ubuntu** app from the Windows Start menu.
   > 2. Copy this line into it and press Enter:
   >    `sudo apt update && sudo apt install -y <programs>`
   > 3. When it asks for your password, type your **Ubuntu** password and press Enter. Nothing appears on the screen while you type. That's normal.
   > 4. When it finishes, say "done" here.

   If they don't know the password: it's the one chosen when Ubuntu/WSL was first set up, which may differ from the Windows password, so whoever set up WSL may know it. It can be reset from Windows PowerShell with `wsl -u root passwd <Linux user name>`. The user or that person runs this, not Claude.

4. After "done", check `command -v gh make wget curl`. If something is still missing, show the last lines of what they saw (ask them to copy it) and help from there.

## Step 3 — Connect GitHub

Needed if `gh_logged_in` isn't `yes`, or the problems mention `gh auth setup-git`.

If not logged in, send:

> Now let's connect the GitHub tool to your GitHub account.
> 1. In the **Ubuntu** app, type this and press Enter:
>    `gh auth login -h github.com -p https -w`
> 2. If it asks "Authenticate Git with your GitHub credentials?", press Enter (yes).
> 3. It shows a one-time code (like `ABCD-1234`). Press Enter. If no browser opens, open https://github.com/login/device in your web browser yourself.
> 4. Type the code, sign in to GitHub if asked, and click **Authorize**.
> 5. Say "done" here.

Then run `gh auth setup-git` yourself. This tells git to use that GitHub login, and it's harmless to repeat. Check with `gh auth status`.

Then check push access: `gh api repos/Sefaria/cauldrons --jq .permissions.push`. If it isn't `true`, tell the user (it doesn't stop the setup):

> Your GitHub account (<github user>) isn't allowed to make changes to the Sefaria "cauldrons" project yet, so creating cauldrons won't work. Please ask the engineering team to give <github user> write access to Sefaria/cauldrons. Copying texts and lexicons to a cauldron doesn't need this.

## Step 4 — Name and email for git

- `git_name: (not set)` → ask `What name should appear on your changes in GitHub? (Usually your full name.)`. Then run `git config --global user.name "<name>"` (escape any `"` in it).
- `git_email: (not set)` → ask for their Sefaria email and run `git config --global user.email "<email>"`.

## Step 5 — Download the cauldrons project

- `cauldrons_repo: not found`:
  - If `~/cauldrons` already exists but has no `create-cauldron.sh`, don't touch it. Tell the user a folder named `cauldrons` is already in their home folder but isn't the cauldrons project, and ask what it is. Stop this step.
  - Otherwise run `git clone https://github.com/Sefaria/cauldrons.git ~/cauldrons`. If it fails with an authentication error, redo Step 3.
- Problems say `.git/refs/heads/main is missing` (`create-cauldron.sh` reads that file directly, and git's automatic cleanup sometimes deletes it after copying it into `.git/packed-refs`):
  1. Update `main`: `git -C <cauldrons_repo> pull --ff-only` if its current branch is `main`, otherwise `git -C <cauldrons_repo> fetch origin main:main`. If the file now exists, you're done.
  2. If it's still missing (this happens when `main` was already up to date), recreate it with the commit `main` already points to. Look the commit up first and write the file only after that succeeds; writing straight into the file (`git rev-parse ... > .git/refs/heads/main`) empties it before git runs and breaks `main`:
     ```bash
     cd <cauldrons_repo> && sha=$(git rev-parse --verify refs/heads/main) && [ -n "$sha" ] && echo "$sha" > .git/refs/heads/main.tmp && mv .git/refs/heads/main.tmp .git/refs/heads/main && [ "$(cat .git/refs/heads/main)" = "$(git rev-parse origin/main)" ] && echo ok
     ```
     If it doesn't print `ok`, show the error and continue the setup; it only affects creating cauldrons.
- Problems say `create-cauldron.sh has Windows line endings`: ask `Your cauldrons folder was downloaded in a way that breaks its scripts. OK to rename it to cauldrons-old and download a fresh copy? (y/n)`. On yes, run `mv <cauldrons_repo> <cauldrons_repo>-old-$(date +%Y%m%d)` and then clone as above.

## Step 6 — Which file has the API key

If `~/.sefaria/cauldron-setup.md` already exists and has an `api_key_file:` line, check that file (command below). If it says `found`, use it as `<keyfile>` without asking and go to Step 7.

Otherwise ask:

> Which file on this computer sets your cauldron API key (`SEFARIA_CAULDRON_API_KEY`)? For example `~/.bashrc`. If you're not sure, just say so.

- If they name a file, use it as `<keyfile>`.
- If they're not sure, look at `api_key_defined_in:` from Step 0 (it lists only file names). One file: ask `It looks like it's in <file>. Is that right?`. Several: ask which one. None: go to "Not set up anywhere" below.

Check it (prints nothing but the result):

```bash
grep -qE '^[[:space:]]*(export[[:space:]]+)?SEFARIA_CAULDRON_API_KEY=' <keyfile> && echo found || echo missing
```

If it says `missing`, tell the user that file doesn't set the key and ask again.

**Not set up anywhere.** Send:

> Your cauldron API key isn't saved on this computer yet. Please don't paste it here, since chats are saved. Instead:
> 1. Open the **Ubuntu** app.
> 2. Type this, but replace `PASTE_KEY_HERE` with your key, then press Enter:
>    `echo 'export SEFARIA_CAULDRON_API_KEY=PASTE_KEY_HERE' >> ~/.bashrc`
> 3. Say "done" here.

Then check `~/.bashrc` as above and use it as `<keyfile>`.

## Step 7 — Can Sefaria reach its local database?

Needed if `python_check: FAILED`. Usually local Sefaria or its database just isn't running. Send:

> I couldn't reach your local Sefaria database. Please start local Sefaria (and its database) the way you normally do, then say "done".

Then run `setup_status.sh` again. If `python_check` still fails, show them the `python_check:` line, say the rest of the setup is done and an engineer should look at this one, and go on to Step 8.

## Step 8 — Write the setup file

```bash
bash <skill>/setup_status.sh --write --api-key-file <keyfile>
```

This saves `~/.sefaria/cauldron-setup.md` (private to the user). It records the name of the key file, never the key. The create-cauldron, move-text-to-cauldron, and move-lexicon-to-cauldron skills read it.

## Step 9 — Wrap up

Send one short message:
- A ✓ list of what's set up.
- Anything under `Problems:` still left, each in plain words with who can fix it.
- What they can ask for now: "create a cauldron called …", "move <book> to <cauldron>", "move the <lexicon> lexicon to <cauldron>".
