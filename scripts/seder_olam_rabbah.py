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
``sefaria.helper.schema.resize_jagged_array`` cascades first for exactly the
same reason (see the ``delta < 0`` branch).

Run with:  ./run scripts/seder_olam_rabbah.py
Set DRY_RUN = False to actually write.
"""
import re
from collections import defaultdict

import django
django.setup()

from sefaria.model import *
from sefaria.helper.schema import cascade, refresh_version_state
from sefaria.system.database import db
from sefaria.utils.util import traverse_dict_tree


DRY_RUN = True

BASE_TITLE = "Seder Olam Rabbah"
COMMENTARIES = [f"{c} on Seder Olam Rabbah" for c in ("Vilna Gaon", "Yaakov Emden", "Meir Ayin")]

# Segment 1 must look like one of these before we delete it.  Anything else is
# real content and the section is left untouched.
HEADING = re.compile(r"^\s*(?:פרק\s+[א-ת]{1,3}|Chapter\s+\d+)\s*$")

BASE_SEG = re.compile(r"^(Seder Olam Rabbah )(\d+):(\d+)$")
COMM_SEG = re.compile(r"^((?:Vilna Gaon|Yaakov Emden|Meir Ayin) on Seder Olam Rabbah )(\d+):(\d+):(\d+)$")


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
    """
    chapter = canonical_chapter()
    already = [i for i, sec in enumerate(chapter, start=1)
               if sec and not HEADING.match(str(sec[0])) and str(sec[0]).strip()]
    if already:
        raise SystemExit(
            "ABORT: this looks ALREADY MIGRATED — segment 1 is real content, not a chapter\n"
            f"       heading, in section(s) {already[:5]}{'...' if len(already) > 5 else ''}.\n"
            "       Re-running would shift the colophon refs in sections 10/20/30 down a\n"
            "       second time.  If you are resuming an interrupted run, the text step had\n"
            "       not yet completed and this check would have passed.")
    print(f"preflight OK: {len(chapter)} sections, segment 1 is a heading in all of them")


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
# they are already dangling today (see report_dangling_refs) and renumbering
# them would only move the breakage around.

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
        m = BASE_SEG.match(tref)
        if not m:
            return False
        section, seg = int(m.group(2)), int(m.group(3))
        if seg != segment or seg < 2:
            return False
        return seg <= SECTION_LEN.get(section, 0)   # skip pre-existing dangling refs
    return needs_rewrite


def comm_rewriter(tref, *_):
    m = COMM_SEG.match(tref)
    if not m or int(m.group(3)) != 2:
        return tref
    return f"{m.group(1)}{m.group(2)}:1:{m.group(4)}"


def comm_needs_rewrite(tref, record=None):
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
    links = list(db.links.find({"refs": {"$regex": BASE_TITLE}}, {"refs": 1}))
    occupied = defaultdict(list)
    for l in links:
        occupied[tuple(sorted(l["refs"]))].append(l["_id"])

    victims = {}
    for l in links:
        new_refs = []
        for r in l["refs"]:
            m = BASE_SEG.match(r)
            if m and 2 <= int(m.group(3)) <= SECTION_LEN.get(int(m.group(2)), 0):
                new_refs.append(f"{m.group(1)}{m.group(2)}:{int(m.group(3)) - 1}")
            else:
                new_refs.append(r)
        new_key, old_key = tuple(sorted(new_refs)), tuple(sorted(l["refs"]))
        if new_key == old_key:
            continue
        for other in occupied.get(new_key, []):
            if other != l["_id"]:
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

    Writes straight to the Version rather than going through TextChunk, the way
    resize_jagged_array does — a TextChunk built mid-change can pick up refs
    that are momentarily inconsistent.
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


def drop_first_segments():
    print("\n=== Step 3: removing the heading segment from the text")
    print(f"\n--- {BASE_TITLE}")
    drop_first_segment(BASE_TITLE)
    for title in COMMENTARIES:
        print(f"\n--- {title}")
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


# ---------------------------------------------------------------------------
# report only — pre-existing breakage, untouched by this migration
# ---------------------------------------------------------------------------

def report_dangling_refs():
    """Links pointing past the end of a section.  These are broken *today*,
    left over from an earlier restructuring, and this script deliberately does
    not renumber them.  Reported so they can be dealt with separately."""
    print("\n=== Report: pre-existing dangling refs (NOT modified)")
    counts = defaultdict(int)
    for l in db.links.find({"refs": {"$regex": BASE_TITLE}}, {"refs": 1}):
        for r in l["refs"]:
            m = BASE_SEG.match(r)
            if m and int(m.group(3)) > SECTION_LEN.get(int(m.group(2)), 0):
                counts[r] += 1
    print(f"    {len(counts)} distinct refs across {sum(counts.values())} links")
    for r in sorted(counts, key=lambda x: (int(x.split()[-1].split(':')[0]), int(x.split(':')[-1]))):
        sec = int(r.split()[-1].split(':')[0])
        print(f"      {r:34} in {counts[r]:>2} link(s)   [section has {SECTION_LEN.get(sec, 0)} segments]")


if __name__ == "__main__":
    print(f"{'DRY RUN — nothing will be written' if DRY_RUN else '*** LIVE RUN — WRITING ***'}")
    print(f"section lengths: {SECTION_LEN}")
    preflight()
    report_dangling_refs()
    clear_link_collisions()
    cascade_refs()
    drop_first_segments()
    refresh()
    print("\nDone." + ("  Set DRY_RUN = False to apply." if DRY_RUN else ""))
