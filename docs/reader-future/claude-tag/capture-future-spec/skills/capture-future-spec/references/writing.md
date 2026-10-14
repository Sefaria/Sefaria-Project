# Writing the area files

## `product.md` sections (above the BASELINE block)

| Section | What goes there |
|---|---|
| **Summary** | Three to six sentences: what this area is for in the future reader. Rewrite it as the conversation moves; it is the one place that is a synthesis, not a list. |
| **Who it is for and what they need** | Readers, learners, teachers, sheet makers, editors… and the need. Only needs someone in the channel stated or agreed. |
| **Target behaviour in the future reader** | Bullets of behaviour, each with a status and source. |
| **Changes from today** | Four sub-lists: **keep** (as sefaria.org does it), **change**, **drop**, **new**. Each bullet names the atlas ID(s) it changes, when there are any. |
| **Open questions** | Questions nobody has answered, and disagreements with each position and who holds it. Remove a question when it is answered; the answer goes where it belongs. |
| **Decisions** | Mirror of this area's rows in `DECISIONS.md`. |
| **Parked ideas** | Ideas the channel decided not to pursue now, with why. |

## `architecture.md` sections

| Section | What goes there |
|---|---|
| **Summary** | How the area is built in the future reader, in a few sentences. |
| **Legacy approach vs new approach** | How `master` does it and how `reader-next` does it today, each with `file:line` links. Check both before writing. |
| **Target architecture** | Components, data flow, APIs, state, caching, SSR — each bullet with status and source. |
| **Dependencies on other areas** | Which other areas this needs or affects, linked (`../search/architecture.md`). |
| **Risks and open questions** | As in product. |
| **Decisions** | Mirror of `DECISIONS.md`. |

## A bullet

```
- Search results open in the panel they were searched from, not a new one. — *agreed* · [Slack](https://…/p1728…) · SRC-041
```

Text, then `— *status* · source(s)`. Status is one of idea, proposed, agreed, decided. Several sources are separated by ` · `.
When a bullet changes status, edit it in place and add the new source; do not add a second bullet.

## A `DECISIONS.md` row

```
| 2026-10-20 | search | Hebrew and English results are shown in one list, ranked together. | Dana (owner) | [Slack](https://…) |
```

Newest first, directly under the header row. A superseded row stays, with `~~strike-through~~` on the decision and
`superseded by 2026-11-02` added.

## Front matter

Change `owner` when someone in the channel takes an area ("I'll own topics"). Move `status` from `baseline` to `exploring` on the
first captured discussion, to `proposed` when the target sections are filled, to `agreed` when the owner says the area's spec is
agreed. Update `updated:` on every change.

## Style

- Plain English. Short sentences. No marketing words.
- Name things by what users see, then by code if needed.
- No names in the text except in **Decided by** and in Open questions where positions differ.
- Never paste long Slack text: say it in a line and link it.
