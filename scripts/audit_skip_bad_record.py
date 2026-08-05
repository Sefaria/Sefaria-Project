# -*- coding: utf-8 -*-
"""
Audit every skip_bad_record / log_skip guard site by feeding it real bad data.

WHAT THIS IS FOR
    The guards added in PR #3442 make the library-cache build survive one corrupt DB
    record: the record is logged, recorded in sefaria.helper.skip_tracking, and skipped,
    instead of aborting startup / reset_cache / reset_toc. sefaria/helper/tests/
    skip_tracking_test.py proves the *mechanism* works, but it does so with MagicMock
    loggers and hand-raised exceptions -- it never touches a single real guard site.

    This script closes that gap from the other end. For each guard site it inserts a
    genuinely malformed document into a LOCAL Mongo, runs the narrowest build function
    that reaches that site, and reports what actually happened:

        CAUGHT      the guard fired and recorded the skip, with the expected error type
        WRONG_SITE  a skip was recorded, but by some other guard than the one under test
        PROPAGATED  the exception escaped the guard entirely (the build would abort)
        NO_EFFECT   the bad record caused no error and no skip (corruption was benign)

    PROPAGATED is not automatically a bug: BAD_RECORD_EXCEPTIONS deliberately excludes
    AttributeError and TypeError so that ordinary code bugs still crash loudly rather
    than degrading into a silently incomplete library. The report labels those cases
    `by design`. What matters is the ones NOT labelled that way -- those are corruptions
    a real DB can hold that would still take the site down.

SAFETY
    * Refuses to run unless MONGO_HOST resolves to localhost/127.0.0.1. There is no
      override flag; point it somewhere else and it exits non-zero.
    * Never mutates or deletes an existing document. Everything it writes is synthetic,
      so cleanup is a delete, not a restore-from-snapshot that can be lost mid-run.
    * Every insert is journalled to disk before the build runs, so even a hard kill
      leaves an exact list of what to remove; `--clean` replays it. Synthetic documents
      are additionally named `ZZAudit*` / `zzaudit-*` so leftovers stay identifiable by
      hand if the journal is lost.
    * Cleans up per case in a finally block, and again via atexit.
    * Slack is patched out for the whole run; nothing reaches #engineering-signal.

USAGE
    ./run audit_skip_bad_record.py                  # run every case, print the report
    ./run audit_skip_bad_record.py --list           # show the case table, touch nothing
    ./run audit_skip_bad_record.py --only S1 S3     # run only certain sites
    ./run audit_skip_bad_record.py --clean          # purge leftovers from a hard kill
"""
import argparse
import atexit
import json
import os
import sys
import tempfile
import traceback
from contextlib import contextmanager
from unittest.mock import patch

import django

django.setup()

from django.conf import settings

from sefaria.system.database import db
from sefaria.helper.skip_tracking import reset_skip_counts, get_skip_records

# Outcome codes, ordered worst-first for the report summary.
CAUGHT, WRONG_SITE, PROPAGATED, NO_EFFECT = "CAUGHT", "WRONG_SITE", "PROPAGATED", "NO_EFFECT"


# ---------------------------------------------------------------------------
# Safety
# ---------------------------------------------------------------------------

def assert_local_mongo():
    """Hard-fail unless Mongo is local. Deliberately has no override flag."""
    host = getattr(settings, "MONGO_HOST", None)
    hosts = host if isinstance(host, (list, tuple)) else [host]
    local = {"localhost", "127.0.0.1", "::1", "mongo", None}
    bad = [h for h in hosts if h not in local]
    if bad:
        sys.exit(
            "REFUSING TO RUN: MONGO_HOST is {!r}.\n"
            "This script writes malformed documents and is only ever safe against a\n"
            "local, disposable Mongo. Point MONGO_HOST at localhost and re-run.".format(host)
        )
    print("Mongo host {!r}, db {!r} -- local, proceeding.".format(host, settings.SEFARIA_DB))


# ---------------------------------------------------------------------------
# Synthetic-document bookkeeping
# ---------------------------------------------------------------------------

_inserted = []  # [(collection_name, _id)] pending cleanup

# Every synthetic document is journalled to disk the moment it is written, so a hard kill
# (Ctrl-C, OOM, power loss) still leaves an exact record of what to delete.
#
# An in-document marker field was the obvious alternative and does NOT work: several
# models validate that a loaded document has no unrecognised keys, so an extra
# `_skip_audit` field makes Topic.load() raise
# "Topic record loaded with unhandled key(s)" -- the marker itself corrupts the record and
# every result for that collection becomes an artefact of the harness.
JOURNAL = os.path.join(tempfile.gettempdir(), "skip_bad_record_audit_journal.jsonl")

# Belt-and-braces for a lost journal: every synthetic document names itself with one of
# these prefixes, so leftovers stay identifiable by hand.
NAME_PREFIXES = ("ZZAudit", "zzaudit-")
NAME_FIELDS = ("title", "slug", "name", "lastPath", "headword", "parent_lexicon",
               "fromTopic", "first_comment_section_ref")


def insert(collection, doc):
    """Insert one synthetic document, journal it, and remember it for cleanup."""
    _id = db[collection].insert_one(dict(doc)).inserted_id
    _inserted.append((collection, _id))
    with open(JOURNAL, "a") as f:
        f.write(json.dumps({"collection": collection, "_id": str(_id)}) + "\n")
    return _id


def cleanup():
    """Delete everything inserted this run. Safe to call repeatedly."""
    while _inserted:
        collection, _id = _inserted.pop()
        try:
            db[collection].delete_one({"_id": _id})
        except Exception as e:  # never let cleanup mask the real failure
            print("  ! cleanup failed for {}/{}: {}".format(collection, _id, e))


atexit.register(cleanup)


def purge(collections):
    """Delete leftovers from a previous hard kill: journalled ids first, then by name."""
    from bson import ObjectId

    total = 0
    if os.path.exists(JOURNAL):
        with open(JOURNAL) as f:
            for line in f:
                try:
                    entry = json.loads(line)
                    total += db[entry["collection"]].delete_one(
                        {"_id": ObjectId(entry["_id"])}).deleted_count
                except Exception:
                    continue
        os.remove(JOURNAL)

    for collection in sorted(collections):
        for field in NAME_FIELDS:
            for prefix in NAME_PREFIXES:
                total += db[collection].delete_many(
                    {field: {"$regex": "^" + prefix}}).deleted_count

    print("Purged {} leftover audit document(s).".format(total))
    return total


# ---------------------------------------------------------------------------
# Triggers -- the narrowest build function that reaches each guard site.
#
# Running the full library.rebuild() for all ~50 cases would take well over an hour and
# would blur which loop actually skipped. Each trigger below runs one builder instead.
# ---------------------------------------------------------------------------

def _toc_tree():
    from sefaria.model.category import TocTree
    from sefaria.model.text import library
    return TocTree(lib=library)


def _toc_tree_serialize():
    _toc_tree().get_serialized_toc()


def _index_maps():
    from sefaria.model.text import library
    library._build_index_maps()


def _all_index_records():
    from sefaria.model.text import library
    library._build_index_maps()
    library.all_index_records()


def _term_mappings():
    from sefaria.model.text import library
    library.build_term_mappings()


def _topic_mapping():
    from sefaria.model.text import library
    library._build_topic_mapping()


def _topic_toc():
    from sefaria.model.text import library
    library.get_topic_toc(rebuild=True)


def _topic_toc_category_mapping():
    from sefaria.model.text import library
    library.get_topic_toc(rebuild=True)
    library.build_topic_toc_category_mapping()


def _virtual_books():
    from sefaria.model.text import library
    library.build_virtual_books()


def _autocompleter_users():
    from sefaria.model.autospell import AutoCompleter
    from sefaria.model.text import library
    AutoCompleter("en", library, include_titles=False, include_topics=False,
                  include_users=True, include_collections=False)


def _lexicon_trie():
    from sefaria.model.autospell import LexiconTrie
    LexiconTrie("Jastrow Dictionary")


def _category_matcher():
    from sefaria.model.category import CategorySet
    from sefaria.model.linker.category_resolver import CategoryMatcher
    CategoryMatcher("en", list(CategorySet()))


def _match_template_trie():
    """Build the trie over the audit's own index nodes, not a slice of the library.

    Sampling the first N of ~6,500 index records made this silently never visit the
    seeded record, which reported as NO_EFFECT and looked like a passing guard.
    """
    from sefaria.model.linker.match_template import MatchTemplateTrie
    from sefaria.model.text import library
    records = library.all_index_records()
    nodes = [i.nodes for i in records if getattr(i, "title", "").startswith("ZZAudit")]
    MatchTemplateTrie("en", nodes=nodes or [i.nodes for i in records[:50]])


# Triggers that leave library in-memory maps rebuilt from corrupt data. After one of
# these, later cases would read poisoned state (a half-built _index_map makes
# all_index_records raise KeyError for every real book), so the baseline is restored.
POISONS_LIBRARY = {_index_maps, _all_index_records}


def restore_library_baseline():
    """Rebuild library's in-memory index maps from the now-clean DB.

    Without this, one case's failure cascades into every later case's result. The probe
    that motivated this: a corrupt index aborts _build_index_maps() midway, and the very
    next TocTree build then records 6,000+ KeyErrors from all_index_records against the
    stump of an index map.
    """
    from sefaria.model.text import library
    library._build_index_maps()


# ---------------------------------------------------------------------------
# Case table
#
# Each case: a synthetic bad document, the builder that reaches the guard, and what the
# guard is expected to do. `by_design=True` marks a propagation that BAD_RECORD_EXCEPTIONS
# deliberately allows (AttributeError / TypeError = code-bug symptoms, not bad data).
# ---------------------------------------------------------------------------

def case(site, operation, corruption, collection, doc, trigger, expect,
         error_type=None, by_design=False, note=None, extra_docs=None, skip=None):
    """One audit case.

    `extra_docs` seeds additional documents the corruption needs in order to be REACHED --
    e.g. a bad child topic is only visited if an IntraTopicLink makes it a child of
    something. `skip` marks a case that cannot run under this script's constraints, with
    the reason; it is reported rather than silently dropped.
    """
    docs = [(collection, doc)] + list(extra_docs or [])
    return dict(site=site, operation=operation, corruption=corruption, collection=collection,
                docs=docs, trigger=trigger, expect=expect, error_type=error_type,
                by_design=by_design, note=note, skip=skip)


def _index_doc(title, **overrides):
    """A minimally valid Index document, so each case corrupts exactly one thing."""
    doc = {
        "title": title,
        "categories": ["Tanakh", "Torah"],
        "schema": {
            "nodeType": "JaggedArrayNode",
            "depth": 1,
            "addressTypes": ["Integer"],
            "sectionNames": ["Line"],
            "titles": [{"text": title, "lang": "en", "primary": True},
                       {"text": "א" + title, "lang": "he", "primary": True}],
            "title": title,
            "key": title,
        },
    }
    doc.update(overrides)
    return doc


def _topic_doc(slug, **overrides):
    doc = {
        "slug": slug,
        "titles": [{"text": slug, "lang": "en", "primary": True},
                   {"text": "א" + slug, "lang": "he", "primary": True}],
    }
    doc.update(overrides)
    return doc


CASES = [
    # -- category.py:223  TocTree vstate record -----------------------------------
    case("S1", "TocTree vstate record", "vstate doc with no `title` field",
         "vstate", {"first_section_ref": "Audit 1", "flags": {}},
         _toc_tree, CAUGHT, "KeyError"),
    case("S1", "TocTree vstate record", "`flags` is a string instead of a dict",
         "vstate", {"title": "ZZAudit_vs_flags_str", "first_section_ref": "Audit 1", "flags": "broken"},
         _toc_tree, PROPAGATED, "AttributeError", by_design=True),
    case("S1", "TocTree vstate record", "`flags` is null",
         "vstate", {"title": "ZZAudit_vs_flags_null", "first_section_ref": "Audit 1", "flags": None},
         _toc_tree, PROPAGATED, "AttributeError", by_design=True),

    # -- category.py:238  TocTree first_comment link ------------------------------
    case("S2", "TocTree first_comment link", "link with no `first_comment_indexes`",
         "links", {"is_first_comment": True, "first_comment_section_ref": "Audit 1"},
         _toc_tree, CAUGHT, "KeyError"),
    case("S2", "TocTree first_comment link", "link with no `first_comment_section_ref`",
         "links", {"is_first_comment": True, "first_comment_indexes": ["ZZAuditA", "ZZAuditB"]},
         _toc_tree, CAUGHT, "KeyError"),
    case("S2", "TocTree first_comment link", "`first_comment_indexes` is an int, not a list",
         "links", {"is_first_comment": True, "first_comment_indexes": 5,
                   "first_comment_section_ref": "Audit 1"},
         _toc_tree, PROPAGATED, "TypeError", by_design=True),

    # -- category.py:246  TocTree index -------------------------------------------
    case("S3", "TocTree index", "index whose `categories` is empty",
         "index", _index_doc("ZZAuditEmptyCats", categories=[]),
         _toc_tree, PROPAGATED, "InputError",
         note="rejected by Index.load_from_dict during IndexSet() iteration, so it aborts "
              "_build_index_maps before the TocTree guard is ever reached"),
    case("S3", "TocTree index", "index whose `categories` is a string, not a list",
         "index", _index_doc("ZZAuditStrCats", categories="Tanakh"),
         _toc_tree, NO_EFFECT,
         note="lookup('T','a','n'...) simply misses; logged+continue, not a skip"),
    case("S3", "TocTree index", "commentary index naming a nonexistent base text",
         "index", _index_doc("ZZAuditOrphanComm", dependence="Commentary",
                             base_text_titles=["ZZNoSuchBaseText"],
                             collective_title="ZZAuditOrphanComm"),
         _toc_tree, CAUGHT, "InputError"),
    case("S3", "TocTree index", "`base_text_titles` is an int, not a list",
         "index", _index_doc("ZZAuditBadBTT", dependence="Commentary", base_text_titles=7),
         _toc_tree, PROPAGATED, "TypeError", by_design=True),

    # -- category.py:272  TocTree collection ---------------------------------------
    case("S4", "TocTree collection", "collection with `toc` set but no `name`",
         "groups", {"toc": {"categories": ["Tanakh"], "title": "ZZAudit"}, "listed": True,
                    "slug": "zzaudit-no-name"},
         _toc_tree, CAUGHT, "KeyError"),
    case("S4", "TocTree collection", "collection whose `toc` is a string",
         "groups", {"toc": "not-a-dict", "listed": True, "slug": "zzaudit-toc-str"},
         _toc_tree, PROPAGATED, "AttributeError", by_design=True),

    # -- category.py:340  TocTree._add_category ------------------------------------
    case("S5", "TocTree._add_category", "category whose parent path does not exist",
         "category", {"path": ["ZZAuditNoParent", "ZZAuditChild"], "lastPath": "ZZAuditChild",
                      "depth": 2},
         _toc_tree, CAUGHT, "KeyError"),
    case("S5", "TocTree._add_category", "category with an empty `path`",
         "category", {"path": [], "lastPath": "", "depth": 0},
         _toc_tree, NO_EFFECT, note="empty path attaches to root without raising"),

    # -- category.py:464  TocTree.serialize node -----------------------------------
    case("S6", "TocTree.serialize node", "category whose `sharedTitle` names a nonexistent term",
         "category", {"path": ["Tanakh", "ZZAuditSerialize"], "lastPath": "ZZAuditSerialize",
                      "depth": 2, "sharedTitle": "ZZNoSuchTerm"},
         _toc_tree_serialize, PROPAGATED, "IndexError",
         note="IndexError IS in BAD_RECORD_EXCEPTIONS, but it is raised during TocTree "
              "__init__/_sort, outside every with-block -- see `escaped at` column"),

    # -- text.py:5036  _build_index_maps index record ------------------------------
    case("S7", "_build_index_maps index record", "index whose `schema` is not a dict",
         "index", _index_doc("ZZAuditSchemaStr", schema={"nodes": "not-a-list"}),
         _index_maps, PROPAGATED, "AttributeError", by_design=True,
         note="raises in IndexSet() iteration, OUTSIDE the with-block"),
    case("S7", "_build_index_maps index record", "index with no `title`",
         "index", {"categories": ["Tanakh", "Torah"], "schema": _index_doc("x")["schema"]},
         _index_maps, PROPAGATED, "AttributeError", by_design=True,
         note="raises in IndexSet() iteration, OUTSIDE the with-block"),

    # -- text.py:5046  _build_index_maps title dict --------------------------------
    case("S8", "_build_index_maps title dict", "index whose schema titles have no primary",
         "index", _index_doc("ZZAuditNoPrimary",
                             schema=dict(_index_doc("ZZAuditNoPrimary")["schema"],
                                         titles=[{"text": "ZZAuditNoPrimary", "lang": "en"}])),
         _index_maps, CAUGHT, "IndexSchemaError"),

    # -- text.py:5242  get_topic_toc_json_recursive top-level topic ----------------
    case("S9", "get_topic_toc_json_recursive top-level topic", "top-level topic with no `slug`",
         "topics", {"isTopLevelDisplay": True,
                    "titles": [{"text": "ZZAuditNoSlug", "lang": "en", "primary": True}]},
         _topic_toc, PROPAGATED, "AttributeError",
         note="this is the exact corruption the guard was added for, and it is NOT caught: "
              "a missing attribute on a Mongo record surfaces as AttributeError, which "
              "BAD_RECORD_EXCEPTIONS deliberately excludes"),

    # -- text.py:5260  topic TOC child ---------------------------------------------
    # A bad child topic is only visited if a 'displays-under' link makes it a child, so
    # each case seeds a valid top-level parent plus the link alongside the bad child.
    case("S10", "topic TOC child", "child topic whose `titles` is a string, not a list",
         "topics", _topic_doc("zzaudit-child-strtitles", titles="notalist"),
         _topic_toc, PROPAGATED, "AttributeError", by_design=True,
         extra_docs=[
             ("topics", dict(_topic_doc("zzaudit-parent"), isTopLevelDisplay=True,
                             )),
             ("topic_links", {"class": "intraTopic", "linkType": "displays-under",
                              "fromTopic": "zzaudit-child-strtitles", "toTopic": "zzaudit-parent",
                              "dataSource": "sefaria"}),
         ]),
    case("S10", "topic TOC child", "child topic with an empty `titles` list",
         "topics", _topic_doc("zzaudit-child-notitles", titles=[]),
         _topic_toc, NO_EFFECT,
         note="TitleGroup.primary_title() returns '' for a missing title instead of raising",
         extra_docs=[
             ("topics", dict(_topic_doc("zzaudit-parent2"), isTopLevelDisplay=True,
                             )),
             ("topic_links", {"class": "intraTopic", "linkType": "displays-under",
                              "fromTopic": "zzaudit-child-notitles", "toTopic": "zzaudit-parent2",
                              "dataSource": "sefaria"}),
         ]),

    # -- text.py:5703  build_term_mappings term ------------------------------------
    case("S11", "build_term_mappings term", "term with an empty `titles` list",
         "term", {"name": "ZZAuditTermNoTitles", "titles": []},
         _term_mappings, NO_EFFECT,
         note="TitleGroup.primary_title() returns '' rather than raising (schema.py:88)"),
    case("S11", "build_term_mappings term", "term whose titles have no primary",
         "term", {"name": "ZZAuditTermNoPrimary",
                  "titles": [{"text": "ZZAuditTermNoPrimary", "lang": "en"}]},
         _term_mappings, NO_EFFECT,
         note="same -- absent primary degrades to '' silently"),
    case("S11", "build_term_mappings term", "term whose `titles` is a string, not a list",
         "term", {"name": "ZZAuditTermStrTitles", "titles": "notalist"},
         _term_mappings, PROPAGATED, "AttributeError", by_design=True),
    case("S11", "build_term_mappings term", "term with no `name`",
         "term", {"titles": [{"text": "ZZAuditTermNoName", "lang": "en", "primary": True},
                             {"text": "א", "lang": "he", "primary": True}]},
         _term_mappings, PROPAGATED, "AttributeError", by_design=True),

    # -- text.py:5780  _build_topic_mapping topic ----------------------------------
    case("S12", "_build_topic_mapping topic", "topic with an empty `titles` list",
         "topics", _topic_doc("zzaudit-topic-notitles", titles=[]),
         _topic_mapping, NO_EFFECT,
         note="TitleGroup.primary_title() returns '' rather than raising"),
    case("S12", "_build_topic_mapping topic", "topic whose `titles` is a string, not a list",
         "topics", _topic_doc("zzaudit-topic-strtitles", titles="notalist"),
         _topic_mapping, PROPAGATED, "AttributeError", by_design=True),
    case("S12", "_build_topic_mapping topic", "topic with an English title but no Hebrew",
         "topics", _topic_doc("zzaudit-topic-noheb",
                              titles=[{"text": "ZZAuditNoHeb", "lang": "en", "primary": True}]),
         _topic_mapping, NO_EFFECT, note="get_primary_title('he') returns '' rather than raising"),

    # -- text.py:5857  all_index_records (narrowed to KeyError) --------------------
    case("S13", "all_index_records key (title/nodes.key mismatch)",
         "index whose `title` differs from its schema `key` -- the sc-45009 shape",
         "index", _index_doc("ZZAuditKeyMismatch",
                             schema=dict(_index_doc("ZZAuditKeyMismatch")["schema"],
                                         key="ZZAuditDifferentKey")),
         _all_index_records, CAUGHT, "KeyError"),

    # -- text.py:6031  build_virtual_books index -----------------------------------
    case("S14", "build_virtual_books index", "dictionary index with a `lexiconName` but no title",
         "index", {"lexiconName": "ZZAuditLexicon", "categories": ["Reference", "Dictionary"],
                   "schema": _index_doc("x")["schema"]},
         _virtual_books, PROPAGATED, "AttributeError", by_design=True,
         note="raises in IndexSet() iteration, OUTSIDE the with-block"),

    # -- autospell.py:129  AutoCompleter user --------------------------------------
    case("S15", "AutoCompleter user", "profile whose `user` sub-document has no `slug`",
         "profiles", {"id": 999999001, "slug": None, "first_name": "ZZAudit"},
         _autocompleter_users, CAUGHT, "KeyError",
         skip="needs a Postgres auth_user row (User.objects.in_bulk) plus a public sheet "
              "for aggregate_profiles() to return it -- out of scope for a Mongo-only script"),

    # -- autospell.py:498  LexiconTrie entry ---------------------------------------
    case("S16", "LexiconTrie(...) entry", "lexicon entry with no `headword`",
         "lexicon_entry", {"parent_lexicon": "Jastrow Dictionary", "content": {}},
         _lexicon_trie, PROPAGATED, "AttributeError", by_design=True),
    case("S16", "LexiconTrie(...) entry", "lexicon entry whose `headword` is an int",
         "lexicon_entry", {"parent_lexicon": "Jastrow Dictionary", "headword": 12345,
                           "content": {}},
         _lexicon_trie, PROPAGATED, "TypeError", by_design=True),

    # -- category_resolver.py:55  CategoryMatcher category -------------------------
    # The missing-term-slug corruption is handled by the inner log_skip (see S20), so the
    # outer guard needs a match_template that is structurally malformed instead.
    case("S17", "CategoryMatcher category", "category whose `match_templates` is a string",
         "category", {"path": ["Tanakh", "ZZAuditMTStr"], "lastPath": "ZZAuditMTStr",
                      "depth": 2, "match_templates": "notalist"},
         _category_matcher, PROPAGATED, "AttributeError", by_design=True),

    # -- match_template.py:72  MatchTemplateTrie node ------------------------------
    case("S18", "MatchTemplateTrie node", "index whose node match_template names a missing term",
         "index", _index_doc("ZZAuditMTTrie",
                             schema=dict(_index_doc("ZZAuditMTTrie")["schema"],
                                         match_templates=[{"term_slugs": ["zz-no-such-term"]}])),
         _match_template_trie, NO_EFFECT,
         note="handled upstream by __log_non_existent_term_warning, which swallows it "
              "before the guard sees anything"),
    case("S18", "MatchTemplateTrie node", "index whose node `match_templates` is a string",
         "index", _index_doc("ZZAuditMTTrieStr",
                             schema=dict(_index_doc("ZZAuditMTTrieStr")["schema"],
                                         match_templates="notalist")),
         _match_template_trie, PROPAGATED, "TypeError", by_design=True),
]


# log_skip sites take a different shape: no exception is raised at all, so they are
# identified by (operation, detail) rather than by error type.
LOG_SKIP_CASES = [
    case("S19", "build_topic_toc_category_mapping", "top-level topic-toc node with no `slug`",
         "topics", {"isTopLevelDisplay": True,
                    "titles": [{"text": "ZZAuditTocNoSlug", "lang": "en", "primary": True}]},
         _topic_toc_category_mapping, PROPAGATED, "AttributeError",
         note="unreachable in practice: the same slugless topic crashes get_topic_toc() "
              "upstream (S9), so this log_skip never gets the chance to fire"),
    case("S20", "CategoryMatcher category match_template",
         "category match_template pointing at a nonexistent term slug",
         "category", {"path": ["Tanakh", "ZZAuditNoTermSlug"], "lastPath": "ZZAuditNoTermSlug",
                      "depth": 2, "match_templates": [{"term_slugs": ["zz-absent-slug"]}]},
         _category_matcher, CAUGHT, None),
]

ALL_CASES = CASES + LOG_SKIP_CASES
TOUCHED_COLLECTIONS = {coll for c in ALL_CASES for coll, _ in c["docs"]}


# ---------------------------------------------------------------------------
# Runner
# ---------------------------------------------------------------------------

@contextmanager
def slack_muted():
    """No audit run may post to #engineering-signal."""
    with patch("sefaria.helper.skip_tracking.notify_engineering_signal") as m:
        yield m


def _exception_named(name):
    """Resolve an exception class name to the class, for subclass-aware comparison."""
    import builtins

    from sefaria.system import exceptions as sefaria_exceptions
    return getattr(sefaria_exceptions, name, None) or getattr(builtins, name, None)


def error_type_matches(actual, expected):
    """True if `actual` is `expected` or a subclass of it.

    The guards catch by base class, so a site that records BookNameError has satisfied an
    expectation of InputError -- BookNameError is one of its subclasses. Comparing the
    names as plain strings would flag that as a mismatch and bury the real differences.
    """
    if not expected or actual == expected:
        return True
    a, e = _exception_named(actual), _exception_named(expected)
    return bool(a and e and issubclass(a, e))


def escape_point(exc):
    """Deepest sefaria frame in the traceback -- i.e. where the exception got past the guard.

    This is what distinguishes 'the guard's exception tuple was too narrow' from 'the
    exception was raised somewhere the guard does not wrap at all', which is the more
    interesting failure and is invisible from the exception type alone.
    """
    frames = [f for f in traceback.extract_tb(exc.__traceback__) if "/sefaria/" in f.filename]
    if not frames:
        return ""
    f = frames[-1]
    return "{}:{} in {}()".format(f.filename.split("/sefaria/")[-1], f.lineno, f.name)


def run_case(c, index, total):
    """Seed the bad document(s), run the builder, classify what the guard did, clean up."""
    print("[{:>2}/{}] {} {} -- {}".format(index, total, c["site"], c["operation"], c["corruption"]))
    if c["skip"]:
        print("      -> SKIPPED ({})".format(c["skip"]))
        return dict(c, outcome="SKIPPED", detail=c["skip"], matched=True, escaped_at="")

    reset_skip_counts()
    raised = None
    try:
        for collection, doc in c["docs"]:
            insert(collection, doc)

        # The TocTree/linker builders read indexes from library's in-memory _index_map, not
        # from Mongo, so a freshly-inserted bad index is never visited without a rebuild --
        # every such case would otherwise report a misleading NO_EFFECT. This runs INSIDE
        # the measured region: at a real startup _build_index_maps() runs before the TOC
        # build anyway, so an index that breaks the rebuild is a genuine result for the
        # case, not a harness error.
        needs_refresh = (any(coll == "index" for coll, _ in c["docs"])
                         and c["trigger"] not in POISONS_LIBRARY)
        try:
            if needs_refresh:
                restore_library_baseline()
            c["trigger"]()
        except BaseException as e:                      # noqa: BLE001 -- classifying, not handling
            raised = e
        records = get_skip_records()
    finally:
        cleanup()
        if c["trigger"] in POISONS_LIBRARY or raised is not None:
            try:
                restore_library_baseline()
            except Exception as e:
                print("  ! baseline restore failed: {}".format(e))
        reset_skip_counts()

    ours = [r for r in records if r.operation == c["operation"]]
    escaped_at = escape_point(raised) if raised is not None else ""
    if raised is not None and not ours:
        outcome = PROPAGATED
        detail = "{}: {}".format(type(raised).__name__, str(raised)[:100])
    elif ours:
        outcome = CAUGHT
        detail = "{} x{}".format(ours[0].error_type or "log_skip", len(ours))
        if ours[0].error_type and not error_type_matches(ours[0].error_type, c["error_type"]):
            detail += " (expected {})".format(c["error_type"])
    elif records:
        outcome = WRONG_SITE
        detail = "skipped at {!r} instead".format(records[0].operation)
    else:
        outcome = NO_EFFECT
        detail = "no error, no skip"

    matched = outcome == c["expect"]
    print("      -> {} ({}){}{}".format(
        outcome, detail,
        "  escaped at " + escaped_at if escaped_at else "",
        "" if matched else "  !! EXPECTED " + c["expect"]))
    return dict(c, outcome=outcome, detail=detail, matched=matched, escaped_at=escaped_at)


def report(results):
    """Print the audit table: one row per case, grouped by guard site."""
    by_outcome = {}
    for r in results:
        by_outcome.setdefault(r["outcome"], []).append(r)

    print("\n" + "=" * 100)
    print("SKIP_BAD_RECORD AUDIT -- {} cases across {} guard sites".format(
        len(results), len({r["site"] for r in results})))
    print("=" * 100)

    width = max(len(r["corruption"]) for r in results)
    current = None
    for r in results:
        if r["site"] != current:
            current = r["site"]
            print("\n{}  {}".format(r["site"], r["operation"]))
        flag = "ok " if r["matched"] else "DIFF"
        design = "  [by design]" if r["by_design"] and r["outcome"] == PROPAGATED else ""
        print("  {} {:<12} {:<{w}}  {}{}".format(
            flag, r["outcome"], r["corruption"], r["detail"], design, w=width))
        if r.get("escaped_at"):
            print("       escaped at: {}".format(r["escaped_at"]))
        if r["note"]:
            print("       note: {}".format(r["note"]))

    print("\n" + "-" * 100)
    for outcome in (CAUGHT, PROPAGATED, WRONG_SITE, NO_EFFECT, "SKIPPED"):
        rows = by_outcome.get(outcome, [])
        if not rows:
            continue
        extra = ""
        if outcome == PROPAGATED:
            unexpected = [r for r in rows if not r["by_design"]]
            extra = "  ({} by design, {} NOT)".format(len(rows) - len(unexpected), len(unexpected))
        print("{:<12} {:>3}{}".format(outcome, len(rows), extra))

    surprises = [r for r in results if not r["matched"]]
    print("\n{} case(s) behaved differently than predicted:".format(len(surprises)))
    for r in surprises:
        print("  {} {} -- expected {}, got {} ({})".format(
            r["site"], r["corruption"], r["expect"], r["outcome"], r["detail"]))
    return surprises


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--list", action="store_true", help="print the case table and exit")
    ap.add_argument("--clean", action="store_true", help="purge leftover _skip_audit docs and exit")
    ap.add_argument("--only", nargs="+", metavar="SITE", help="run only these site ids (e.g. S1 S3)")
    args = ap.parse_args()

    if args.list:
        for c in ALL_CASES:
            print("{:<5} {:<45} {}".format(c["site"], c["operation"], c["corruption"]))
        print("\n{} cases across {} sites.".format(len(ALL_CASES), len({c["site"] for c in ALL_CASES})))
        return 0

    assert_local_mongo()

    if args.clean:
        purge(TOUCHED_COLLECTIONS)
        return 0

    cases = [c for c in ALL_CASES if not args.only or c["site"] in args.only]
    if not cases:
        sys.exit("No cases matched --only {}".format(args.only))

    # Clear anything a previous hard kill left behind, so stale docs can't skew results.
    purge(TOUCHED_COLLECTIONS)
    print("\nEstablishing clean library baseline...")
    restore_library_baseline()

    results = []
    with slack_muted():
        for i, c in enumerate(cases, 1):
            try:
                results.append(run_case(c, i, len(cases)))
            except Exception:
                traceback.print_exc()
                results.append(dict(c, outcome="HARNESS_ERROR", detail="see traceback",
                                    matched=False))

    purge(TOUCHED_COLLECTIONS)
    surprises = report(results)
    return 1 if surprises else 0


if __name__ == "__main__":
    sys.exit(main())
