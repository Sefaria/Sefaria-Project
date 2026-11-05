# Routines

## Daily

Run every working day in the evening. It must be safe to run twice: the second run refreshes the same pull request.

1. **Read** every message and thread reply in #reader-future since the last digest. The last digest is the newest merged or
   open pull request titled `spec digest …` on `reader-next`; its description ends with the timestamp of the last message it
   covered. If there is none, read the last seven days.
2. **Skip** messages already captured (`@Claude capture` threads with a reply from you linking a pull request), chatter, and
   logistics.
3. **Place** each remaining point in its area(s) (`areas.md`); unplaced points go to `CROSS_CUTTING.md` → Unplaced notes.
4. **Check the code** for every architecture claim (SKILL.md rule 4): `master` for how the legacy reader does it, `reader-next`
   for how the new one does it.
5. **Refresh the baseline**: `python3 docs/reader-future/tools/seed.py`. If it changes anything, include it, and say so in the
   description ("baseline refreshed: the atlas changed").
6. **Write** the changes (`writing.md`), on a branch `spec-digest-YYYY-MM-DD` from `reader-next`. If today's pull request is
   already open, push to its branch instead.
7. **Open the pull request** to `reader-next`, title `spec digest YYYY-MM-DD`. Description:
   ```
   ## Areas changed
   ### <Area name> (`slug`)
   - <what changed> — <permalink>
   ## Decisions recorded
   ## Open questions added
   ## Unplaced notes
   Covered messages up to: <timestamp of the last message read>
   ```
8. **Post** one message in the channel: the pull request link, the areas changed, the decisions recorded, and the unplaced notes
   that need someone to place them. If nothing needed recording, post nothing.

## Weekly

Run on Sunday morning.

1. Read all 58 area files, `DECISIONS.md` and `CROSS_CUTTING.md` on `reader-next`.
2. Look for: contradictions between areas (one area assumes what another rules out); decisions not mirrored in their area;
   statuses that do not match `DECISIONS.md`; open questions answered elsewhere; unplaced notes that now have a home;
   architecture claims the code no longer bears out (spot-check against `master` and `reader-next`).
3. Fix what is mechanical (mirroring, links, statuses that follow from a recorded decision) in one pull request,
   `spec weekly YYYY-MM-DD`. Do not resolve contradictions yourself.
4. Post one message in the channel:
   - **This week:** areas that moved, decisions taken.
   - **Needs a person:** contradictions and stale claims, each with the two places involved.
   - **Suggested focus next week:** the one or two areas with the most core features not yet built (from each README row:
     core count and "new client done") and the least discussion, with the reason in a line.
   - **Unowned areas**, if any are core to the next milestone.
