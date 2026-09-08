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

    Lets a run be driven without editing the file, which matters on a cauldron:
        DRY_RUN=false REINDEX_SEARCH=true ./run scripts/seder_olam_rabbah.py
    """
    raw = os.environ.get(name)
    if raw is None or not raw.strip():
        # An empty value (DRY_RUN= ...) must not read as False — that would turn a
        # typo into a live run of a destructive migration.
        return default
    return raw.strip().lower() in ("1", "true", "yes", "y", "on")


DRY_RUN = _env_flag("DRY_RUN", True)

# Rewriting Elasticsearch is a separate switch: it needs SEARCH_URL pointing at a
# cluster you may WRITE to.  The default local_settings points SEARCH_URL at
# https://www.sefaria.org/api/search, so leaving this False keeps a local run from
# reaching out to production's search index.  It is also ignored while DRY_RUN is on
# — see reindex_search() for why reindexing an unchanged text is worse than useless.
REINDEX_SEARCH = _env_flag("REINDEX_SEARCH", False)

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
# report only — pre-existing breakage, untouched by this migration
# ---------------------------------------------------------------------------

def report_dangling_refs():
    """Links pointing past the end of a section.  These are broken *today*,
    left over from an earlier restructuring, and this script deliberately does
    not renumber them.  Reported so they can be dealt with separately.

    The other side of each link is printed too: knowing that 'Seder Olam Rabbah 5:3'
    is dangling says nothing about how to fix it, but knowing what it was linked to
    usually does — a commentary anchored there points at which segment it meant,
    and a cluster of links from one work suggests they all shifted together.
    """
    print("\n=== Report: pre-existing dangling refs (NOT modified)")
    partners = defaultdict(list)
    for l in db.links.find({"refs": {"$regex": BASE_TITLE}}, {"refs": 1, "type": 1}):
        for i, r in enumerate(l["refs"]):
            m = BASE_SEG.match(r)
            if m and int(m.group(3)) > SECTION_LEN.get(int(m.group(2)), 0):
                # A link's `refs` is a 2-element list, so the partner is the other
                # entry.  Guard the length anyway — malformed links do exist, and a
                # report is the last place that should raise.
                other = [x for j, x in enumerate(l["refs"]) if j != i]
                partners[r].append((other[0] if other else "(no partner ref)",
                                    l.get("type") or ""))
    total = sum(len(v) for v in partners.values())
    print(f"    {len(partners)} distinct refs across {total} links")
    for r in sorted(partners, key=lambda x: (int(x.split()[-1].split(':')[0]), int(x.split(':')[-1]))):
        sec = int(r.split()[-1].split(':')[0])
        print(f"      {r:34} in {len(partners[r]):>2} link(s)   "
              f"[section has {SECTION_LEN.get(sec, 0)} segments]")
        for other, ltype in sorted(partners[r]):
            print(f"          linked to  {other}{f'  ({ltype})' if ltype else ''}")


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
    """
    print("\n=== Step 6: removing the 'Introduction' node")
    if DRY_RUN:
        for title in INTRO_NODE_TITLES:
            print(f"    (dry run) would remove Introduction from {title}")
        return
    for title in INTRO_NODE_TITLES:
        index = library.get_index(title)
        node = next(n for n in index.nodes.children if n.key == "Introduction")
        remove_branch(node)
        print(f"    removed Introduction from {title}")


if __name__ == "__main__":
    print(f"{'DRY RUN — nothing will be written' if DRY_RUN else '*** LIVE RUN — WRITING ***'}")
    print(f"section lengths: {SECTION_LEN}")
    preflight()
    report_dangling_refs()
    report_marked_up_text_chunks()
    clear_link_collisions()
    clear_stale_mutc()
    cascade_refs()
    drop_first_segments()
    refresh()
    rewrite_marked_up_text_chunks()
    reindex_search()
    remove_introduction_nodes()
    print("\nDone." + ("  Set DRY_RUN = False to apply." if DRY_RUN else ""))
