---
name: move-text-to-cauldron
description: |
  Copies a Sefaria book (its index/schema, chosen text versions, and optionally its links) from the user's LOCAL Sefaria database to an existing cauldron, by interviewing the user and then running Sefaria-Project's scripts/move_draft_text.py with the right arguments. Works on Mac/Linux, and on Windows when Claude runs inside WSL (after cauldron-setup). Use when the user asks to "move a text to a cauldron", "push my local text/book/version to <cauldron>", "copy a draft text to a cauldron", "deploy content to a cauldron", or mentions move_draft_text.py. Only targets https://www.<name>.cauldron.sefaria.org — never production.
---

# Move a text from local Sefaria to a cauldron

Wraps `scripts/move_draft_text.py`, which reads a book from the local Mongo database and posts it to a cauldron over its web API, using an API key. It sends, in order: terms/categories the book needs, the index (unless `--noindex`), the versions requested with `-v`, and links (if `-l 1` or `-l 2`).

## Before anything else — run git-update

Run the `git-update` skill first, before any other step. If it stops, stop this skill too. If it succeeds, go on to Step 0 without saying anything.

## How to talk to the user

The user is a longtime Sefaria employee. Keep the conversation bare-bones. The only things you say to the user are:
1. **Setup problems**, one line each: the setup-file message (Step 0), the API-key message (Step 1), and the `git-update` skill's own one-line messages if it stops.
2. **One message with the three questions**: versions, links, cauldron (Step 2).
3. **A one-line confirmation** before running (Step 4).
4. **Errors**, one short line each, saying which part failed (term / category / index / which version / links).
5. **A final message**: `Done: <link>` plus one line of counts (Step 6).

Do not explain Sefaria basics (versions, the `he`/`en` language field, `[xx]` tags, links, manual vs. auto links, cauldrons being copies of production, how to find a version on the page, caching/reloading). Do not explain what the script does, show the command you'll run, or explain shell commands. Do not narrate your checks. This overrides any general instruction to explain things in plain language.

## Rules that always apply

- **Destination must be a cauldron, written with `www.`.** Exactly `https://www.<name>.cauldron.sefaria.org`. The non-`www` address redirects, and the script's upload code turns a redirected upload into a plain page fetch — the content is silently dropped. If the user asks for anything that isn't a cauldron (especially `www.sefaria.org`, `sefaria.org`, or any production host), stop and tell them in one line that this skill only targets cauldrons.
- **Always pass `-d` explicitly.** The script's default destination is `http://eph.sefaria.org`.
- **Never ask the user to paste an API key into the chat, and never print one.** The script prints its arguments, including the key, on its first line — always pipe its output through the redaction `sed` in Step 5.
- **Get an explicit "yes" to the one-line confirmation before running** (Step 4). It writes to a shared environment.
- Do not edit `move_draft_text.py` or any other Sefaria code.

## Step 0 — Setup file (silent)

`git-update` has already stopped the skill if Claude is running on plain Windows, so this is either a Mac/Linux computer or a Claude session inside WSL. Every command in this skill runs directly.

Run `cat ~/.sefaria/cauldron-setup.md 2>/dev/null`. The `cauldron-setup` skill writes this file on Windows computers, where Claude runs inside WSL. It never contains the key. There is no such file on a Mac.

**No file** → `<Sefaria-Project>` is `git rev-parse --show-toplevel`. Run every command in this skill as written.

**The file exists:**
- `<Sefaria-Project>` is its `sefaria_project:` value. If `test -f <Sefaria-Project>/scripts/move_draft_text.py` fails, say `~/.sefaria/cauldron-setup.md is out of date. Run the cauldron-setup skill again.` and stop.
- Build `<prefix>` and put it in front of every command in this skill that starts with `cd <Sefaria-Project>`, and in front of the Step 1 key check:
  - the `python_setup:` line followed by ` && `, unless it says `(none needed)`;
  - if there's an `api_key_file:` line, `eval "$(grep -E '^[[:space:]]*(export[[:space:]]+)?SEFARIA_CAULDRON_API_KEY=' <api_key_file> | tail -1)" && export SEFARIA_CAULDRON_API_KEY && `. This loads just that one line from the file, wherever it is in the file, and prints nothing.

## Step 1 — Look up the book (silent)

`<Sefaria-Project>` is the repo root from Step 0. If no title was given, ask for one. Then run:

```bash
cd <Sefaria-Project> && PYTHONPATH=. DJANGO_SETTINGS_MODULE=sefaria.settings \
  python3 .claude/skills/move-text-to-cauldron/inspect_local_text.py "<title>" 2>/dev/null | tail -1
```

It prints one JSON object: `found`, canonical `title`, `categories`, local `versions` (`language` + `versionTitle`), `manual_link_count`, `all_link_count`. It can take a minute. Use the canonical `title` from here on.

- `found` false → say `"<title>" not found locally.` and stop.
- Python can't import Sefaria/Django → ask how they run Sefaria locally (virtualenv / pyenv version) and retry.

Also check the API key silently. The check prints only file names, never the key.

```bash
if [ -n "$SEFARIA_CAULDRON_API_KEY" ]; then echo "key is set"; else
  echo "key is NOT set"; echo "shell: $(basename "$SHELL")"
  grep -l SEFARIA_CAULDRON_API_KEY ~/.zshrc ~/.zprofile ~/.zshenv ~/.bashrc ~/.bash_profile ~/.profile 2>/dev/null
fi
```

If Step 0 used the setup file (run the check with `<prefix>` in front) and the key isn't set, say `SEFARIA_CAULDRON_API_KEY isn't set in <api_key_file>. Run the cauldron-setup skill again.` and stop. Otherwise:

Claude reads one startup file when a session starts: `~/.zshrc` if the shell is `zsh`, `~/.bashrc` if it's `bash`. Call that `<rc>` (for any other shell, say "your shell's startup file"). If the key isn't set:
- Not found in `<rc>`: say `SEFARIA_CAULDRON_API_KEY isn't set. Add it to <rc> and restart the session.` If `grep` found it in another file, add ` (It's in <that file>, which Claude doesn't read.)` Then stop.
- Found in `<rc>`: say `SEFARIA_CAULDRON_API_KEY is in <rc> but not loaded. Restart the session; if that doesn't help, check that line.` and stop.

## Step 2 — Ask the three questions (one message)

Send exactly this shape and nothing else:

```
Versions (numbers, "all", or "none"):
he
  1. Miqra according to the Masorah
  2. Tanach with Nikkud
en
  3. The Holy Scriptures: A New Translation (JPS 1917)

Links: none / manual (<manual_link_count>) / all (<all_link_count>)

Cauldron name?
```

Internal notes (don't tell the user unless it blocks them):
- A version title containing `|` can't be sent individually (the script splits the list on `|`). If they pick one, say in one line that it can only go with "all".
- If the chosen link option sends more than 1,000 links, add `-s 500`.
- If they give a full URL for the cauldron, take just the name and drop any leading `www.`.

## Step 3 — Check the cauldron (silent)

Build `DEST=https://www.<name>.cauldron.sefaria.org` and run:

```bash
curl -s -o /dev/null -w "%{http_code} %{redirect_url}\n" --max-time 30 "$DEST/api/v2/raw/index/Genesis"
```

- `200` with nothing after it → continue.
- `301`/`302` → say `<DEST> redirects; not running.` and stop.
- `000` / timeout → say `<DEST> isn't responding.` and stop.

## Step 4 — One-line confirmation

Send one line and wait for an explicit yes, e.g.:

`Copy Ruth (index + 1 version + all 5,361 links) to shmuel-main? (y/n)`

Use "index + N versions" / "index only" and "no links" / "N manual links" / "all N links" as appropriate. Add "no index" if `--noindex` is being used (only when the user asked for it).

## Step 5 — Run it (silent)

```bash
cd <Sefaria-Project> && env -u SLACK_URL ./run move_draft_text.py '<title>' \
  -d "$DEST" -k "$SEFARIA_CAULDRON_API_KEY" \
  [-v '<versionlist>'] [-l 1|2] [-s 500] [--noindex] \
  2>&1 | sed -E "s/apikey='[^']*'/apikey='<hidden>'/g; s/apikey=\"[^\"]*\"/apikey=\"<hidden>\"/g" \
  > <scratchpad>/move.log
```

- `<versionlist>` is `all` or `lang:Version Title|lang:Other Title`.
- Wrap the title and version list in single quotes; write each `'` inside them as `'\''`.
- Leave `$SEFARIA_CAULDRON_API_KEY` as a variable — never write the key's value.
- `env -u SLACK_URL` stops a Slack "Upload Complete" post.
- Save the output to a file in the scratchpad — link responses can be megabytes long. Use a long timeout or run it in the background.

## Step 6 — Check the output, verify, report

The script keeps going after errors and exits successfully anyway, so read the log (`<scratchpad>/move.log`). Things that look like errors but are **not**:
- The first line shows `noindex=True` — this means the index **was** sent. The flag is `store_false`, so `noindex` really holds "send the index".
- Link responses `Error: Link already exists ...` and `Updated existing link ...` — the link was already on the cauldron.
- Fewer links sent than `all_link_count`/`manual_link_count` — the script skips links with a `source_text_oid`.

Real errors: lines starting `Error code:` (e.g. `403` = bad or under-privileged API key), and any other `"error"` JSON. Group link errors by message with a short Python script over the log rather than reading them by eye.

Verify on the cauldron (URL-encode the title):

```bash
curl -s "$DEST/api/v2/raw/index/<title>" | head -c 400      # index exists
curl -s "$DEST/api/texts/versions/<title>"                    # versions present
curl -s "$DEST/api/texts/<title>.1?context=0&pad=0&ven=<Version_Title_with_underscores>"   # a version has text
```

Use the v1 `/api/texts/` endpoint for the text check — `/api/v3/texts` with a `version=` parameter returned nothing even for long-standing versions.

Final message — errors first (one line each), then:

```
Done: $DEST/<Title_with_underscores>
<N> new links, <N> updated, <N> already existed.
```

Leave out the counts line if no links were sent. Nothing else.
