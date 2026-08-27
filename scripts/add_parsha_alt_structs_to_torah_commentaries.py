# -*- coding: utf-8 -*-
"""
Add "Parasha" alt structures to Chumash commentaries whose schema fits one of three
shapes:

  1. "simple" -- a bare depth-3 (Chapter/Verse/Comment) JaggedArrayNode on a single
     Torah book, e.g. "Rashi on Genesis", "Ibn Ezra on Exodus", "Kli Yakar on Leviticus".

  2. "complex_single" -- a complex index on a single Torah book whose root has exactly
     one depth-3 JaggedArrayNode child holding the actual verse-by-verse commentary
     (the rest of the root's children are front matter like "Introduction", "Preface",
     etc.), e.g. "Haamek Davar on Genesis", "Ibn Ezra on Genesis", "Ramban on Numbers".
     That body child is always the schema's "default" child, so references to the
     index cascade straight through to it -- meaning it takes an identical wholeRef
     to a "simple" commentary (no extra path segment needed).

  3. "complex_multi" -- a combined "<X> on Torah" complex index spanning more than one
     Torah book, where each base book maps to exactly one child of the root: either
     that child is itself the book's depth-3 JaggedArrayNode (the "flat" shape, e.g.
     "Chizkuni", "Rabbeinu Bahya"), or it's a SchemaNode wrapping its own single
     default depth-3 child (the "nested" shape, e.g. "Abarbanel on Torah"). Each such
     child is matched to a base Torah book by its own title (English or a standard
     transliterated Hebrew name, e.g. "Bereshit" -> Genesis) -- see
     TORAH_BOOK_NAME_VARIANTS below.

Two other shapes deliberately are NOT handled and are always skipped:
  - depth-2 (Chapter/Verse, no separate comment level) commentaries like "Harchev
    Davar on Genesis" -- structurally a different shape (no comment-per-verse array).
  - anything else that doesn't unambiguously fit one of the three shapes above (e.g.
    essay-style commentaries with no verse-anchored body node at all, or indexes whose
    base_text_titles don't cleanly correspond 1:1 to schema children). These are
    reported as skipped with a reason so they're auditable, not silently dropped.

Each Torah book (Genesis, Exodus, Leviticus, Numbers, Deuteronomy) already has a
"Parasha" alt structure: a list of ArrayMapNodes, one per parasha, each with a
`sharedTitle` (a shared Term, e.g. "Bereshit"), `match_templates`, and a `wholeRef`
spanning that parasha's chapter:verse range (see scripts/set_parsha_structs.py).

For an eligible commentary, this script builds an analogous "Parasha" alt structure:
for each parasha in the relevant base text's structure, it creates a depth-0
ArrayMapNode that
- reuses the base node's `sharedTitle` (so titles stay in sync with the base text)
- ports over the base node's `match_templates`, prefixed with the commentator's own
  NonUniqueTerm slug (e.g. base ['parasha', 'bereshit'] -> ['rashi', 'parasha', 'bereshit']),
  with scope set to "alone" -- this mirrors the existing pattern used for e.g. Rashi's
  "Chapters" alt structs on Talmud tractates.
- has a `wholeRef` that is the same chapter:verse range, re-anchored to the commentary's
  own ref space:
    - "simple" / "complex_single": "Genesis 1:1-6:8" -> "Rashi on Genesis 1:1-6:8"
    - "complex_multi": "Genesis 1:1-6:8" -> "Chizkuni, Genesis 1:1-6:8" (an extra
      comma-separated path segment naming the book, e.g. its own English or
      transliterated-Hebrew title within the combined index)
  This mirrors the wholeRef re-anchoring pattern already used for existing Torah
  commentaries such as "Minchat Shai on Torah".

The struct is added to the commentary's `alt_structs`, where it's usable for ref
resolution, search, etc., and also shows up as a navigation toggle in the "Table of
Contents" on the book page.

The commentator's NonUniqueTerm slug is guessed as the first term_slug of the first
match_template on the commentary index's root node (e.g. "Rashi on Genesis" has root
match_templates [{"term_slugs": ["rashi", "genesis"]}], so the guess is "rashi"). The
guess is confirmed (or corrected) interactively on the CLI for every commentary before
anything is written -- in --all mode, all commentaries are confirmed first, then all
writes happen.

Usage:
    ./run scripts/add_parsha_alt_structs_to_torah_commentaries.py --title "Rashi on Genesis"
    ./run scripts/add_parsha_alt_structs_to_torah_commentaries.py --all
    ./run scripts/add_parsha_alt_structs_to_torah_commentaries.py --all --dry-run
    ./run scripts/add_parsha_alt_structs_to_torah_commentaries.py --title "Rashi on Genesis" --force
    ./run scripts/add_parsha_alt_structs_to_torah_commentaries.py --all --skip-manual-slugs
    ./run scripts/add_parsha_alt_structs_to_torah_commentaries.py --all --skip-manual-slugs --accept-all
"""
import argparse

import django
django.setup()

from sefaria.model import *
from sefaria.model.schema import deserialize_tree, TitledTreeNode
from sefaria.system.database import db


TORAH_BOOK_ORDER = ["Genesis", "Exodus", "Leviticus", "Numbers", "Deuteronomy"]

# Standard English and transliterated-Hebrew names under which a Torah book's own
# schema node shows up as a child of a combined "<X> on Torah" index (e.g. Rabbeinu
# Bahya's root has children titled 'Bereshit', 'Shemot', 'Vayikra', 'Bamidbar', 'Devarim').
TORAH_BOOK_NAME_VARIANTS = {
    "Genesis": {"Genesis", "Bereshit", "Bereishit"},
    "Exodus": {"Exodus", "Shemot", "Shmot"},
    "Leviticus": {"Leviticus", "Vayikra"},
    "Numbers": {"Numbers", "Bamidbar"},
    "Deuteronomy": {"Deuteronomy", "Devarim"},
}


def get_torah_books():
    return library.get_indexes_in_category("Torah")


def _is_depth3_ja(node):
    return node.__class__.__name__ == "JaggedArrayNode" and getattr(node, "depth", None) == 3


def _get_default_depth3_child(node):
    """
    If `node` has exactly one "default" child (references to `node` cascade straight
    to it) that is itself a depth-3 JaggedArrayNode, return that child. Otherwise None.
    """
    if not node.has_children():
        return None
    defaults = [c for c in node.children if getattr(c, "default", False) and _is_depth3_ja(c)]
    return defaults[0] if len(defaults) == 1 else None


def classify_commentary(index, torah_books):
    """
    Classifies `index` against the three eligible shapes described in the module
    docstring. Returns a (kind, extra, reason) tuple:
      - ("simple", None, None) -- index.nodes is itself a bare depth-3 JaggedArrayNode
      - ("complex_single", body_node, None) -- complex index, single Torah book, with
        exactly one depth-3 JaggedArrayNode child (`body_node`)
      - ("complex_multi", book_to_node, None) -- complex index spanning multiple Torah
        books; `book_to_node` maps each base Torah book title to the (outer_child,
        body_node) pair that represents it in this index's schema
      - (None, None, reason) -- doesn't unambiguously fit any of the above; `reason` is
        a short human-readable explanation for why it was skipped
    """
    if getattr(index, "dependence", None) != "Commentary":
        return None, None, "not marked dependence=Commentary"

    base_titles = [t for t in getattr(index, "base_text_titles", []) if t in torah_books]
    if not base_titles:
        return None, None, "no Torah book in base_text_titles"

    nodes = index.nodes

    if len(base_titles) == 1:
        if _is_depth3_ja(nodes):
            return "simple", None, None
        if not nodes.has_children():
            return None, None, "single Torah book but root has no depth-3 body and no children"
        candidates = [c for c in nodes.children if _is_depth3_ja(c)]
        if len(candidates) == 1:
            return "complex_single", candidates[0], None
        return None, None, "single Torah book, complex root, but {} depth-3 candidate child(ren) (need exactly 1)".format(len(candidates))

    # multi-book: every base Torah book must map to exactly one child of the root
    if not nodes.has_children():
        return None, None, "multiple Torah books but root has no children"

    book_to_node = {}
    ambiguous = False
    for c in nodes.children:
        if _is_depth3_ja(c):
            body_node = c
        else:
            body_node = _get_default_depth3_child(c)
            if body_node is None:
                continue
        child_title = c.get_primary_title("en")
        matched_book = next((book for book, variants in TORAH_BOOK_NAME_VARIANTS.items()
                              if child_title in variants), None)
        if matched_book is None or matched_book not in base_titles:
            continue
        if matched_book in book_to_node:
            ambiguous = True
        book_to_node[matched_book] = (c, body_node)

    if ambiguous:
        return None, None, "multiple children matched to the same base Torah book"
    if sorted(book_to_node.keys()) != sorted(base_titles):
        unmatched = sorted(set(base_titles) - set(book_to_node.keys()))
        return None, None, "could not uniquely match base Torah book(s) to a schema child: {}".format(unmatched)

    return "complex_multi", book_to_node, None


def get_eligible_commentaries():
    """
    Returns a list of (index, kind, extra) tuples for every Chumash commentary whose
    schema fits one of the three eligible shapes (see classify_commentary).
    """
    torah_books = get_torah_books()
    indexes = IndexSet({"dependence": "Commentary", "base_text_titles": {"$in": torah_books}})
    results = []
    for index in indexes:
        kind, extra, _reason = classify_commentary(index, torah_books)
        if kind is not None:
            results.append((index, kind, extra))
    return results


def report_skipped_commentaries():
    """
    Prints every Chumash commentary that does NOT fit one of the three eligible shapes,
    along with the reason -- so exclusions are auditable rather than silent.
    """
    torah_books = get_torah_books()
    indexes = IndexSet({"dependence": "Commentary", "base_text_titles": {"$in": torah_books}})
    skipped = []
    for index in indexes:
        kind, _extra, reason = classify_commentary(index, torah_books)
        if kind is None:
            skipped.append((index.title, reason))
    print("{} commentary(ies) skipped as not fitting an eligible shape:".format(len(skipped)))
    for title, reason in skipped:
        print("  {}: {}".format(title, reason))
    return skipped


def guess_commentator_term_slug(commentary_index):
    """
    Guess the commentator's NonUniqueTerm slug as the first term_slug of the first
    match_template on the commentary index's root node.
    e.g. "Rashi on Genesis" root match_templates [{"term_slugs": ["rashi", "genesis"]}] -> "rashi"
    """
    match_templates = getattr(commentary_index.nodes, "match_templates", None) or []
    if not match_templates:
        return None
    term_slugs = match_templates[0].get("term_slugs", [])
    return term_slugs[0] if term_slugs else None


def confirm_commentator_term_slug(commentary_index, skip_manual=False, accept_all=False):
    """
    Interactively confirm (or correct) the guessed commentator NonUniqueTerm slug for
    `commentary_index`. Returns the confirmed slug, or None if the user chose to skip
    this commentary.

    If `skip_manual` is True, commentaries with no valid guess (or a rejected guess)
    are skipped automatically instead of prompting for a slug to be typed in -- useful
    for --all runs where you only want to confirm guesses, not type in missing ones.

    If `accept_all` is True, a valid guess is accepted automatically without prompting
    -- useful for --all runs once you've already reviewed the guesses (e.g. via
    --dry-run) and trust them. Commentaries with no valid guess still fall through to
    the manual-entry prompt (or get skipped, if `skip_manual` is also set).
    """
    title = commentary_index.title
    guess = guess_commentator_term_slug(commentary_index)

    if guess:
        term = NonUniqueTerm.init(guess)
        if accept_all and term is not None:
            print("[{}] Accepted guessed commentator term: '{}' ({})".format(
                title, guess, term.get_primary_title("en")))
            return guess
        label = "'{}' ({})".format(guess, term.get_primary_title("en")) if term \
            else "'{}' (WARNING: no NonUniqueTerm exists with this slug)".format(guess)
        answer = input("[{}] Guessed commentator term: {} -- correct? [Y/n]: ".format(title, label)).strip().lower()
        if answer in ("", "y", "yes") and term is not None:
            return guess
    else:
        print("[{}] Could not guess a commentator term (no match_templates on root node).".format(title))

    if skip_manual:
        print("[{}] Skipping: no confirmed guess and --skip-manual-slugs is set.".format(title))
        return None

    while True:
        manual = input("[{}] Enter the correct NonUniqueTerm slug for this commentator "
                        "(blank to skip this commentary): ".format(title)).strip()
        if not manual:
            return None
        term = NonUniqueTerm.init(manual)
        if term is None:
            print("  No NonUniqueTerm found with slug '{}'. Try again.".format(manual))
            continue
        return manual


def _build_parasha_nodes_for_book(commentator_slug, base_title, ref_prefix):
    """
    Builds the list of ArrayMapNode dicts for one base Torah book's parshiot, with
    wholeRef anchored as "{ref_prefix} {start}-{end}".
    """
    base_index = library.get_index(base_title)
    base_parasha_struct = base_index.get_alt_structures().get("Parasha")
    if base_parasha_struct is None:
        raise ValueError("Base text '{}' has no 'Parasha' alt structure".format(base_title))

    node_dicts = []
    for base_node in base_parasha_struct.children:
        base_ref = Ref(base_node.wholeRef)
        start = ":".join(str(s) for s in base_ref.sections)
        end = ":".join(str(s) for s in base_ref.toSections)
        whole_ref = "{} {}-{}".format(ref_prefix, start, end)
        Ref(whole_ref)  # validate that it resolves in the commentary's own ref space

        match_templates = [
            {"term_slugs": [commentator_slug] + list(base_template.get("term_slugs", [])), "scope": "alone"}
            for base_template in (getattr(base_node, "match_templates", None) or [])
        ]

        node_dicts.append({
            "nodeType": "ArrayMapNode",
            "depth": 0,
            "wholeRef": whole_ref,
            "includeSections": False,
            "sharedTitle": base_node.sharedTitle,
            "match_templates": match_templates,
        })
    return node_dicts


def build_parasha_alt_struct(commentary_index, commentator_slug, kind, extra):
    """
    Builds a "Parasha" alt structure (a TitledTreeNode of ArrayMapNode children) for
    `commentary_index`, mirroring the Parasha alt structure(s) of its Torah base text(s).
    """
    if kind in ("simple", "complex_single"):
        base_title = commentary_index.base_text_titles[0]
        node_dicts = _build_parasha_nodes_for_book(
            commentator_slug, base_title, ref_prefix=commentary_index.title)
    elif kind == "complex_multi":
        book_to_node = extra
        node_dicts = []
        for base_title in TORAH_BOOK_ORDER:
            if base_title not in book_to_node:
                continue
            outer_node, _body_node = book_to_node[base_title]
            book_title_in_commentary = outer_node.get_primary_title("en")
            ref_prefix = "{}, {}".format(commentary_index.title, book_title_in_commentary)
            node_dicts.extend(
                _build_parasha_nodes_for_book(commentator_slug, base_title, ref_prefix))
    else:
        raise ValueError("Unknown kind '{}'".format(kind))

    struct_obj = deserialize_tree({"nodes": node_dicts}, struct_class=TitledTreeNode)
    struct_obj.title_group = commentary_index.nodes.title_group
    struct_obj.validate()
    return struct_obj


def save_index_directly_to_mongo(index):
    """
    Persist `index` without firing model dependency notifications.

    This mirrors the pre-write portions of AbstractMongoRecord.save() so the Mongo
    document has the same serialized shape as a normal Index.save(), but writes
    directly to the index collection instead of calling save()/notify().
    """
    if index.is_new():
        raise ValueError("Direct index save only supports existing indexes: {}".format(index.title))

    index._normalize()
    index._validate()
    index._sanitize()
    index._pre_save()

    props = index._saveable_attrs()
    result = db.index.replace_one({"_id": index._id}, props, upsert=True)
    if not result.matched_count and result.upserted_id:
        raise Exception("Index '{}' inserted when expecting an update.".format(index.title))
    return index


def add_parsha_struct_to_commentary(title, commentator_slug, dry_run=False, force=False):
    index = library.get_index(title)
    torah_books = get_torah_books()

    kind, extra, reason = classify_commentary(index, torah_books)
    if kind is None:
        print("Skipping '{}': {}".format(title, reason))
        return False

    if index.get_alt_structures().get("Parasha") is not None and not force:
        print("Skipping '{}': already has a 'Parasha' alt structure (use --force to overwrite)".format(title))
        return False

    struct_obj = build_parasha_alt_struct(index, commentator_slug, kind, extra)

    if dry_run:
        print("Would set 'Parasha' alt structure on '{}' [{}]:".format(title, kind))
        for node in struct_obj.children:
            print("  {} -> {} | match_templates={}".format(
                node.get_primary_title("en"), node.wholeRef, node.match_templates))
        return True

    index.set_alt_structure("Parasha", struct_obj)
    save_index_directly_to_mongo(index)
    print("Added 'Parasha' alt structure to '{}' [{}]".format(title, kind))
    return True


def needs_processing(index, torah_books, force):
    kind, _extra, reason = classify_commentary(index, torah_books)
    if kind is None:
        print("Skipping '{}': {}".format(index.title, reason))
        return False
    if index.get_alt_structures().get("Parasha") is not None and not force:
        print("Skipping '{}': already has a 'Parasha' alt structure (use --force to overwrite)".format(index.title))
        return False
    return True


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--title", help="Title of a single commentary index to process")
    group.add_argument("--all", action="store_true", help="Process all eligible Torah commentaries")
    parser.add_argument("--dry-run", action="store_true", help="Print what would change without saving")
    parser.add_argument("--force", action="store_true", help="Overwrite an existing 'Parasha' alt structure")
    parser.add_argument("--skip-manual-slugs", action="store_true",
                         help="Skip commentaries with no guessable commentator term instead of prompting to type one in")
    parser.add_argument("--accept-all", action="store_true",
                         help="Accept every guessed commentator term automatically instead of prompting to confirm each one")
    args = parser.parse_args()

    torah_books = get_torah_books()

    if args.title:
        candidates = [library.get_index(args.title)]
    else:
        eligible = get_eligible_commentaries()
        candidates = [index for index, _kind, _extra in eligible]
        print("Found {} eligible Torah commentaries".format(len(candidates)))
        report_skipped_commentaries()

    to_process = [index for index in candidates if needs_processing(index, torah_books, args.force)]

    # Phase 1: interactively confirm the commentator term slug for every commentary
    # before writing anything.
    confirmed_slugs = {}
    for index in to_process:
        slug = confirm_commentator_term_slug(index, skip_manual=args.skip_manual_slugs, accept_all=args.accept_all)
        if slug is None:
            print("Skipping '{}': no confirmed commentator term".format(index.title))
            continue
        confirmed_slugs[index.title] = slug

    # Phase 2: build and (unless --dry-run) save each confirmed commentary. A failure on
    # one commentary (e.g. a pre-existing title collision unrelated to this script) is
    # reported and skipped, rather than aborting the rest of the batch.
    failures = []
    for title, slug in confirmed_slugs.items():
        try:
            add_parsha_struct_to_commentary(title, slug, dry_run=args.dry_run, force=args.force)
        except Exception as e:
            print("FAILED '{}': {}".format(title, e))
            failures.append(title)

    if failures:
        print("\n{} commentary(ies) failed and were skipped:".format(len(failures)))
        for title in failures:
            print("  {}".format(title))
