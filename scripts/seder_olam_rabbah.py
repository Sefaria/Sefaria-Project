"""
Seder Olam Rabbah — remove the chapter-heading segment.

Every section of Seder Olam Rabbah currently starts with a segment that holds
nothing but the chapter heading:

    Seder Olam Rabbah 1:1   ->  "פרק א"           (heading — junk)
    Seder Olam Rabbah 1:2   ->  "מאדם עד המבול…"  (the actual content)

Sections 10, 20 and 30 additionally have a colophon at :3.  The three
commentaries (Vilna Gaon, Yaakov Emden, Meir Ayin) are depth 3 —
``<Commentary> on Seder Olam Rabbah <chapter>:<base segment>:<comment>`` — and
their sub-section 1 is empty everywhere, mirroring the empty heading segment.

This script drops segment 1 and shifts everything above it down by one:

    X:1  (heading)   ->  deleted
    X:2              ->  X:1
    X:3              ->  X:2      (sections 10, 20, 30 only)

    <Comm> X:1:Z     ->  (nothing there — sub-section is empty)
    <Comm> X:2:Z     ->  <Comm> X:1:Z

ORDERING.  The ref cascade runs BEFORE the text is shortened.  This is a
downsize, so once a section loses a segment the old refs stop validating —
``sefaria.helper.schema.change_node_structure`` cascades first for exactly the
same reason (see its ``delta < 0`` branch: "For downsizing, refs will become
invalidated in their current state, so changes must be made before the
structure change").

Two collections need the OPPOSITE order and get their own steps after the trim:
MarkedUpTextChunk (step 4b), whose validation checks the record against the text
at its ref, and the derived expandedRefs on WebPage / RefTopicLink (step 4c),
which are recomputed on save and so would otherwise be rebuilt from the old text.

Run with:  ./run scripts/seder_olam_rabbah.py
Set DRY_RUN = False to actually write.
"""
import os
import re
from collections import defaultdict

import django
django.setup()

from sefaria.model import *
# Not re-exported by sefaria.model's __init__, so it needs naming outright.
from sefaria.model.marked_up_text_chunk import MarkedUpTextChunk
from sefaria.helper.schema import cascade, refresh_version_state, remove_branch
from sefaria.system.database import db
from sefaria.utils.util import traverse_dict_tree


def _env_flag(name, default):
    """Read a boolean switch from the environment, falling back to `default`.

    Accepts exactly 'true' or 'false' and aborts on anything else, so a typo cannot
    turn into a live run: without the check, ``DRY_RUN=flase`` would read as False.
    """
    raw = os.environ.get(name)
    if raw is None:
        return default
    if raw not in ("true", "false"):
        raise SystemExit(f"ABORT: {name}={raw!r} — use exactly 'true' or 'false'.")
    return raw == "true"


# The two intended invocations:
#     DRY_RUN=false REINDEX_SEARCH=false ./run scripts/seder_olam_rabbah.py   (local)
#     DRY_RUN=false REINDEX_SEARCH=true  ./run scripts/seder_olam_rabbah.py   (cauldron/prod)
DRY_RUN = _env_flag("DRY_RUN", True)

# Rewriting Elasticsearch is a separate switch: it needs SEARCH_URL pointing at a
# cluster you may WRITE to.  The default local_settings points SEARCH_URL at
# https://www.sefaria.org/api/search, so leaving this False keeps a local run from
# reaching out to production's search index.  It is also ignored while DRY_RUN is on
# — see reindex_search() for why reindexing an unchanged text is worse than useless.
#
# Running live with this off is a normal local workflow.  It does leave the search
# index stale, and this script cannot fix that on a later run (preflight() blocks a
# second run, and step 5's delete list is captured during the trim).  Locally that
# does not matter; on a cauldron or production, turn it on or rebuild search with the
# normal reindex job afterwards.
REINDEX_SEARCH = _env_flag("REINDEX_SEARCH", False)


BASE_TITLE = "Seder Olam Rabbah"
COMMENTARIES = [f"{c} on Seder Olam Rabbah" for c in ("Vilna Gaon", "Yaakov Emden", "Meir Ayin")]

# Segment 1 must look like one of these before we delete it.  Anything else is
# real content and the section is left untouched.
HEADING = re.compile(r"^\s*(?:פרק\s+[א-ת]{1,3}|Chapter\s+\d+)\s*$")

BASE_SEG = re.compile(r"^(Seder Olam Rabbah )(\d+):(\d+)$")
COMM_SEG = re.compile(r"^((?:Vilna Gaon|Yaakov Emden|Meir Ayin) on Seder Olam Rabbah )(\d+):(\d+):(\d+)$")


def title_query(field, titles=None):
    """Mongo query matching `field` against any of `titles`, ANCHORED.

    The anchor is the whole point.  An unanchored ``{"ref": {"$regex": "Seder Olam
    Rabbah"}}`` cannot use an index and forces a full collection scan — which is
    survivable on `links` and emphatically not on `history`, where it hangs for
    minutes.  A ``^``-anchored regex is a prefix match and can be served from the
    index on that field.  This is the same shape cascade()'s own construct_query uses.
    """
    titles = [BASE_TITLE] + COMMENTARIES if titles is None else titles
    return {"$or": [{field: {"$regex": "^" + re.escape(t) + " "}} for t in titles]}


# ---------------------------------------------------------------------------
# section lengths, read from the canonical Hebrew version
# ---------------------------------------------------------------------------

CANONICAL_VERSION = "Seder Olam, Warsaw 1904"


def canonical_chapter():
    """The `default` node's jagged array from the canonical Hebrew version.

    Everything downstream is measured against this one version, so fail loudly
    and specifically if it is not shaped the way we expect rather than dying
    later with a KeyError halfway through a cascade.
    """
    v = db.texts.find_one({"title": BASE_TITLE, "versionTitle": CANONICAL_VERSION})
    if v is None:
        raise SystemExit(
            f"ABORT: no version titled {CANONICAL_VERSION!r} for {BASE_TITLE!r}.\n"
            f"       Available: {sorted(x['versionTitle'] for x in db.texts.find({'title': BASE_TITLE}, {'versionTitle': 1}))}")
    chapter = v.get("chapter")
    if not isinstance(chapter, dict) or "default" not in chapter:
        raise SystemExit(
            f"ABORT: expected {BASE_TITLE!r} to be a complex text with a 'default' node; "
            f"got {list(chapter) if isinstance(chapter, dict) else type(chapter).__name__}")
    return chapter["default"]


def canonical_section_lengths():
    """{section number -> segment count} from the canonical Hebrew text."""
    return {i: len(sec) for i, sec in enumerate(canonical_chapter(), start=1)}


def preflight():
    """Refuse to run against data that is not in the expected pre-migration shape.

    The critical case is a SECOND live run after a successful one.  By then
    sections 10/20/30 hold [content, colophon], so their segment :2 is a *valid*
    ref again — and the cascade would happily shift the colophon's refs down
    onto the content.  Nothing else in the script catches that, because from the
    cascade's point of view a second run looks exactly like a first one.

    THIS IS NOT A RESUME CHECK, and it cannot be made into one.  It reads the text,
    and the text is the LAST thing the migration writes — so a run that died anywhere
    in the cascade leaves the text untouched and sails straight through here, no matter
    how much reference data has already moved.

    That window is genuinely destructive.  cascade_refs() shifts :2 -> :1 and then
    :3 -> :2; a run that dies after the :3 pass leaves the old :3 refs sitting at :2,
    and a re-run's :2 pass shifts those to :1 — a second shift, on top of the refs
    already there.  The remedy for an interrupted run is to restore the database and
    start over, not to run this script again.
    """
    chapter = canonical_chapter()
    already = [i for i, sec in enumerate(chapter, start=1)
               if sec and not HEADING.match(str(sec[0])) and str(sec[0]).strip()]
    if already:
        raise SystemExit(
            "ABORT: this looks ALREADY MIGRATED — segment 1 is real content, not a chapter\n"
            f"       heading, in section(s) {already[:5]}{'...' if len(already) > 5 else ''}.\n"
            "       Re-running would shift the colophon refs in sections 10/20/30 down a\n"
            "       second time.")
    print(f"preflight OK: {len(chapter)} sections, segment 1 is a heading in all of them")
    if not DRY_RUN:
        print("    NOTE: this checks the TEXT, which is written last.  It cannot detect a\n"
              "          run that died part-way through the reference cascade.  If this run\n"
              "          does not reach 'Done.', restore the database before trying again —\n"
              "          re-running on top of a partial cascade shifts refs twice.")


SECTION_LEN = canonical_section_lengths()
MAX_VALID_SEGMENT = max(SECTION_LEN.values())


# ---------------------------------------------------------------------------
# rewriters — one cascade pass per segment number, ascending
# ---------------------------------------------------------------------------
#
# Running "shift :2 down" to completion before "shift :3 down" is what keeps the
# links collection safe.  It has a unique index on (refs.0, refs.1), so if a :3
# link moved onto :2 while a :2 link were still sitting there we would get a
# DuplicateKeyError.  Ascending order guarantees the slot is already vacated.
#
# Refs whose segment number exceeds the section's real length are left alone —
# they are already dangling today and renumbering them would only move the
# breakage around.  Dangling *links* are deleted outright in step 1c, before this
# runs; this guard still matters for every other collection the cascade touches
# (notes, history, sheets, topic links, webpages), which are not cleaned up.

def base_rewriter_for(segment):
    def rewriter(tref, *_):
        m = BASE_SEG.match(tref)
        if not m or int(m.group(3)) != segment:
            return tref
        return f"{m.group(1)}{m.group(2)}:{segment - 1}"
    return rewriter


def base_needs_rewrite_for(segment):
    def needs_rewrite(tref, record=None):
        # links are the only collection with a uniqueness constraint on refs, and
        # they are rewritten here like everything else — the collision pre-pass
        # below has already cleared the way.
        if isinstance(record, MarkedUpTextChunk):
            return False        # deferred to after the trim — see rewrite_marked_up_text_chunks()
        m = BASE_SEG.match(tref)
        if not m:
            return False
        section, seg = int(m.group(2)), int(m.group(3))
        if seg != segment or seg < 2:
            return False
        return seg <= SECTION_LEN.get(section, 0)   # skip pre-existing dangling refs
    return needs_rewrite


# ---------------------------------------------------------------------------
# ranged refs — rewritten in one dedicated pass, after the per-segment passes
# ---------------------------------------------------------------------------
#
# A range names two endpoints, so it cannot be handled by the per-segment passes
# above (which each match exactly one segment number).  It gets its own pass, which
# is safe to run last because ranges live in sheets and web pages, neither of which
# has a uniqueness constraint the way links do.
#
# Endpoint rule: a segment shifts down one, and segment 1 — the heading, which is
# being deleted — collapses onto the new segment 1.  So "3:1-2" (heading through
# content) becomes just "3:1" (the content), and "29:1-30:2" becomes "29:1-30:1".
# A range that collapses to a single segment is emitted as a plain segment ref.

BASE_RANGE_SAME = re.compile(r"^(Seder Olam Rabbah )(\d+):(\d+)-(\d+)$")
BASE_RANGE_CROSS = re.compile(r"^(Seder Olam Rabbah )(\d+):(\d+)-(\d+):(\d+)$")
COMM_RANGE_SUB = re.compile(
    r"^((?:Vilna Gaon|Yaakov Emden|Meir Ayin) on Seder Olam Rabbah )(\d+):(\d+):(\d+)-(\d+)$")


def _shift_endpoint(section, seg):
    """New segment number for one endpoint, or None if it must be left alone."""
    if seg > SECTION_LEN.get(section, 0):
        return None                      # already dangling — see delete_dangling_links
    return max(1, seg - 1)


def range_rewriter(tref, *_):
    m = BASE_RANGE_CROSS.match(tref)
    if m:
        title, sec_a, a, sec_b, b = m.group(1), int(m.group(2)), int(m.group(3)), int(m.group(4)), int(m.group(5))
        na, nb = _shift_endpoint(sec_a, a), _shift_endpoint(sec_b, b)
        if na is None or nb is None:
            return tref
        if sec_a == sec_b and na == nb:
            return f"{title}{sec_a}:{na}"
        return f"{title}{sec_a}:{na}-{sec_b}:{nb}"

    m = BASE_RANGE_SAME.match(tref)
    if m:
        title, sec, a, b = m.group(1), int(m.group(2)), int(m.group(3)), int(m.group(4))
        na, nb = _shift_endpoint(sec, a), _shift_endpoint(sec, b)
        if na is None or nb is None:
            return tref
        return f"{title}{sec}:{na}" if na == nb else f"{title}{sec}:{na}-{nb}"

    m = COMM_RANGE_SUB.match(tref)
    if m and int(m.group(3)) == 2:
        # Only the BASE segment index moves; the comment sub-range is untouched,
        # because the commentary's own sub-sections are not being renumbered.
        return f"{m.group(1)}{m.group(2)}:1:{m.group(4)}-{m.group(5)}"

    return tref


def range_needs_rewrite(tref, record=None):
    if isinstance(record, MarkedUpTextChunk):
        return False                     # deferred, same as the per-segment passes
    return range_rewriter(tref) != tref


def comm_rewriter(tref, *_):
    m = COMM_SEG.match(tref)
    if not m or int(m.group(3)) != 2:
        return tref
    return f"{m.group(1)}{m.group(2)}:1:{m.group(4)}"


def comm_needs_rewrite(tref, record=None):
    if isinstance(record, MarkedUpTextChunk):
        return False            # deferred to after the trim — see rewrite_marked_up_text_chunks()
    m = COMM_SEG.match(tref)
    return bool(m) and int(m.group(3)) == 2


# ---------------------------------------------------------------------------
# step 1 — clear link collisions
# ---------------------------------------------------------------------------

def find_link_collisions():
    """Links that would land on a ref pair some other link already occupies.

    Every one of these is a stale ``X:1`` link: the automatic citation linker
    (``add_links_from_text``) built them back when the section's content lived
    at :1, before the heading segment was inserted.  They point at a heading
    like "פרק יא", which contains no citation, so they cannot be genuine.
    The real link is the ``X:2`` one moving down onto them.
    """
    links = list(db.links.find(title_query("refs", [BASE_TITLE]), {"refs": 1}))

    def shifted(refs):
        """`refs` with every in-range Seder Olam segment moved down one."""
        out = []
        for r in refs:
            m = BASE_SEG.match(r)
            if m and 2 <= int(m.group(3)) <= SECTION_LEN.get(int(m.group(2)), 0):
                out.append(f"{m.group(1)}{m.group(2)}:{int(m.group(3)) - 1}")
            else:
                out.append(r)
        return out

    occupied = defaultdict(list)
    stationary = {}
    for l in links:
        key = tuple(sorted(l["refs"]))
        occupied[key].append(l["_id"])
        # A link that moves is not really blocking its slot — the ascending cascade
        # vacates it first.  Only a link whose refs are unchanged by the shift is a
        # true obstacle.  Without this, a link at 10:2 (which is itself due to move to
        # 10:1) would be deleted as the "occupant" the 10:3 link is about to land on,
        # destroying a legitimate link rather than letting it move.
        stationary[l["_id"]] = tuple(sorted(shifted(l["refs"]))) == key

    victims = {}
    for l in links:
        new_key = tuple(sorted(shifted(l["refs"])))
        old_key = tuple(sorted(l["refs"]))
        if new_key == old_key:
            continue
        for other in occupied.get(new_key, []):
            if other != l["_id"] and stationary[other]:
                victims[other] = (new_key, old_key)
    return victims


def clear_link_collisions():
    victims = find_link_collisions()
    print(f"\n=== Step 1: stale links to delete so the rewrite can land: {len(victims)}")
    for _id, (new_key, old_key) in list(victims.items())[:5]:
        print(f"    delete {list(new_key)}   (displaced by {list(old_key)})")
    if len(victims) > 5:
        print(f"    ... and {len(victims) - 5} more")
    if not DRY_RUN and victims:
        res = db.links.delete_many({"_id": {"$in": list(victims)}})
        print(f"    deleted {res.deleted_count}")


# ---------------------------------------------------------------------------
# step 1b — clear stale MarkedUpTextChunk records at segment 1
# ---------------------------------------------------------------------------

def find_stale_mutc():
    """MarkedUpTextChunk records sitting at ``X:1`` / ``<Comm> X:1:Z``.

    Exactly the same species as the stale ``X:1`` links cleared above, and stale for
    the same reason: the citation linker wrote them when the section's content lived
    at :1, before the heading segment was inserted.  Their spans describe characters
    of a text that is no longer at that ref — ``report_marked_up_text_chunks()``
    prints the evidence, span by span.

    They have to go before the :2 records can move down, because MarkedUpTextChunk
    enforces uniqueness on (ref, versionTitle, language) in ``_validate()``.
    """
    stale = []
    for title in [BASE_TITLE] + COMMENTARIES:
        for d in db.marked_up_text_chunks.find({"ref": {"$regex": f"^{re.escape(title)} "}},
                                               {"ref": 1}):
            m = BASE_SEG.match(d["ref"]) or COMM_SEG.match(d["ref"])
            if m and int(m.group(3)) == 1:
                stale.append(d["_id"])
    return stale


def clear_stale_mutc():
    stale = find_stale_mutc()
    print(f"\n=== Step 1b: stale segment-1 MarkedUpTextChunk records to delete: {len(stale)}")
    if not DRY_RUN and stale:
        res = db.marked_up_text_chunks.delete_many({"_id": {"$in": stale}})
        print(f"    deleted {res.deleted_count}")
    elif DRY_RUN:
        print("    (dry run) nothing deleted — see the report above for what these hold")


# ---------------------------------------------------------------------------
# step 1c — delete pre-existing dangling links
# ---------------------------------------------------------------------------

def find_dangling_links():
    """Links whose Seder Olam ref points past the end of its section.

    These are broken *today* — left over from an earlier restructuring, not
    created by this migration.  Scoped to the base text on purpose: the three
    commentaries have no dangling refs (every one of their ~1,100 link refs
    resolves), so widening the query would only add risk.

    Returns (ids, partners): the _ids to delete, and {dangling ref -> [(partner
    ref, link type), ...]} for the printout.
    """
    ids, partners = set(), defaultdict(list)
    for l in db.links.find(title_query("refs", [BASE_TITLE]), {"refs": 1, "type": 1}):
        for i, r in enumerate(l["refs"]):
            m = BASE_SEG.match(r)
            if m and int(m.group(3)) > SECTION_LEN.get(int(m.group(2)), 0):
                ids.add(l["_id"])
                # A link's `refs` is a 2-element list, so the partner is the other
                # entry.  Guard the length anyway — malformed links do exist, and
                # this is the last place that should raise.
                other = [x for j, x in enumerate(l["refs"]) if j != i]
                partners[r].append((other[0] if other else "(no partner ref)",
                                    l.get("type") or ""))
    return ids, partners


def delete_dangling_links():
    """Delete the pre-existing dangling links.

    Every one is printed before it goes, with the ref on the other side.  That
    is the only record of what was destroyed: knowing that 'Seder Olam Rabbah
    5:3' was dangling says nothing about how it might have been repaired, but
    knowing it pointed at 'Ibn Ezra on Exodus 40:2:1' does.  Keep the run log if
    anyone may want to reconstruct these later.

    Runs BEFORE the cascade so these links are simply gone by the time refs move,
    rather than being carried along as breakage in a new location.
    """
    ids, partners = find_dangling_links()
    total = sum(len(v) for v in partners.values())
    print(f"\n=== Step 1c: deleting pre-existing dangling links: "
          f"{len(ids)} link(s) across {len(partners)} distinct dangling refs "
          f"({total} dangling ref occurrence(s))")
    for r in sorted(partners, key=lambda x: (int(x.split()[-1].split(':')[0]), int(x.split(':')[-1]))):
        sec = int(r.split()[-1].split(':')[0])
        print(f"      {r:34} in {len(partners[r]):>2} link(s)   "
              f"[section has {SECTION_LEN.get(sec, 0)} segments]")
        for other, ltype in sorted(partners[r]):
            print(f"          was linked to  {other}{f'  ({ltype})' if ltype else ''}")
    if not DRY_RUN and ids:
        res = db.links.delete_many({"_id": {"$in": list(ids)}})
        print(f"    deleted {res.deleted_count}")
    elif DRY_RUN:
        print("    (dry run) nothing deleted")


# ---------------------------------------------------------------------------
# step 2 — cascade the ref changes
# ---------------------------------------------------------------------------

def cascade_refs():
    print("\n=== Step 2: cascading ref changes (before the text shrinks)")
    for segment in range(2, MAX_VALID_SEGMENT + 1):
        print(f"\n--- base text: shifting :{segment} -> :{segment - 1}")
        if DRY_RUN:
            n = db.links.count_documents(
                {"refs": {"$regex": rf"^{BASE_TITLE} \d+:{segment}$"}})
            print(f"    (dry run) {n} link refs at :{segment}")
            continue
        cascade(Ref(BASE_TITLE),
                rewriter=base_rewriter_for(segment),
                needs_rewrite=base_needs_rewrite_for(segment))

    for title in COMMENTARIES:
        print(f"\n--- {title}: shifting X:2:Z -> X:1:Z")
        if DRY_RUN:
            n = db.links.count_documents({"refs": {"$regex": rf"^{re.escape(title)} \d+:2:\d+$"}})
            print(f"    (dry run) {n} link refs to shift")
            continue
        cascade(Ref(title), rewriter=comm_rewriter, needs_rewrite=comm_needs_rewrite)

    # Ranges last: they name two endpoints and so cannot ride along with the
    # per-segment passes.  Run once per book, since a range ref is anchored to the
    # book whose title it carries.
    for title in [BASE_TITLE] + COMMENTARIES:
        print(f"\n--- {title}: shifting ranged refs")
        if DRY_RUN:
            hits = [r for r in _ranged_refs_in_data() if r.startswith(title + " ")]
            changed = [(r, range_rewriter(r)) for r in hits if range_rewriter(r) != r]
            print(f"    (dry run) {len(hits)} ranged ref(s), {len(changed)} would change")
            for old, new in changed[:5]:
                print(f"        {old:44} -> {new}")
            continue
        cascade(Ref(title), rewriter=range_rewriter, needs_rewrite=range_needs_rewrite)


# ---------------------------------------------------------------------------
# step 3 — drop segment 1 from the text
# ---------------------------------------------------------------------------

def default_node(index):
    return index.nodes.get_default_child() if index.nodes.has_children() else index.nodes


def is_droppable(first):
    """Is entry 0 of a section safe to delete?

    Two shapes reach this.  In the base text entry 0 is a string, and it may go
    only if it is the chapter heading or blank.  In a commentary entry 0 is a
    whole sub-section (a list of comments on base segment :1), and it may go
    only if it holds no comments — sub-section 1 is empty throughout, because
    nobody comments on a chapter heading.  Anything else is real content and the
    section is left alone rather than silently destroyed.
    """
    if isinstance(first, list):
        return not any(str(x).strip() for x in first)
    if not str(first).strip():
        return True
    return bool(HEADING.match(str(first)))


def drop_first_segment(title):
    """Remove entry 0 from every section of every version of `title`.

    Writes straight to the Version rather than going through TextChunk, because a
    TextChunk built mid-change can pick up refs that are momentarily inconsistent.
    change_node_structure() does the same thing for the same reason, down to the
    traverse_dict_tree pattern for complex texts — its comment reads "we're going to
    save directly on the version to avoid weird mid change Ref bugs".
    """
    index = library.get_index(title)
    node = default_node(index)
    address = node.version_address()

    for v in VersionSet({"title": title}):
        chapter = traverse_dict_tree(v.chapter, address) if isinstance(v.chapter, dict) else v.chapter
        changed, skipped = 0, []
        new_chapter = []
        for i, section in enumerate(chapter, start=1):
            if len(section) < 2:
                # Nothing to drop, or a section whose only entry is real content
                # already sitting at :1 (Sefaria Community Translation §13).
                if len(section) == 1 and section[0] and str(section[0]).strip():
                    skipped.append(f"{i} (single segment holds content)")
                new_chapter.append(section)
                continue
            first = section[0]
            if not is_droppable(first):
                skipped.append(f"{i} (entry 1 holds content: {str(first)[:40]!r})")
                new_chapter.append(section)
                continue
            new_chapter.append(section[1:])
            changed += 1

        print(f"    {v.versionTitle[:44]:46} lang={v.language:3} sections trimmed={changed}")
        for s in skipped:
            print(f"        SKIPPED section {s}")
        if not DRY_RUN:
            if isinstance(v.chapter, dict):
                parent = traverse_dict_tree(v.chapter, address[:-1])
                parent[address[-1]] = new_chapter
            else:
                v.chapter = new_chapter
            v.save()


# title -> segment refs as they were BEFORE the trim, captured by drop_first_segments()
# and consumed by reindex_search().  See that function for why this has to be recorded
# rather than recomputed.
OLD_SEGMENT_REFS = {}


def capture_old_refs(title):
    OLD_SEGMENT_REFS[title] = [r.normal() for r in library.get_index(title).all_segment_refs()]


def drop_first_segments():
    print("\n=== Step 3: removing the heading segment from the text")
    print(f"\n--- {BASE_TITLE}")
    capture_old_refs(BASE_TITLE)
    drop_first_segment(BASE_TITLE)
    for title in COMMENTARIES:
        print(f"\n--- {title}")
        capture_old_refs(title)
        drop_first_segment(title)


# ---------------------------------------------------------------------------
# step 4 — rebuild caches and derived state
# ---------------------------------------------------------------------------

def refresh():
    print("\n=== Step 4: rebuilding library / version state")
    if DRY_RUN:
        print("    (dry run) skipped")
        return
    library.rebuild()
    for title in [BASE_TITLE] + COMMENTARIES:
        refresh_version_state(title)
        print(f"    refreshed {title}")
    # NOT calling handle_dependant_indices(): it nulls out base_text_mapping on
    # every commentary, which is how automatic commentary linking is driven.
    # It exists for structural changes that leave the base/commentary mapping
    # invalid — here base text and commentaries are shifted in lockstep, so
    # 'many_to_one' stays correct and must be preserved.
    # NOTE: remove_introduction_nodes() must pass handle_dependencies=False for the
    # same reason — remove_branch() calls handle_dependant_indices() by default and
    # would undo this a few steps later.


# ---------------------------------------------------------------------------
# step 4b — rewrite MarkedUpTextChunk refs (deferred until AFTER the trim)
# ---------------------------------------------------------------------------

def rewrite_marked_up_text_chunks():
    """Move each MarkedUpTextChunk down a segment, once the text underneath is correct.

    This one collection cannot ride along with the cascade in step 2, and it is the
    only one that cares about the ordering.  ``MarkedUpTextChunk._validate()`` checks
    the record against the text *at its own ref*: the TextChunk must be non-empty, the
    (ref, versionTitle, language) key must be free, and every span's charRange must
    still cut out exactly the span's text.  During step 2 the text has not moved yet,
    so a record arriving at ``12:1`` is validated against the chapter heading — and
    fails all three ways at once.  Deferring to here means each record lands on the
    text it was actually built from, so the spans line up unchanged.

    (In step 2 the cascade still *visits* these records; the ``needs_rewrite``
    callbacks return False for them, which is why nothing is saved there.)

    Ascending segment order, for the same reason the links need it: :2 must vacate
    :1 before :3 moves onto :2, or the uniqueness check rejects the second move.
    """
    print("\n=== Step 4b: rewriting MarkedUpTextChunk refs")
    if DRY_RUN:
        print("    (dry run) skipped — the text still holds the heading segment, so every")
        print("              record would fail validation exactly as it does in a live run")
        return

    for title in [BASE_TITLE] + COMMENTARIES:
        is_comm = title in COMMENTARIES
        pattern = COMM_SEG if is_comm else BASE_SEG
        docs = []
        for d in db.marked_up_text_chunks.find({"ref": {"$regex": f"^{re.escape(title)} "}},
                                               {"ref": 1}):
            m = pattern.match(d["ref"])
            if m and int(m.group(3)) >= 2:
                docs.append((int(m.group(3)), d["_id"], d["ref"], m))
        docs.sort(key=lambda t: t[0])           # ascending segment

        moved, failed = 0, []
        for seg, _id, tref, m in docs:
            new_ref = (f"{m.group(1)}{m.group(2)}:{seg - 1}:{m.group(4)}" if is_comm
                       else f"{m.group(1)}{m.group(2)}:{seg - 1}")
            mutc = MarkedUpTextChunk().load({"_id": _id})
            if mutc is None:
                failed.append((tref, "record vanished between query and load"))
                continue
            mutc.ref = new_ref
            try:
                mutc.save()
                moved += 1
            except Exception as e:
                # Left where it is, pointing at a segment that no longer exists.  Reported
                # rather than raised: Mongo is already committed by this point, and one bad
                # record must not strand the rest of the collection mid-move.
                failed.append((f"{tref} -> {new_ref}", str(e)))

        print(f"    {title:40} moved={moved} failed={len(failed)}")
        for tref, err in failed[:5]:
            print(f"        FAILED {tref}: {err}")
        if len(failed) > 5:
            print(f"        ... and {len(failed) - 5} more failures")


# ---------------------------------------------------------------------------
# step 4c — recompute derived expandedRefs (must follow the trim AND the rebuild)
# ---------------------------------------------------------------------------

def recompute_expanded_refs():
    """Re-save WebPage and RefTopicLink records so their expandedRefs are rebuilt.

    Both models derive expandedRefs from their primary ref inside ``_normalize()``:
    ``WebPage`` calls ``Ref.expand_refs(self.refs)`` and ``RefTopicLink`` calls
    ``Ref(self.ref).all_segment_refs()``.  The value the cascade wrote is therefore
    discarded on save and regenerated from the text as it stood at that moment.

    For a segment-level primary ref that is harmless — the cascade rewrote the primary
    ref too, so the regenerated expansion is already right.  It is NOT harmless for a
    SECTION-level or ranged primary ref, which the segment rewriters never match: the
    ref keeps its old value, the expansion is regenerated from the pre-trim text, and
    nothing revisits it.  Those records would keep listing a final segment that no
    longer exists.

    Re-saving here, once the text is short and ``library.rebuild()`` has run, makes the
    same recomputation produce the correct answer.  Records whose expansion is already
    correct are skipped so this does not churn the whole collection.
    """
    print("\n=== Step 4c: recomputing derived expandedRefs")
    titles = [BASE_TITLE] + COMMENTARIES
    query = title_query("expandedRefs", titles)

    if DRY_RUN:
        for coll in ("webpages", "ref_topic_links"):
            print(f"    (dry run) {db[coll].count_documents(query)} {coll} record(s) to re-save")
        return

    for label, model_set in (("WebPage", WebPageSet), ("RefTopicLink", RefTopicLinkSet)):
        touched, failed = 0, []
        for record in model_set(query):
            before = list(getattr(record, "expandedRefs", []))
            try:
                record.save()
            except Exception as e:
                failed.append((getattr(record, "url", None) or getattr(record, "ref", "?"), str(e)))
                continue
            if list(getattr(record, "expandedRefs", [])) != before:
                touched += 1
        print(f"    {label:14} re-saved, {touched} record(s) changed, {len(failed)} failed")
        for who, err in failed[:5]:
            print(f"        FAILED {who}: {err}")
        if len(failed) > 5:
            print(f"        ... and {len(failed) - 5} more failures")


# ---------------------------------------------------------------------------
# step 5 — rewrite the Elasticsearch text index
# ---------------------------------------------------------------------------

def reindex_search():
    """Rewrite the ES `text` index for the books we just renumbered.

    ES documents are keyed by (ref, versionTitle, lang) via make_text_doc_id, so a
    renumbering leaves two kinds of wrong document behind:

    1. The doc at each section's old last segment — 'Seder Olam Rabbah 1:2' — which
       no longer exists in the text and would linger indefinitely.
    2. The doc at every surviving ref, still holding the *previous* segment's text.

    (2) fixes itself on re-index, because index_ref upserts by doc id.  (1) has to be
    deleted explicitly, and this is the trap: `delete_version` finds its targets via
    `index.all_segment_refs()`, which by the time this runs already reflects the
    *shortened* text — so it would never see 'Seder Olam Rabbah 1:2' and would leave
    the stale doc in place.  That is why drop_first_segments() records the pre-trim
    ref list, and why deletion goes through delete_text_by_ref_string (it takes a
    plain string; these refs no longer resolve to a Ref).

    Note that index_ref returns without indexing when a segment is empty in a given
    version, so deleting first is what keeps newly-emptied segments from keeping a
    stale doc.

    Per-segment failures are collected rather than raised, matching
    process_version_title_change_in_search in sefaria/model/dependencies.py: the Mongo
    side is already committed by now, so one bad segment must not abort the rest.
    """
    # Bail out BEFORE importingtouching sefaria.search: get_new_and_current_index_names
    # performs a live get_alias() call against SEARCH_URL, so merely asking for the
    # index name reaches the cluster.  A dry run must not talk to search at all.
    if DRY_RUN or not REINDEX_SEARCH:
        why = ("DRY_RUN is on, so the text never changed — re-indexing it would delete "
               "every doc and rewrite identical content"
               if DRY_RUN and REINDEX_SEARCH else
               f"DRY_RUN={DRY_RUN}, REINDEX_SEARCH={REINDEX_SEARCH}")
        print(f"\n=== Step 5: Elasticsearch — SKIPPED ({why}); no request sent")
        for title in [BASE_TITLE] + COMMENTARIES:
            old_refs = OLD_SEGMENT_REFS.get(title) or []
            versions = VersionSet({"title": title}).count()
            print(f"    {title}: would clear {len(old_refs)} old refs per version, "
                  f"then re-index every surviving ref, across {versions} version(s)")
        return

    from sefaria.search import (TextIndexer, delete_text_by_ref_string,
                                get_new_and_current_index_names)

    index_name = get_new_and_current_index_names('text')['current']
    print(f"\n=== Step 5: Elasticsearch — index {index_name!r}")

    for title in [BASE_TITLE] + COMMENTARIES:
        old_refs = OLD_SEGMENT_REFS.get(title)
        if old_refs is None:
            print(f"    {title}: SKIPPED — no pre-trim ref list captured this run")
            continue
        new_refs = library.get_index(title).all_segment_refs()
        versions = list(VersionSet({"title": title}))
        print(f"\n--- {title}: clearing {len(old_refs)} old refs, indexing {len(new_refs)}, "
              f"across {len(versions)} version(s)")

        for v in versions:
            for tref in old_refs:
                # already logs and swallows its own errors
                delete_text_by_ref_string(tref, v.versionTitle, v.language)

            failed = []
            for oref in new_refs:
                try:
                    TextIndexer.index_ref(index_name, oref, v.versionTitle, v.language,
                                          getattr(v, "languageFamilyName", None),
                                          getattr(v, "isPrimary", False))
                except Exception as e:
                    failed.append((oref.normal(), str(e)))
            print(f"    {v.versionTitle[:44]:46} lang={v.language:3} "
                  f"indexed={len(new_refs) - len(failed)} failed={len(failed)}")
            for tref, err in failed[:5]:
                print(f"        FAILED {tref}: {err}")
            if len(failed) > 5:
                print(f"        ... and {len(failed) - 5} more failures")


# ---------------------------------------------------------------------------
# report only — ranged refs, which the cascade cannot rewrite
# ---------------------------------------------------------------------------

# collections the cascade rewrites, as (collection, field) — used by the ranged-ref
# report below to look in exactly the places cascade() touches.
CASCADED_FIELDS = [
    ("links", "refs"), ("notes", "ref"), ("history", "ref"), ("ref_topic_links", "ref"),
    ("ref_topic_links", "expandedRefs"), ("user_history", "ref"), ("ref_data", "ref"),
    ("webpages", "refs"), ("webpages", "expandedRefs"), ("sheets", "sources.ref"),
    ("manuscript_pages", "contained_refs"), ("manuscript_pages", "expanded_refs"),
]


def _ranged_refs_by_location():
    """{"collection.field": [ranged ref, ...]} across every collection cascade() touches."""
    titles = [BASE_TITLE] + COMMENTARIES
    found = defaultdict(list)
    for coll, field in CASCADED_FIELDS:
        for d in db[coll].find(title_query(field), {field: 1}):
            # sheets store refs one level down (sources.ref); everything else is flat
            if "." in field:
                parent, sub = field.split(".", 1)
                vals = [s.get(sub) for s in (d.get(parent) or []) if isinstance(s, dict)]
            else:
                vals = d.get(field)
                vals = vals if isinstance(vals, list) else [vals]
            for r in vals:
                if not isinstance(r, str) or not any(r.startswith(t + " ") for t in titles):
                    continue
                if "-" in r.split()[-1]:
                    found[f"{coll}.{field}"].append(r)
    return found


def _ranged_refs_in_data():
    """Every distinct ranged ref, flattened.  Used by the step 2 dry run."""
    return sorted({r for refs in _ranged_refs_by_location().values() for r in refs})


def report_ranged_refs():
    """Refs holding a range, and what the range pass will do to each one.

    BASE_SEG and COMM_SEG both anchor on a single segment number, so ranges cannot be
    handled by the per-segment passes; range_rewriter() handles them in a pass of its
    own.  Two shapes turn up:

      * CHAPTER ranges  ('Seder Olam Rabbah 9-10') — chapters are not being renumbered,
        so these are left exactly as they are.  Their segment expansions are refreshed
        by recompute_expanded_refs() after the trim.
      * SEGMENT ranges  ('Seder Olam Rabbah 3:1-2', 'Vilna Gaon ... 6:2:5-6') — these
        do move, and are shown here with their rewritten value so the endpoint rule can
        be eyeballed before a live run.

    Anything range-shaped that the rewriter does NOT recognise is called out loudly
    rather than passing through unnoticed.
    """
    print("\n=== Report: ranged refs")
    found = _ranged_refs_by_location()
    if not found:
        print("    none")
        return
    unhandled = []
    for where, refs in sorted(found.items()):
        uniq = sorted(set(refs))
        print(f"    {where}: {len(refs)} ref(s), {len(uniq)} distinct")
        for r in uniq:
            new = range_rewriter(r)
            if new != r:
                print(f"        {r:44} -> {new}")
            elif ":" not in r.split()[-1]:
                print(f"        {r:44}    (chapter range — nothing to renumber)")
            else:
                print(f"        {r:44}    NOT REWRITTEN")
                unhandled.append(r)
    if unhandled:
        print("\n    WARNING: the range rewriter did not recognise the segment range(s) above.\n"
              "             They point at segments being renumbered and would be left stale.\n"
              "             Fix them by hand, or extend range_rewriter(), before running live.")


# ---------------------------------------------------------------------------
# report only — MarkedUpTextChunk records (the citation linker's per-segment data)
# ---------------------------------------------------------------------------

def _text_at(tref, vtitle, lang):
    """Plain text of one segment in one version, or '' if the ref no longer resolves."""
    try:
        return TextChunk(Ref(tref), lang=lang, vtitle=vtitle).text or ""
    except Exception:
        return ""


def report_marked_up_text_chunks():
    """What the cascade would meet in ``marked_up_text_chunks``, and why some of it fails.

    A MarkedUpTextChunk is keyed by (ref, versionTitle, language) and, on save, checks
    itself against the text *at its ref*: the text must be non-empty, no other record
    may hold the same key, and each span's text must match the characters it points
    at.  Two kinds of record trip over that during this migration:

    1. Records already sitting at ``X:1`` / ``<Comm> X:1:Z`` — the slot every ``:2``
       record has to move into.  Like the stale ``X:1`` links, these were built when
       the content still lived at :1, before the heading segment was inserted.
       They block the move with a Duplicate primary key error.
    2. Every ``:2`` record, if it is rewritten BEFORE the text shrinks: at that moment
       the destination still holds the heading (or nothing), so validation fails.

    This prints a sample of (1) so the decision to delete them can be made on real
    data, and counts (2) so the size of the post-trim rewrite is known up front.
    """
    print("\n=== Report: MarkedUpTextChunk records (NOT modified)")
    titles = [BASE_TITLE] + COMMENTARIES
    stale, movers = [], defaultdict(int)
    for title in titles:
        for d in db.marked_up_text_chunks.find({"ref": {"$regex": f"^{re.escape(title)} "}}):
            m = BASE_SEG.match(d["ref"]) or COMM_SEG.match(d["ref"])
            if not m:
                continue
            seg = int(m.group(3))
            if seg == 1:
                stale.append(d)
            elif seg >= 2:
                movers[title] += 1

    print(f"    records that would be MOVED down one segment (after the text is trimmed):")
    for title in titles:
        print(f"      {title:40} {movers[title]:>4}")

    print(f"\n    records ALREADY at segment 1 — the slot the :2 records need: {len(stale)}")
    if not stale:
        return
    by_version = defaultdict(int)
    for d in stale:
        by_version[(d["versionTitle"], d["language"])] += 1
    for (vt, lang), n in sorted(by_version.items(), key=lambda kv: -kv[1]):
        print(f"      {n:>4}  {vt} [{lang}]")

    print("\n    sample (span text vs. what is at that ref today vs. the :2 segment it presumably describes):")
    for d in stale[:8]:
        m = BASE_SEG.match(d["ref"]) or COMM_SEG.match(d["ref"])
        if COMM_SEG.match(d["ref"]):
            content_ref = f"{m.group(1)}{m.group(2)}:2:{m.group(4)}"
        else:
            content_ref = f"{m.group(1)}{m.group(2)}:2"
        here = _text_at(d["ref"], d["versionTitle"], d["language"])
        there = _text_at(content_ref, d["versionTitle"], d["language"])
        spans = [sp for sp in d.get("spans", []) if not sp.get("deleted")]
        print(f"\n      {d['ref']}  ({d['versionTitle']} [{d['language']}])  {len(spans)} span(s)")
        print(f"        text at {d['ref']!s:34}: {here[:70]!r}")
        print(f"        text at {content_ref!s:34}: {there[:70]!r}")
        for sp in spans[:3]:
            a, b = sp["charRange"]
            in_content = there[a:b] == sp["text"]
            print(f"        span [{a}:{b}] {sp['type']:12} {sp['text'][:40]!r:44} "
                  f"{'matches the :2 text' if in_content else 'does NOT match the :2 text either'}")
        if len(spans) > 3:
            print(f"        ... and {len(spans) - 3} more span(s)")
    if len(stale) > 8:
        print(f"\n      ... and {len(stale) - 8} more record(s)")


# ---------------------------------------------------------------------------
# step 6 — drop the "Introduction" node from two of the four books
# ---------------------------------------------------------------------------

INTRO_NODE_TITLES = ["Seder Olam Rabbah", "Vilna Gaon on Seder Olam Rabbah"]


def remove_introduction_nodes():
    """Delete the (empty) 'Introduction' schema node from the two books that want it.

    Only these two — the Yaakov Emden and Meir Ayin Introductions stay.

    remove_branch does not cascade: it deletes the node's own linkset and its text in
    every version, then rebuilds, and leaves notes/topic links/sheets/webpages/history
    alone.  That is fine here only because these nodes are empty and unreferenced.

    handle_dependencies=False is essential.  By default remove_branch() ends with
    handle_dependant_indices(), which sets base_text_mapping = None on every
    structure-matched commentary and disables their automatic commentary linking.
    Running that on the base text here would silently undo the preservation refresh()
    goes out of its way to maintain — and this step runs last, so it would win.
    """
    print("\n=== Step 6: removing the 'Introduction' node")
    if DRY_RUN:
        for title in INTRO_NODE_TITLES:
            print(f"    (dry run) would remove Introduction from {title}")
        return
    for title in INTRO_NODE_TITLES:
        index = library.get_index(title)
        node = next(n for n in index.nodes.children if n.key == "Introduction")
        remove_branch(node, handle_dependencies=False)
        print(f"    removed Introduction from {title}")


# ---------------------------------------------------------------------------
# step 7 — zoom the commentary tables of contents out to the section level
# ---------------------------------------------------------------------------

# The three commentaries are depth 3: Chapter / Paragraph / Comment.  Without
# toc_zoom the book page's table of contents drills all the way to the bottom and
# lists every individual comment, which is unreadable on a text this size.
#
# toc_zoom is read in static/js/BookPage.jsx (the JaggedArrayNode component): it
# computes ``zoom = toc_zoom - 1`` and then renders the tree at ``depth - zoom``.
# So on a depth-3 node, toc_zoom = 2 gives ``3 - 1 = 2`` levels — Chapter, then
# Paragraph — and the links land on section refs like "Vilna Gaon on Seder Olam
# Rabbah 1:1" rather than on "…1:1:1".  That is what nearly every other depth-3
# commentary in the library already does.
TOC_ZOOM_SECTION_LEVEL = 2


def set_commentary_toc_zoom():
    """Set toc_zoom on each commentary's main (default) node.

    Only the default node.  Yaakov Emden and Meir Ayin also carry an
    'Introduction' JaggedArrayNode, but those are depth 2 — zooming them out
    would collapse their table of contents to a single flat list, so they are
    left alone.

    This runs after remove_introduction_nodes() on purpose: remove_branch() saves
    the index itself, and Vilna Gaon is both a commentary and one of the two books
    losing an Introduction.  Setting toc_zoom first would hand that save a stale
    in-memory index and the change could be written back out.
    """
    print("\n=== Step 7: setting toc_zoom on the commentaries")
    for title in COMMENTARIES:
        index = library.get_index(title)
        node = default_node(index)
        current = getattr(node, "toc_zoom", None)
        if current == TOC_ZOOM_SECTION_LEVEL:
            print(f"    {title:44} already toc_zoom={current} — nothing to do")
            continue
        print(f"    {title:44} toc_zoom {current!r} -> {TOC_ZOOM_SECTION_LEVEL}"
              f"   (depth={node.depth}, sectionNames={node.sectionNames})")
        if not DRY_RUN:
            node.toc_zoom = TOC_ZOOM_SECTION_LEVEL
            index.save()


def verify_commentary_linking():
    """Confirm base_text_mapping survived the run.

    Losing it is silent — commentary linking simply stops working later — and this
    migration passes through two separate code paths that clear it by default
    (handle_dependant_indices via refresh(), and again via remove_branch()).  Cheap
    to assert, expensive to notice months from now.
    """
    print("\n=== Verify: automatic commentary linking still configured")
    for title in COMMENTARIES:
        try:
            mapping = getattr(library.get_index(title), "base_text_mapping", None)
        except Exception as e:
            print(f"    {title}: could not load index ({e})")
            continue
        print(f"    {title:44} base_text_mapping={mapping!r}"
              f"{'   <-- LOST' if not mapping else ''}")


if __name__ == "__main__":
    print(f"{'DRY RUN — nothing will be written' if DRY_RUN else '*** LIVE RUN — WRITING ***'}")
    print(f"section lengths: {SECTION_LEN}")
    preflight()
    report_ranged_refs()
    report_marked_up_text_chunks()
    clear_link_collisions()
    clear_stale_mutc()
    delete_dangling_links()
    cascade_refs()
    drop_first_segments()
    refresh()
    recompute_expanded_refs()
    rewrite_marked_up_text_chunks()
    reindex_search()
    remove_introduction_nodes()
    set_commentary_toc_zoom()
    if not DRY_RUN:
        verify_commentary_linking()
    print("\nDone." + ("  Set DRY_RUN=false to apply." if DRY_RUN else ""))
