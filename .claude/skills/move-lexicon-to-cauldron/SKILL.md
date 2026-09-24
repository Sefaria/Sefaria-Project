---
name: move-lexicon-to-cauldron
description: |
  Copies a Sefaria lexicon (its lexicon record, lexicon entries, word forms, and — if the lexicon has an index_title — its Index, version, and optionally links) from the user's LOCAL Sefaria database to an existing cauldron, by interviewing the user and then running Sefaria-Project's scripts/move_draft_lexicon.py with the right arguments. Works on Mac/Linux, and on Windows when Sefaria runs inside WSL. Use when the user asks to "move a lexicon/dictionary to a cauldron", "push my local lexicon to <cauldron>", "copy lexicon entries / word forms to a cauldron", or mentions move_draft_lexicon.py. Only targets https://www.<name>.cauldron.sefaria.org — never production.
---

# Move a lexicon from local Sefaria to a cauldron

Wraps `scripts/move_draft_lexicon.py`, which reads a lexicon from the local Mongo database and posts it to a cauldron over its web API, using an API key. It sends, in order:

1. the `lexicon` record (matched on `name`) → `api/lexicons/<name>`
2. its `lexicon_entry` records (`parent_lexicon` = name), in batches → `api/lexicons/<name>/entries`
3. the `word_form` records with a lookup for it, carrying only this lexicon's lookups → `api/lexicons/<name>/word-forms`
4. if the lexicon has `index_title`: the Index, the version named by `version_title`/`version_lang`, and links (with `-l`), using `move_draft_text.py`'s `ServerTextCopier`

Nothing is ever deleted on the cauldron. Entries and word forms are matched by their Mongo `_id` (they keep their local `_id` on the cauldron), not by headword/form, since neither is unique. So a re-run updates instead of duplicating, and a headword renamed locally is renamed on the cauldron. On an existing word form, only this lexicon's lookups are replaced; other lexicons' lookups are kept. The lexicon goes before the Index because a dictionary Index looks its lexicon up by name.

## How to talk to the user

The user is a longtime Sefaria employee. Keep the conversation bare-bones. The only things you say to the user are:
1. **Setup problems**, one line each (API key, WSL repo path, cauldron not responding / missing the lexicon endpoints).
2. **One message with the questions** (Step 2).
3. **A one-line confirmation** before running (Step 4).
4. **Errors**, one short line each, saying which part failed (lexicon / entries / word forms / term / category / Index / version / links).
5. **A final message** (Step 6).

Do not explain Sefaria basics (lexicons, entries, word forms, versions, links, cauldrons). Do not explain what the script does, show the command you'll run, or explain shell commands. Do not narrate your checks. This overrides any general instruction to explain things in plain language.

## Rules that always apply

- **Destination must be a cauldron, written with `www.`.** Exactly `https://www.<name>.cauldron.sefaria.org`. The non-`www` address redirects. The lexicon part of the script treats a redirect as an error, but the Index/version/links part (from `move_draft_text.py`) turns a redirected upload into a plain page fetch and the content is silently dropped. If the user asks for anything that isn't a cauldron (especially `www.sefaria.org`, `sefaria.org`, or any production host), stop and tell them in one line that this skill only targets cauldrons.
- **Always pass `-d` explicitly.**
- **Never ask the user to paste an API key into the chat, and never print one.** Always pipe the script's output through the redaction `sed` in Step 5.
- **Get an explicit "yes" to the one-line confirmation before running** (Step 4). It writes to a shared environment.
- Do not edit `move_draft_lexicon.py`, `move_draft_text.py`, or any other Sefaria code.

## Step 0 — Which kind of machine (silent)

Follow **Step 0** of `.claude/skills/move-text-to-cauldron/SKILL.md` exactly (direct mode vs. WSL mode, finding `<WSL-repo>` and `<WSL-scratchpad>`, and how to run a command "in Sefaria's shell"). When it says to confirm the repo path, check for `scripts/move_draft_lexicon.py` instead of `scripts/move_draft_text.py`.

## Step 1 — Look up the lexicon (silent)

`<Sefaria-Project>` is the repo root: `git rev-parse --show-toplevel` in direct mode, `<WSL-repo>` in WSL mode. If no lexicon name was given, ask for one. Then run in Sefaria's shell:

```bash
cd <Sefaria-Project> && PYTHONPATH=. DJANGO_SETTINGS_MODULE=sefaria.settings \
  python3 .claude/skills/move-lexicon-to-cauldron/inspect_local_lexicon.py "<name>" 2>/dev/null | tail -1
```

It prints one JSON object: `found`, `name`, `entry_count`, `word_form_count`, `index_title`, `version_title`, `version_lang`, `should_autocomplete`, and, when there is an `index_title`, `versions_found` (languages of matching local versions), `manual_link_count`, `all_link_count`. It can take a minute.

- `found` false → it also returns `local_lexicons`. Say `"<name>" not found locally.` and, if one of `local_lexicons` is an obvious match (different case, "Dictionary" suffix, etc.), add ` Did you mean "<match>"?` Then stop.
- `index_error` present → say `Lexicon's index_title "<index_title>" doesn't load locally: <index_error>` and stop.
- `index_title` set but `versions_found` empty → note it; the Index will be sent with no version. Mention this in the confirmation line (Step 4).
- Python can't import Sefaria/Django → ask how they run Sefaria locally (virtualenv / pyenv version) and retry.

Also check the API key silently, exactly as in **Step 1** of `.claude/skills/move-text-to-cauldron/SKILL.md` (direct-mode and WSL-mode checks and the one-line messages). It uses the same `SEFARIA_CAULDRON_API_KEY`.

## Step 2 — Ask the questions (one message)

If the lexicon has an `index_title`, send exactly this shape and nothing else:

```
Links: none / manual (<manual_link_count>) / all (<all_link_count>)

Cauldron name?
```

If it has no `index_title`, only ask `Cauldron name?`.

Internal notes (don't tell the user unless it blocks them):
- If the chosen link option sends more than 1,000 links, add `-s 500`.
- If they give a full URL for the cauldron, take just the name and drop any leading `www.`.

## Step 3 — Check the cauldron (silent)

Build `DEST=https://www.<name>.cauldron.sefaria.org` and run (URL-encode the lexicon name, spaces as `%20`):

```bash
curl -s -o /dev/null -w "%{http_code} %{redirect_url}\n" --max-time 30 "$DEST/api/v2/raw/index/Genesis"
curl -s --max-time 30 "$DEST/api/lexicons/<encoded name>" | head -c 300
```

First command:
- `200` with nothing after it → continue.
- `301`/`302` → say `<DEST> redirects; not running.` and stop.
- `000` / timeout → say `<DEST> isn't responding.` and stop.

Second command — it tells you whether the cauldron runs code that has the lexicon endpoints, and whether the lexicon is already there:
- JSON starting `{"lexicon":` → endpoints exist; lexicon already on the cauldron (it will be updated). Remember its `entry_count` / `word_form_count` for Step 6.
- JSON `{"error": "Lexicon '...' does not exist."}` → endpoints exist; lexicon is new on the cauldron.
- Anything else (HTML, 404, empty) → say `<cauldron> isn't running code with the lexicon upload endpoints (api/lexicons/...). Deploy a branch that has them first.` and stop.

## Step 4 — One-line confirmation

Send one line and wait for an explicit yes, e.g.:

`Copy Jastrow Dictionary (32,512 entries + 130,058 word forms + Index "Jastrow" + version "London, Luzac, 1903" + 293 manual links) to shmuel-main? (y/n)`

Leave out the Index/version/links parts when there's no `index_title`; say "no links" when none were chosen; say "Index with no version" when `versions_found` is empty; add "(updates existing)" when Step 3 found the lexicon already there.

## Step 5 — Run it (silent)

Run in Sefaria's shell. In WSL mode, `<scratchpad>` below is `<WSL-scratchpad>`.

```bash
cd <Sefaria-Project> && env -u SLACK_URL ./run move_draft_lexicon.py '<name>' \
  -d "$DEST" -k "$SEFARIA_CAULDRON_API_KEY" \
  [-l 1|2] [-s 500] \
  2>&1 | sed -E "s/apikey='[^']*'/apikey='<hidden>'/g; s/apikey=\"[^\"]*\"/apikey=\"<hidden>\"/g" \
  > <scratchpad>/move_lexicon.log
```

- Wrap the name in single quotes; write each `'` inside it as `'\''`.
- Write `$DEST` out as the actual URL (in WSL mode, `step.sh` can't see Git Bash's variables). Leave `$SEFARIA_CAULDRON_API_KEY` as a variable — never write the key's value.
- Big lexicons (100k+ word forms) take a long time: run it in the background and wait for it to finish.

## Step 6 — Check the output, verify, report

The script keeps going after most errors. It exits 1 if anything in the lexicon/entries/word-forms part failed, but not for Index/version/link errors, so always read `<scratchpad>/move_lexicon.log`. Its lexicon lines look like:

```
lexicon: {"status": "created"}                       # or "updated"
entries: sent 32512, {"created": ..., "updated": ..., "unchanged": ..., "errors": 0}
word-forms: sent 130058, {"created": ..., "updated": ..., "unchanged": ..., "errors": 0}
text: Jastrow with versions [{"language": "en", "versionTitle": "London, Luzac, 1903"}]
```

followed by `move_draft_text.py`'s own output for the Index, version, and links.

Real errors:
- `lexicon: {"error": ...}` → nothing else was sent. `Only Sefaria Moderators ...` / `Unrecognized API key` = key problem; `Unknown Lexicon fields: ...` = the cauldron's code doesn't know those fields yet.
- `entries error:` / `word-forms error:` lines (one per rejected record, with its `_id`), and batch lines like `entries 0-500: {"error": ...}` (the whole batch failed). Group them by message with a short Python script over the log rather than reading them by eye (in WSL mode, run it in Sefaria's shell). Known messages:
  - `Unknown <Class> fields: [...]` = the cauldron's code doesn't know those fields.
  - `Entry of <lexicon> with headword <hw> already exists` = the cauldron has that headword under a different `_id`, usually because the lexicon was regenerated on production after the local database was copied. Say how many, in one line; the upload can't match those entries.
  - `would not resolve as a ref`, or schema errors like `{'alt_headwords': ...}` = the local entry itself fails Sefaria's validation. Report as is.
- From the text part: lines starting `Error code:`, and any other `"error"` JSON. An Index error mentioning `No matching class for <name> in DictionaryNode` means the cauldron's code doesn't have the lexicon in `LexiconEntrySubClassMapping.lexicon_class_map` — say so in one line.

Not errors (same as the text skill): `Error: Link already exists ...`, `Updated existing link ...`, and fewer links sent than counted (links with a `source_text_oid` are skipped).

Verify on the cauldron:

```bash
curl -s "$DEST/api/lexicons/<encoded name>" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('entry_count'), d.get('word_form_count'), d.get('error'))"
curl -s "$DEST/api/v2/raw/index/<index_title>" | head -c 400      # only if index_title
curl -s "$DEST/api/texts/versions/<index_title>"                    # only if index_title
```

`entry_count` should be at least the local `entry_count`. `word_form_count` should be at least the local `word_form_count` (it can be higher: the cauldron keeps what it already had).

Final message — errors first (one line each), then:

```
Done: $DEST/<Index_title_with_underscores>        (or "Done: <name> on <cauldron>" when there's no index_title)
Entries: <created> new, <updated> updated, <unchanged> unchanged. Word forms: <created> new, <updated> updated, <unchanged> unchanged.
<N> new links, <N> updated, <N> already existed.
```

Leave out the links line if no links were sent. If the lexicon was `created` (new on the cauldron) and `should_autocomplete` is true, add one line: `Dictionary search autocomplete won't include it until the cauldron restarts.` Nothing else.
