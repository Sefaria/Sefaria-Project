# Setting up Claude Tag for #reader-future

What has to be set up once, in Slack and in claude.ai admin, so Claude Tag can keep this specification. Everything in the repository
(this folder, the skill, the generator) is already in place on `reader-next`.

## 1. Admin (a claude.ai Team or Enterprise owner)

1. **Claude Tag** is enabled for the Sefaria Slack workspace: claude.ai → Admin settings → Claude Tag.
2. **GitHub**: the Claude GitHub App is installed on `Sefaria/Sefaria-Project`, and the repository is granted to the
   #reader-future channel's scope. Claude needs to clone, push branches and open pull requests; it never needs to merge.
3. **Routines**: Admin → Capabilities → *Remote sessions* is on (routines run as remote sessions).
4. **The skill**: upload `claude-tag/capture-future-spec.zip` as a plugin (Admin → Claude Tag → Plugins), and attach it to the
   #reader-future channel. Rebuild the zip when the skill changes (section 7).
5. **Spend**: set a limit for the channel. The daily digest and weekly pass are each one session; captures are one each.
6. **Branch protection** on `reader-next` should require a review, so every change is a pull request someone approves.

## 2. The channel

1. Create **#reader-future** (public, so the team can read it) and invite **@Claude**; run `@Claude connect` if asked.
2. In the channel's Claude settings, set **Respond automatically: off**. Claude answers when mentioned and when the routines run;
   it does not reply to every message.
3. Paste the **custom instructions** (section 3).
4. Send the **memory** lines (section 4), one message each.
5. Post and pin the **welcome message** (section 6).

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

Create both in the channel (`@Claude create a routine …`) or from claude.ai; each runs in this channel with the skill attached.

**Daily digest** — every weekday at 18:00 Israel time:

```
Run the capture-future-spec daily digest for #reader-future: follow references/digest.md "Daily". Read everything since the last
spec digest pull request, update docs/reader-future on reader-next, run tools/seed.py, open or refresh the "spec digest <today>"
pull request, and post one summary message here. If nothing needs recording, post nothing.
```

**Weekly consistency pass** — Sundays at 09:00 Israel time:

```
Run the capture-future-spec weekly pass for #reader-future: follow references/digest.md "Weekly". Fix mechanical inconsistencies
in one "spec weekly <today>" pull request, and post this week's summary, what needs a person, and the suggested focus areas.
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

The skill is `claude-tag/capture-future-spec/`. After editing it, rebuild the zip and upload it again (section 1.4):

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
