# Setting up Claude Tag for #reader-future

What has to be set up once, in Slack and in claude.ai admin, so Claude Tag can keep this specification. Everything in the repository
(this folder, the skill, the generator) is already in place on `reader-next`.

## 1. Admin (a Claude organization Owner, Team or Enterprise plan)

Admin pages live under claude.ai/admin-settings. Steps follow the Claude Tag docs, https://claude.com/docs/claude-tag.

1. **Pair the Slack workspace** (once, if not done): a Slack workspace admin sends `@Claude connect` in any channel; the Owner pastes
   the code at claude.ai/admin-settings/claude-tag → **Pair your Slack workspace** → **Pair workspace**.
2. **Routines**: claude.ai/admin-settings/capabilities → **Remote sessions** → **Routines** on. Without it Claude answers every
   mention with an "unavailable" notice.
3. **The skill**: claude.ai/admin-settings/skills?tab=inventory → **Add** → **Upload a plugin** →
   `claude-tag/capture-future-spec.zip`. Uploading only adds it to the catalogue; attach it in step 5.
4. **GitHub**: link the Sefaria GitHub organisation at claude.ai/admin-settings/source-control (needs a GitHub org owner who is also
   a Claude Owner).
5. **Attach to the channel**: claude.ai/admin-settings/claude-tag → **Claude's access** → **Channels** → #reader-future →
   **Add** → **Plugin** → `capture-future-spec` → **Add**; then **Add** → **Repository** → `Sefaria/Sefaria-Project` → **Add**.
   Claude needs to clone, push branches and open pull requests; it never needs to merge.
6. **Spend**: claude.ai/admin-settings/usage/claude-tag → set a limit on #reader-future's row in the per-channel table. Warnings post
   in Slack at 75% and 90%. The daily digest and weekly pass are each one session; captures are one each.
7. **Branch protection** on `reader-next` should require a review, so every change is a pull request someone approves.

## 2. The channel

#reader-future exists (public, channel ID `C0C9EGTL468`, created 2026-10-14) and its welcome message is posted.

1. **Pin** the welcome message (section 6).
2. **Invite Claude**: send `/invite @Claude` in the channel. It posts its own welcome.
3. **Configure**: send `@Claude !configure` and open the link it replies with (or use the admin page in 1.5 → **General** tab).
   Paste the custom instructions (section 3) into **Channel instructions**, switch **Respond automatically** off, and **Save** (the
   field does not auto-save). Claude then answers only when mentioned and when the routines run.
4. **Memory**: send the lines in section 4, one message each. Check with `@Claude what do you remember about this channel?`.
5. **Routines**: send the two messages in section 5.

## 3. Channel custom instructions

```
This channel designs the next Sefaria reader. Your job here is to keep its specification current: docs/reader-future/ on the
reader-next branch of Sefaria/Sefaria-Project, one product.md and one architecture.md for each of the Feature Atlas's 29 areas,
plus DECISIONS.md and CROSS_CUTTING.md. Use the capture-future-spec skill for every capture, digest, weekly pass and question
about the spec.

- The files are the memory: read them before you answer or write; do not rely on what you remember.
- The legacy reader is on master (static/js/, reader/, templates/); the new one is on reader-next (reader-next/). Check claims
  about either against the code on that branch.
- Record what people said, with a link; do not add your own ideas to the files. Offer them in your reply instead, marked as yours.
- Only a message starting "Decision:" (or an area owner saying it is decided) makes something decided.
- Every change is a pull request to reader-next touching only docs/reader-future/. Never merge, never push to master.
- Keep replies short: what you recorded, where, and the pull request link.
```

## 4. Channel memory

Send each as a message to @Claude in the channel:

```
@Claude remember for this channel: the specification lives in Sefaria/Sefaria-Project, branch reader-next, folder docs/reader-future/. Its README has the area index.
```
```
@Claude remember for this channel: we compare the legacy reader on master (static/js, reader/, templates/) with the new reader on reader-next (reader-next/). The Feature Atlas is reader-next/docs/features/features.json.
```
```
@Claude remember for this channel: "Decision:" at the start of a message records a decision; "@Claude capture" records a thread now; [area] tags like [search] are optional hints.
```
```
@Claude remember for this channel: area owners are listed in the owner: field of each area's product.md. When someone says they own an area, update it in the next pull request.
```

## 5. Routines

Routines are created by asking in the channel (there is no form for creating them). Name the timezone, or Claude uses the sender's
Slack timezone. `@Claude !routines` lists them; pause or change them by asking in plain words.

**Daily digest:**

```
@Claude every weekday at 18:00 Israel time, run the capture-future-spec daily digest for #reader-future: follow references/digest.md "Daily". Read everything since the last spec digest pull request, update docs/reader-future on reader-next, run tools/seed.py, open or refresh the "spec digest <today>" pull request, and post one summary message here. If nothing needs recording, post nothing.
```

**Weekly consistency pass:**

```
@Claude every Sunday at 09:00 Israel time, run the capture-future-spec weekly pass for #reader-future: follow references/digest.md "Weekly". Fix mechanical inconsistencies in one "spec weekly <today>" pull request, and post this week's summary, what needs a person, and the suggested focus areas.
```

Claude Tag stops following a channel after about 100 top-level messages, or ten days, without being mentioned. The daily
routine keeps it present; if the routines are paused, mention @Claude in the channel before asking it to catch up.

## 6. Welcome message (pin it)

```
#reader-future is where we design the next Sefaria reader. The spec is written here, by Claude, from what we say:
https://github.com/Sefaria/Sefaria-Project/tree/reader-next/docs/reader-future

How to use the channel
• Talk freely. Claude places every point in one of the 29 product areas (README has the list), each with a product and an architecture doc.
• To focus on an area, start a thread: "Focus: Search & autocomplete".
• "Decision: …" records a decision. "@Claude capture" records a thread now.
• Every evening Claude opens one pull request with the day's changes and posts what changed. Review it like any PR.
• Sundays: a consistency pass and a suggested focus for the week.
• Want to own an area? Say so; your name goes in its owner field.
```

## 7. Changing the skill

The skill is `claude-tag/capture-future-spec/`. After editing it, rebuild the zip and upload it again (section 1.3):

```bash
cd docs/reader-future/claude-tag && rm -f capture-future-spec.zip && (cd capture-future-spec && zip -qr ../capture-future-spec.zip .claude-plugin skills)
```

`references/areas.md` is generated by `tools/seed.py`; run it (and rebuild the zip) when the atlas's areas change.

## 8. Test it

1. `@Claude what does the spec say about search?` → it answers from `search/product.md` with links, changes nothing.
2. `@Claude how do the legacy and new readers differ on how the sidebar opens a commentary?` → it cites `static/js/` on `master`
   and `reader-next/src/` on `reader-next`. (Check it reads both branches: `git diff master...reader-next -- reader-next/`.)
3. In a thread: a short exchange about one area, then `@Claude capture` → a pull request `spec: <area> — …` touching only
   that area's files, and a reply with its link.
4. `Decision: test decision, please ignore` → a `DECISIONS.md` row and a mirror in the area; close that pull request unmerged.
5. Run the daily routine once by hand (`@Claude run the daily digest now`) → one pull request, one summary.
