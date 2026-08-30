# -*- coding: utf-8 -*-
"""
Audit every skip_bad_record / log_skip guard site by feeding it real bad data.

WHAT THIS IS FOR
    The guards added in PR #3442 make the library-cache build survive one corrupt DB
    record: the record is logged, recorded in sefaria.helper.skip_tracking, and skipped,
    instead of aborting startup / reset_cache / reset_toc. skip_tracking_test.py (next to
    this file) proves the *mechanism* works, but it does so with MagicMock loggers and
    hand-raised exceptions -- it never touches a single real guard site.

    This file closes that gap from the other end. For each guard site it inserts a
    genuinely malformed document into Mongo, runs the narrowest build function that
    reaches that site, and asserts what actually happened:

        CAUGHT      the guard fired and recorded the skip, with the expected error type
        WRONG_SITE  a skip was recorded, but by some other guard than the one under test
        PROPAGATED  the exception escaped the guard entirely (the build would abort)
        NO_EFFECT   the bad record caused no error and no skip (corruption was benign)

    Every case declares which of the four it expects, and fails if it gets another. So
    PROPAGATED is not automatically a failure. A case marked `outside_guard` escaped
    because the exception is raised where no `with` block is in scope -- typically while
    the `for rec in SomeSet()` iterator instantiates the record -- so no exception tuple
    could have caught it, however wide. Those are fixable only by moving the guard. A
    PROPAGATED case NOT marked that way would be a genuine breadth gap, and no case
    expects one.

    test_breaker_aborts_the_build exercises the skip-tracking breakers, which the
    corruption cases cannot: each of those seeds one bad record, and the breakers only
    engage when degradation is systemic. See BREAKER_CASES.

SITE IDS  (what "S1" means)
    A "guard site" is one `with skip_bad_record(...)` or `log_skip(...)` block in the
    codebase -- one specific place that can swallow a bad record. Each one gets a short id
    so it can be selected and grouped:

        S1 .. S20   the twenty guard sites under audit, numbered in the order they appear
                    in CASES / LOG_SKIP_CASES below.
        B1, B2      the two breaker cases. These are not guard sites: they seed systemic
                    damage and assert the build ABORTS rather than skips.

    These ids are invented by this file and exist nowhere else -- grepping sefaria/ for
    "S1" will find nothing. What identifies the real code is the `operation` string sitting
    next to the id in each case (e.g. S1 is "TocTree vstate record", the guard at
    sefaria/model/category.py:223), and that string is also what skip_tracking records at
    runtime and prints in its Slack summaries. The id is just a stable handle for it, since
    several cases share one site -- one guard is usually worth corrupting several ways.

    Each id is the leading part of its pytest test id, so `-k` selects on it:

        pytest sefaria/helper/tests/audit_skip_bad_record_test.py -k "S1 or S3"
        pytest sefaria/helper/tests/audit_skip_bad_record_test.py -k B1
        pytest sefaria/helper/tests/audit_skip_bad_record_test.py --collect-only -q

WHERE THIS RUNS
    These tests WRITE malformed documents into whatever Mongo the settings point at, so
    _audit_mongo_host_is_disposable() refuses to let them run anywhere but a Mongo that is
    known-disposable: a developer's local instance, or the per-commit ephemeral sandbox CI
    stands up (MONGO_HOST is `<deployEnv>-mongo` and DEPLOY_ENV is `sandbox-<sha>`, see
    helm-chart/sefaria/templates/rollout/web.yaml and .github/workflows/continuous.yaml).
    Anywhere else -- including an unset MONGO_HOST, which inside a pod means the shared
    cluster Mongo -- the whole module SKIPS with a loud reason rather than writing. Check
    for that skip in the CI log before assuming these ran.

    Other safety properties:
    * Everything written is synthetic, so cleanup is a delete, not a restore-from-snapshot
      that can be lost mid-run.
    * Every insert is journalled to disk before the build runs, so even a hard kill leaves
      an exact list of what to remove; the session fixture replays the journal on the next
      run. If the journal itself is lost, purge() falls back to deleting documents named
      `ZZAudit*` / `zzaudit-*`. That fallback is by name, not by ownership, so it would
      also delete a pre-existing document with such a name -- acceptable only because
      nothing in the corpus is named that and these tests refuse to run against anything
      but a disposable Mongo.
    * Cleans up per case in a finally block, again in the session fixture, and again via
      atexit.
    * Slack is patched out for the whole run; nothing reaches #engineering-signal.

COST
    Roughly 40 cases, each running a real library builder, several of which rebuild the
    entire in-memory index map. This is minutes, not seconds. If it ever needs to come out
    of the default CI run, add `@pytest.mark.deep` to the two test functions -- CI's filter
    is `-m "not deep and not failing"` (build/ci/createJobFromRollout.sh).
"""
import atexit
import json
import logging
import os
import re
import tempfile
import traceback
from unittest.mock import patch

import pytest

from django.conf import settings

from sefaria.system.database import db
from sefaria.helper.skip_tracking import (reset_skip_counts, get_skip_records,
                                          SIGNATURE_BREAKER_THRESHOLD)

# ---------------------------------------------------------------------------
# Logging
#
# The per-case progress lines below go through this logger rather than bare print(), so
# pytest can capture them and replay them under a failing test. The formatter is left
# alone and propagate is left on, so pytest's own logging plugin handles them: they are
# hidden on a pass and shown in the captured-log section on a failure. To watch them live:
#     pytest ... --log-cli-level=INFO
# ---------------------------------------------------------------------------

logger = logging.getLogger(__name__)


# Outcome codes, ordered worst-first for the report summary.
CAUGHT, WRONG_SITE, PROPAGATED, NO_EFFECT = "CAUGHT", "WRONG_SITE", "PROPAGATED", "NO_EFFECT"
BROKE, NO_BREAK = "BROKE", "NO_BREAK"   # outcomes for the breaker cases below


# ---------------------------------------------------------------------------
# Safety
# ---------------------------------------------------------------------------

# Hosts these tests may write malformed documents to. Anything not matching is refused.
#
# `None` is deliberately NOT allowed. It means MONGO_HOST is unset, which on a developer
# machine barely happens (sefaria/local_settings.py sets it) but inside a deployed pod
# means "fall through to the shared cluster Mongo" -- precisely the case this guard exists
# to stop.
DISPOSABLE_MONGO_HOSTS = {"localhost", "127.0.0.1", "::1", "mongo"}

# CI stands up a fresh sandbox per commit and tears it down after; its Mongo service is
# named `<deployEnv>-mongo` where deployEnv is `sandbox-<short sha>`. Deliberately narrow:
# this admits the ephemeral per-commit sandbox and nothing else -- not `staging-mongo`,
# not `production-mongo`.
EPHEMERAL_MONGO_HOST = re.compile(r"^sandbox-[0-9a-f]{4,40}-mongo$")


def _audit_mongo_host_is_disposable():
    """Return None if it is safe to write here, or the reason it is not."""
    host = getattr(settings, "MONGO_HOST", None)
    hosts = host if isinstance(host, (list, tuple)) else [host]
    bad = [h for h in hosts
           if h not in DISPOSABLE_MONGO_HOSTS
           and not (isinstance(h, str) and EPHEMERAL_MONGO_HOST.match(h))]
    if bad:
        return ("MONGO_HOST is {!r}, which is not a known-disposable Mongo. These tests "
                "write malformed documents and only ever run against a local instance or "
                "CI's per-commit sandbox.".format(host))
    return None


# Evaluated once at import. A skipif mark (rather than a fixture) so an unsafe host skips
# every test in the file with the reason attached, before any fixture can write anything.
_UNSAFE_MONGO = _audit_mongo_host_is_disposable()
pytestmark = pytest.mark.skipif(_UNSAFE_MONGO is not None, reason=_UNSAFE_MONGO or "")


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
            logger.warning("  ! cleanup failed for %s/%s: %s", collection, _id, e)


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

    logger.info("Purged %d leftover audit document(s).", total)
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
# guard is expected to do. `outside_guard=True` marks a propagation the guard could not have
# caught at any breadth, because the raise happens outside its `with` block.
#
# The leading "S<n>" is this file's id for the guard site under test -- see SITE IDS in
# the module docstring. Cases sharing an id are different corruptions of the same guard;
# the `# -- category.py:223` comment heading each group names the source line that id
# stands for.
# ---------------------------------------------------------------------------

def case(site, operation, corruption, collection, doc, trigger, expect,
         error_type=None, outside_guard=False, note=None, extra_docs=None, skip=None):
    """One audit case.

    `site` is this file's own short id for the guard site under test (S1..S20 -- see SITE
    IDS in the module docstring). It is a label invented here; it appears nowhere in
    sefaria/. `operation` is what actually identifies the guard -- it is the exact string
    that guard passes to skip_tracking, so it is also what shows up in the skip records and
    the Slack summary, and it is what run_case() matches on to decide whether the skip came
    from the site under test or some other one. `corruption` is the one-line human
    description of what is wrong with the seeded document.

    `outside_guard=True` marks a propagation caused by catch PLACEMENT rather than catch
    breadth: the exception is raised while the `for rec in SomeSet()` iterator instantiates
    the record, or inside a constructor, so no `with` block is in scope yet and no exception
    tuple can reach it.

    `extra_docs` seeds additional documents the corruption needs in order to be REACHED --
    e.g. a bad child topic is only visited if an IntraTopicLink makes it a child of
    something. `skip` marks a case that cannot run under this file's constraints, with the
    reason; the test reports it via pytest.skip() rather than dropping it silently.
    """
    docs = [(collection, doc)] + list(extra_docs or [])
    return dict(site=site, operation=operation, corruption=corruption, collection=collection,
                docs=docs, trigger=trigger, expect=expect, error_type=error_type,
                outside_guard=outside_guard, note=note, skip=skip)


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
         _toc_tree, CAUGHT, "AttributeError"),
    case("S1", "TocTree vstate record", "`flags` is null",
         "vstate", {"title": "ZZAudit_vs_flags_null", "first_section_ref": "Audit 1", "flags": None},
         _toc_tree, CAUGHT, "AttributeError"),

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
         _toc_tree, CAUGHT, "TypeError"),

    # -- category.py:246  TocTree index -------------------------------------------
    case("S3", "TocTree index", "index whose `categories` is empty",
         "index", _index_doc("ZZAuditEmptyCats", categories=[]),
         _toc_tree, PROPAGATED, "InputError", outside_guard=True,
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
         _toc_tree, CAUGHT, "TypeError"),

    # -- category.py:272  TocTree collection ---------------------------------------
    case("S4", "TocTree collection", "collection with `toc` set but no `name`",
         "groups", {"toc": {"categories": ["Tanakh"], "title": "ZZAudit"}, "listed": True,
                    "slug": "zzaudit-no-name"},
         _toc_tree, CAUGHT, "KeyError"),
    case("S4", "TocTree collection", "collection whose `toc` is a string",
         "groups", {"toc": "not-a-dict", "listed": True, "slug": "zzaudit-toc-str"},
         _toc_tree, CAUGHT, "TypeError",
         note="a str `toc` is subscripted before any attribute access, so this surfaces as "
              "TypeError rather than the AttributeError one might predict"),

    # -- category.py:340  TocTree._add_category ------------------------------------
    case("S5", "TocTree._add_category", "category whose parent path does not exist",
         "category", {"path": ["ZZAuditNoParent", "ZZAuditChild"], "lastPath": "ZZAuditChild",
                      "depth": 2},
         _toc_tree, CAUGHT, "KeyError"),
    case("S5", "TocTree._add_category", "category with an empty `path`",
         "category", {"path": [], "lastPath": "", "depth": 0},
         _toc_tree, WRONG_SITE,
         note="the empty path attaches to root without raising here, but the malformed "
              "category then breaks an index lookup in the TocTree index loop, which now "
              "catches it -- a skip is recorded, at a different site than this one"),

    # -- category.py:464  TocTree.serialize node -----------------------------------
    case("S6", "TocTree.serialize node", "category whose `sharedTitle` names a nonexistent term",
         "category", {"path": ["Tanakh", "ZZAuditSerialize"], "lastPath": "ZZAuditSerialize",
                      "depth": 2, "sharedTitle": "ZZNoSuchTerm"},
         _toc_tree_serialize, PROPAGATED, "IndexError", outside_guard=True,
         note="IndexError IS in BAD_RECORD_EXCEPTIONS, but it is raised during TocTree "
              "__init__/_sort, outside every with-block -- see `escaped at` column"),

    # -- text.py:5036  _build_index_maps index record ------------------------------
    case("S7", "_build_index_maps index record", "index whose `schema` is not a dict",
         "index", _index_doc("ZZAuditSchemaStr", schema={"nodes": "not-a-list"}),
         _index_maps, PROPAGATED, "AttributeError", outside_guard=True,
         note="AttributeError is now IN the tuple, and this still escapes -- it raises "
              "during IndexSet() iteration, OUTSIDE the with-block. Previously recorded as "
              "a deliberate exclusion; widening the tuple exposed it as a third instance of "
              "the placement gap"),
    case("S7", "_build_index_maps index record", "index with no `title`",
         "index", {"categories": ["Tanakh", "Torah"], "schema": _index_doc("x")["schema"]},
         _index_maps, CAUGHT, "AttributeError"),

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
         _topic_toc, CAUGHT, "AttributeError",
         note="the exact corruption the guard was added for. Was NOT caught while the tuple "
              "excluded AttributeError -- a missing Mongo field surfaces as AttributeError "
              "on the Python object, not KeyError. This case is the reason the tuple was "
              "widened"),

    # -- text.py:5260  topic TOC child ---------------------------------------------
    # A bad child topic is only visited if a 'displays-under' link makes it a child, so
    # each case seeds a valid top-level parent plus the link alongside the bad child.
    case("S10", "topic TOC child", "child topic whose `titles` is a string, not a list",
         "topics", _topic_doc("zzaudit-child-strtitles", titles="notalist"),
         _topic_toc, CAUGHT, "AttributeError",
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
         _term_mappings, CAUGHT, "AttributeError"),
    case("S11", "build_term_mappings term", "term with no `name`",
         "term", {"titles": [{"text": "ZZAuditTermNoName", "lang": "en", "primary": True},
                             {"text": "א", "lang": "he", "primary": True}]},
         _term_mappings, CAUGHT, "AttributeError"),

    # -- text.py:5780  _build_topic_mapping topic ----------------------------------
    case("S12", "_build_topic_mapping topic", "topic with an empty `titles` list",
         "topics", _topic_doc("zzaudit-topic-notitles", titles=[]),
         _topic_mapping, NO_EFFECT,
         note="TitleGroup.primary_title() returns '' rather than raising"),
    case("S12", "_build_topic_mapping topic", "topic whose `titles` is a string, not a list",
         "topics", _topic_doc("zzaudit-topic-strtitles", titles="notalist"),
         _topic_mapping, CAUGHT, "AttributeError"),
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
         _virtual_books, CAUGHT, "AttributeError"),

    # -- autospell.py:129  AutoCompleter user --------------------------------------
    case("S15", "AutoCompleter user", "profile whose `user` sub-document has no `slug`",
         "profiles", {"id": 999999001, "slug": None, "first_name": "ZZAudit"},
         _autocompleter_users, CAUGHT, "KeyError",
         skip="needs a Postgres auth_user row (User.objects.in_bulk) plus a public sheet "
              "for aggregate_profiles() to return it -- out of scope for a Mongo-only script"),

    # -- autospell.py:498  LexiconTrie entry ---------------------------------------
    # The operation string here is built at runtime as "LexiconTrie({}) entry".format(name),
    # so the case must spell out the lexicon. Writing "LexiconTrie(...)" made these two
    # report as WRONG_SITE when the correct guard had in fact fired.
    case("S16", "LexiconTrie(Jastrow Dictionary) entry", "lexicon entry with no `headword`",
         "lexicon_entry", {"parent_lexicon": "Jastrow Dictionary", "content": {}},
         _lexicon_trie, CAUGHT, "AttributeError"),
    case("S16", "LexiconTrie(Jastrow Dictionary) entry", "lexicon entry whose `headword` is an int",
         "lexicon_entry", {"parent_lexicon": "Jastrow Dictionary", "headword": 12345,
                           "content": {}},
         _lexicon_trie, CAUGHT, "TypeError"),

    # -- category_resolver.py:55  CategoryMatcher category -------------------------
    # The missing-term-slug corruption is handled by the inner log_skip (see S20), so the
    # outer guard needs a match_template that is structurally malformed instead.
    case("S17", "CategoryMatcher category", "category whose `match_templates` is a string",
         "category", {"path": ["Tanakh", "ZZAuditMTStr"], "lastPath": "ZZAuditMTStr",
                      "depth": 2, "match_templates": "notalist"},
         _category_matcher, CAUGHT, "TypeError",
         note="MatchTemplate(**'notalist') fails on the ** unpack, so TypeError rather "
              "than AttributeError"),

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
         _match_template_trie, CAUGHT, "TypeError"),
]


# log_skip sites take a different shape: no exception is raised at all, so they are
# identified by (operation, detail) rather than by error type.
LOG_SKIP_CASES = [
    case("S19", "build_topic_toc_category_mapping", "top-level topic-toc node with no `slug`",
         "topics", {"isTopLevelDisplay": True,
                    "titles": [{"text": "ZZAuditTocNoSlug", "lang": "en", "primary": True}]},
         _topic_toc_category_mapping, WRONG_SITE,
         note="unreachable in practice, exactly as predicted: the same slugless topic is now "
              "caught by get_topic_toc()'s guard upstream (S9), so this log_skip still never "
              "gets the chance to fire. Dead code either way"),
    case("S20", "CategoryMatcher category match_template",
         "category match_template pointing at a nonexistent term slug",
         "category", {"path": ["Tanakh", "ZZAuditNoTermSlug"], "lastPath": "ZZAuditNoTermSlug",
                      "depth": 2, "match_templates": [{"term_slugs": ["zz-absent-slug"]}]},
         _category_matcher, CAUGHT, None),
]


# ---------------------------------------------------------------------------
# Breaker cases
#
# The corruption cases above seed ONE bad record each, so none of them can exercise the
# stopping rule that makes a widened BAD_RECORD_EXCEPTIONS safe. These seed many identical
# bad records instead, and assert the build aborts rather than logging its way through the
# whole collection. Unit tests in skip_tracking_test.py, next to this file, cover the same
# mechanism with mocks; these run it against real builders and a real Mongo.
#
# They also verify the abort path posts its summary. That is not incidental: the pathway's
# own signal_and_reset_skip_counts() call runs AFTER the build, so an abort skips it, and
# without the post inside the breaker the skip log — the whole diagnosis — is discarded.
# ---------------------------------------------------------------------------

def _repeat_doc(collection, doc):
    """Breaker seeder: `count` identical copies of one document, all at one guard site."""
    def seed(count):
        return [(collection, dict(doc)) for _ in range(count)]
    return seed


def _broken_children_of_one_parent(parent_slug, child_prefix):
    """Breaker seeder for a guard site reached RECURSIVELY.

    B1 trips at the top-level topic loop, which is not nested inside another guard, so it
    passes whether or not a trip can escape one. This seeder puts the trip one level down:
    a valid top-level parent whose `count` children are each corrupt in the same way. The
    top-level walk enters the parent inside a `topic TOC child` guard, and the parent's own
    children then trip the breaker inside an identical `topic TOC child` guard — so the
    abort must escape a guard that catches the very exception family it was raised from.

    That is the shape that was broken: with a bare re-raise the parent's guard caught the
    trip, recorded it as one ordinary skip, and the build finished "successfully" with a
    truncated topic ToC. See the comment on BREAKER_CASES.

    `titles` as a string rather than a list is the S10 corruption: TitleGroup iterates it
    character by character, so every child raises the byte-identical "'str' object has no
    attribute 'get'" — the record-independent message a real rename produces, which is
    exactly what the signature breaker keys on.
    """
    def seed(count):
        docs = [("topics", dict(_topic_doc(parent_slug), isTopLevelDisplay=True))]
        for i in range(count):
            slug = "{}{}".format(child_prefix, i)
            docs.append(("topics", _topic_doc(slug, titles="notalist")))
            docs.append(("topic_links", {"class": "intraTopic", "linkType": "displays-under",
                                         "fromTopic": slug, "toTopic": parent_slug,
                                         "dataSource": "sefaria"}))
        return docs
    return seed


# A trip aborts with BuildDegradationError, NOT the original exception: the original is in
# BAD_RECORD_EXCEPTIONS and the guards nest, so re-raising it would let an enclosing guard
# swallow the abort. The original is chained as __cause__ so the diagnosis is not lost.
BREAKER_CASES = [
    dict(site="B1",
         corruption="{} top-level topics all missing `slug`".format(SIGNATURE_BREAKER_THRESHOLD + 2),
         detail=("one identical AttributeError per record, the shape a renamed attribute "
                 "produces. Guard site is NOT nested — see B2"),
         collections=("topics",),
         seed=_repeat_doc("topics",
                          {"isTopLevelDisplay": True,
                           "titles": [{"text": "ZZAuditBreaker", "lang": "en", "primary": True}]}),
         count=SIGNATURE_BREAKER_THRESHOLD + 2,
         trigger=_topic_toc,
         operation="get_topic_toc_json_recursive top-level topic",
         error_type="BuildDegradationError",
         cause_type="AttributeError"),

    dict(site="B2",
         corruption="{} sibling child topics all with a string `titles`, one level down"
                    .format(SIGNATURE_BREAKER_THRESHOLD + 2),
         detail=("the trip happens INSIDE a `topic TOC child` guard and must escape the "
                 "identical guard wrapping the recursion into the parent. A bare re-raise "
                 "is swallowed here and the build completes with a truncated ToC"),
         collections=("topics", "topic_links"),
         seed=_broken_children_of_one_parent("zzaudit-breaker-parent", "zzaudit-breaker-child-"),
         count=SIGNATURE_BREAKER_THRESHOLD + 2,
         trigger=_topic_toc,
         operation="topic TOC child",
         error_type="BuildDegradationError",
         cause_type="AttributeError"),
]


def run_breaker_case(c, notify):
    """Seed the case's documents, run the builder, and assert the build aborted.

    `seed(count)` returns the (collection, doc) pairs to insert — `count` copies of one bad
    record for a flat site, or a whole parent/children/links fixture for a recursive one.
    """
    logger.info("%s %s", c["site"], c["corruption"])
    reset_skip_counts()
    notify.reset_mock()
    raised = None
    try:
        for collection, doc in c["seed"](c["count"]):
            insert(collection, doc)
        try:
            c["trigger"]()
        except BaseException as e:                  # noqa: BLE001 -- classifying, not handling
            raised = e
    finally:
        cleanup()
        try:
            restore_library_baseline()
        except Exception as e:
            logger.warning("  ! baseline restore failed: %s", e)
        reset_skip_counts()

    problems = []
    if raised is None:
        problems.append("build did not abort")
    elif not error_type_matches(type(raised).__name__, c["error_type"]):
        problems.append("aborted with {}, expected {}".format(
            type(raised).__name__, c["error_type"]))
    elif c.get("cause_type"):
        # The wrapper must not lose the diagnosis: the exception that actually broke the
        # record is chained as __cause__, and its message is what names the broken code.
        cause = raised.__cause__
        if cause is None:
            problems.append("aborted without chaining the original {}".format(c["cause_type"]))
        elif not error_type_matches(type(cause).__name__, c["cause_type"]):
            problems.append("chained cause is {}, expected {}".format(
                type(cause).__name__, c["cause_type"]))

    # The summary must reach Slack BEFORE the abort, or the skip log is lost with it.
    if not notify.call_count:
        problems.append("no summary posted on the abort path")
    else:
        message = notify.call_args[0][0]
        if c["operation"] not in message:
            problems.append("summary does not name {!r}".format(c["operation"]))
        if "*{}*".format(SIGNATURE_BREAKER_THRESHOLD) not in message:
            problems.append("summary does not report {} skips".format(
                SIGNATURE_BREAKER_THRESHOLD))

    outcome = NO_BREAK if problems else BROKE
    detail = "; ".join(problems) if problems else "aborted at {} skips, summary posted".format(
        SIGNATURE_BREAKER_THRESHOLD)
    logger.log(logging.WARNING if problems else logging.INFO,
               "      -> %s (%s)", outcome, detail)
    return dict(site=c["site"], operation=c["operation"], corruption=c["corruption"],
                outcome=outcome, detail=detail, matched=not problems, expect=BROKE,
                error_type=c["error_type"], outside_guard=False, note=c["detail"], skip=None,
                escaped_at="")


ALL_CASES = CASES + LOG_SKIP_CASES
TOUCHED_COLLECTIONS = ({coll for c in ALL_CASES for coll, _ in c["docs"]}
                       | {coll for c in BREAKER_CASES for coll in c["collections"]})


# ---------------------------------------------------------------------------
# Runner
# ---------------------------------------------------------------------------

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


def run_case(c):
    """Seed the bad document(s), run the builder, classify what the guard did, clean up.

    Returns the case dict with `outcome`, `detail`, `matched` and `escaped_at` filled in;
    the caller asserts on it. Cases carrying a `skip` reason never reach here -- the test
    calls pytest.skip() on them first.
    """
    logger.info("%s %s -- %s", c["site"], c["operation"], c["corruption"])
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
                logger.warning("  ! baseline restore failed: %s", e)
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
    logger.log(logging.INFO if matched else logging.WARNING,
               "      -> %s (%s)%s%s", outcome, detail,
               "  escaped at " + escaped_at if escaped_at else "",
               "" if matched else "  !! EXPECTED " + c["expect"])
    return dict(c, outcome=outcome, detail=detail, matched=matched, escaped_at=escaped_at)


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture(scope="module", autouse=True)
def _audit_session():
    """Bracket the whole file: clear leftovers, get a clean baseline, tidy up after.

    The opening purge() matters as much as the closing one. A previous run killed mid-case
    leaves synthetic documents behind, and a stale bad record sitting in Mongo while a
    later case runs turns that case's result into an artefact of the leftover rather than
    of the corruption under test.
    """
    purge(TOUCHED_COLLECTIONS)
    logger.info("Establishing clean library baseline...")
    restore_library_baseline()
    yield
    cleanup()
    purge(TOUCHED_COLLECTIONS)
    restore_library_baseline()


@pytest.fixture(autouse=True)
def muted_slack():
    """No audit case may post to #engineering-signal.

    Autouse, so it covers the corruption cases too -- any of them could in principle trip
    a breaker and try to post. The breaker tests additionally request it by name, because
    for them the mock is the assertion: the summary has to reach Slack *before* the abort.
    """
    with patch("sefaria.helper.skip_tracking.notify_engineering_signal") as m:
        yield m


def _case_id(c):
    """Test id: the site id first, so `-k S1` selects every corruption of that guard."""
    slug = re.sub(r"[^a-z0-9]+", "-", c["corruption"].lower()).strip("-")
    return "{}-{}".format(c["site"], slug[:60])


def _failure_message(r):
    """The diagnosis for one failing case, in the shape the old report table printed it.

    `escaped at` is the field worth reading first on a PROPAGATED failure: it is the
    deepest sefaria frame in the traceback, which distinguishes "the guard's exception
    tuple was too narrow" (fixable by widening) from "the exception was raised somewhere
    the guard does not wrap at all" (fixable only by moving the guard).
    """
    lines = [
        "",
        "{} {}".format(r["site"], r["operation"]),
        "  corruption: {}".format(r["corruption"]),
        "  expected:   {}".format(r["expect"]),
        "  got:        {}  ({})".format(r["outcome"], r["detail"]),
    ]
    if r.get("escaped_at"):
        lines.append("  escaped at: {}".format(r["escaped_at"]))
    if r.get("outside_guard"):
        lines.append("  marked `outside guard`: the raise happens where no with-block is "
                     "in scope, so no exception tuple could have caught it")
    if r.get("note"):
        lines.append("  note: {}".format(r["note"]))
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("audit_case", ALL_CASES, ids=_case_id)
def test_guard_site_handles_bad_record(audit_case):
    """Seed one malformed document, run the builder that reaches the guard, check the guard.

    The assertion is against the case's own `expect`, not against CAUGHT: several cases
    legitimately expect NO_EFFECT (the corruption degrades silently rather than raising) or
    PROPAGATED (the raise happens outside any with-block). What this test defends is that
    each guard site keeps behaving the way the table says it behaves -- so widening
    BAD_RECORD_EXCEPTIONS, moving a guard, or changing a builder shows up here as a
    specific case flipping, with the escape point named.
    """
    if audit_case["skip"]:
        pytest.skip(audit_case["skip"])
    result = run_case(audit_case)
    assert result["outcome"] == audit_case["expect"], _failure_message(result)


@pytest.mark.parametrize("audit_case", BREAKER_CASES, ids=lambda c: c["site"])
def test_breaker_aborts_the_build(audit_case, muted_slack):
    """Seed systemic damage and check the build ABORTS instead of logging its way through.

    Three things have to hold, and run_breaker_case() collects all three before failing so
    one run tells you every way it went wrong:
      - the build raises BuildDegradationError rather than completing;
      - the original exception is chained as __cause__, so the diagnosis survives;
      - the skip summary reaches Slack BEFORE the abort. The pathway's own
        signal_and_reset_skip_counts() runs after the build, so an abort skips it -- if the
        breaker does not post, the whole skip log is discarded with the exception.
    """
    result = run_breaker_case(audit_case, muted_slack)
    assert result["matched"], _failure_message(result)
