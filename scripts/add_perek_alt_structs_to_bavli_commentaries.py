# -*- coding: utf-8 -*-
"""
Add "Chapters" / perek alt structures to Bavli commentaries.

This script is intentionally Bavli-only.  It starts by supporting the common
simple Talmud commentary shape: a single-base commentary whose root is a
JaggedArrayNode beginning with a Talmud daf address, usually:

    ["Talmud", "Integer"] -> ["Daf", "Comment"]

For perek boundaries that fall in the middle of an amud, the script uses
`type: commentary` links between the commentary and the base Bavli text.  On the
boundary amud, the first linked comment on the new perek, or the comment after
the last linked comment on the old perek, determines where the commentary perek
split falls.

Usage:
    ./run scripts/add_perek_alt_structs_to_bavli_commentaries.py --report-shapes
    ./run scripts/add_perek_alt_structs_to_bavli_commentaries.py --title "Rashi on Berakhot" --dry-run
    ./run scripts/add_perek_alt_structs_to_bavli_commentaries.py --title "Rashi on Berakhot"
    ./run scripts/add_perek_alt_structs_to_bavli_commentaries.py --title "Rashi on Berakhot" --debug-visible
    ./run scripts/add_perek_alt_structs_to_bavli_commentaries.py --all --dry-run --accept-all
    ./run scripts/add_perek_alt_structs_to_bavli_commentaries.py --all --accept-all
"""
import argparse
import copy
from collections import Counter, defaultdict

import django
django.setup()

from sefaria.model import *
from sefaria.model.schema import deserialize_tree, TitledTreeNode
from sefaria.system.database import db


ALT_STRUCT_NAME = "Chapters"


def get_bavli_books():
    return library.get_indexes_in_corpus("Bavli")


def get_bavli_commentaries():
    bavli_books = get_bavli_books()
    return IndexSet({"dependence": "Commentary", "base_text_titles": {"$in": bavli_books}})


def _leaf_signatures(node):
    if node.has_children():
        sigs = []
        for child in node.children:
            sigs += _leaf_signatures(child)
        return sigs
    return [(
        node.__class__.__name__,
        getattr(node, "depth", None),
        tuple(getattr(node, "addressTypes", []) or []),
        tuple(getattr(node, "sectionNames", []) or []),
    )]


def report_shapes():
    bavli_books = get_bavli_books()
    counts = Counter()
    examples = defaultdict(list)
    for index in get_bavli_commentaries():
        base_titles = [t for t in getattr(index, "base_text_titles", []) if t in bavli_books]
        sig = tuple(sorted(set(_leaf_signatures(index.nodes))))
        key = (len(base_titles), sig)
        counts[key] += 1
        if len(examples[key]) < 8:
            examples[key].append(index.title)

    for (base_count, sig), count in counts.most_common():
        print("\n{} commentary index(es); {} Bavli base title(s)".format(count, base_count))
        print("  shape: {}".format(sig))
        print("  examples: {}".format("; ".join(examples[(base_count, sig)])))


def classify_commentary(index, bavli_books):
    if getattr(index, "dependence", None) != "Commentary":
        return None, "not marked dependence=Commentary"

    base_titles = [t for t in getattr(index, "base_text_titles", []) if t in bavli_books]
    if len(base_titles) != 1:
        return None, "has {} Bavli base title(s); expected exactly 1".format(len(base_titles))

    node = index.nodes
    if node.has_children():
        return None, "complex commentary schema is not supported yet"
    if node.__class__.__name__ != "JaggedArrayNode":
        return None, "root node is {}, not JaggedArrayNode".format(node.__class__.__name__)
    if getattr(node, "depth", 0) < 2:
        return None, "root depth is {}; expected at least 2".format(getattr(node, "depth", None))
    if not getattr(node, "addressTypes", None) or node.addressTypes[0] != "Talmud":
        return None, "first address type is not Talmud: {}".format(getattr(node, "addressTypes", None))

    return {"base_title": base_titles[0], "node": node}, None


def guess_commentator_term_slug(commentary_index):
    match_templates = getattr(commentary_index.nodes, "match_templates", None) or []
    if match_templates:
        term_slugs = match_templates[0].get("term_slugs", [])
        if term_slugs:
            return term_slugs[0]

    collective_title = getattr(commentary_index, "collective_title", None)
    if collective_title:
        terms = NonUniqueTermSet({"titles": {"$elemMatch": {"text": collective_title, "primary": True}}})
        if len(terms) == 1:
            return terms[0].slug
    return None


def confirm_commentator_term_slug(commentary_index, skip_manual=False, accept_all=False):
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
        print("[{}] Could not guess a commentator term.".format(title))

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


def _make_ref_for_sections(index, index_node, sections, to_sections=None):
    to_sections = to_sections or sections
    return Ref(_obj={
        "index": index,
        "book": index.title,
        "index_node": index_node,
        "sections": sections,
        "toSections": to_sections,
    })


def _section_ref_for_daf(index, index_node, daf):
    return _make_ref_for_sections(index, index_node, [daf])


def _sort_refs(refs):
    return sorted(refs, key=lambda r: tuple(r.sections))


def _next_comment_ref(refs, ref):
    for i, candidate in enumerate(refs):
        if candidate == ref and i + 1 < len(refs):
            return refs[i + 1]
    for candidate in refs:
        if candidate.follows(ref):
            return candidate
    return None


def _previous_comment_ref(refs, ref):
    prev = None
    for candidate in refs:
        if candidate == ref:
            return prev
        if candidate.precedes(ref):
            prev = candidate
        else:
            break
    return prev


def _first_comment_on_or_after_daf(refs, daf):
    for ref in refs:
        if ref.sections[0] >= daf:
            return ref
    return None


def _commentary_ref_from_link(link, commentary_section_ref):
    for tref in link.refs:
        oref = Ref(tref)
        if oref.index.title == commentary_section_ref.index.title and commentary_section_ref.contains(oref):
            start_ref = oref.starting_ref()
            if start_ref.is_segment_level():
                return start_ref
            segment_refs = start_ref.all_segment_refs()
            return segment_refs[0] if segment_refs else None
    return None


def _base_ref_from_link(link, base_section_ref):
    for tref in link.refs:
        oref = Ref(tref)
        if oref.index.title == base_section_ref.index.title and base_section_ref.contains(oref):
            return oref
    return None


def _commentary_links_on_boundary(base_index, commentary_index, commentary_node, boundary_daf):
    base_section_ref = _section_ref_for_daf(base_index, base_index.nodes, boundary_daf)
    commentary_section_ref = _section_ref_for_daf(commentary_index, commentary_node, boundary_daf)
    links = LinkSet({
        "$and": [
            {"type": "commentary"},
            {"$or": [
                {"refs.0": {"$regex": base_section_ref.regex()}},
                {"refs.1": {"$regex": base_section_ref.regex()}},
            ]},
            {"$or": [
                {"refs.0": {"$regex": commentary_section_ref.regex()}},
                {"refs.1": {"$regex": commentary_section_ref.regex()}},
            ]},
        ]
    })
    rows = []
    for link in links:
        base_ref = _base_ref_from_link(link, base_section_ref)
        commentary_ref = _commentary_ref_from_link(link, commentary_section_ref)
        if base_ref is not None and commentary_ref is not None:
            rows.append((base_ref, commentary_ref, link))
    return rows


def _boundary_split_comment(all_comment_refs, base_index, commentary_index, commentary_node, old_perek_ref, new_perek_ref):
    boundary_daf = new_perek_ref.sections[0]
    boundary_comments = [r for r in all_comment_refs if r.sections[0] == boundary_daf]

    if not boundary_comments:
        return _first_comment_on_or_after_daf(all_comment_refs, boundary_daf), "no comments on boundary daf"

    old_linked = []
    new_linked = []
    for base_ref, commentary_ref, _link in _commentary_links_on_boundary(
            base_index, commentary_index, commentary_node, boundary_daf):
        if old_perek_ref.contains(base_ref):
            old_linked.append(commentary_ref)
        if new_perek_ref.contains(base_ref):
            new_linked.append(commentary_ref)

    old_linked = _sort_refs(old_linked)
    new_linked = _sort_refs(new_linked)
    if new_linked:
        return new_linked[0], "first linked comment on new perek: {}".format(new_linked[0].normal())
    if old_linked:
        next_ref = _next_comment_ref(all_comment_refs, old_linked[-1])
        return next_ref, "after last linked comment on old perek: {}".format(old_linked[-1].normal())

    return None, "comments exist on boundary daf but no boundary commentary links were found"


def _prefix_match_templates(match_templates, commentator_slug):
    prefixed = []
    for template in match_templates or []:
        term_slugs = template.get("term_slugs", [])
        if term_slugs and term_slugs[0] == commentator_slug:
            prefixed.append(template)
        else:
            new_template = dict(template)
            new_template["term_slugs"] = [commentator_slug] + list(term_slugs)
            new_template["scope"] = "alone"
            prefixed.append(new_template)
    return prefixed


def _build_alt_struct_node_dict(base_node, whole_ref, commentator_slug, commentary_depth):
    node_dict = copy.deepcopy(base_node.serialize())
    node_dict["wholeRef"] = whole_ref
    node_dict["match_templates"] = _prefix_match_templates(node_dict.get("match_templates", []), commentator_slug)
    node_dict["isSegmentLevelDiburHamatchil"] = True
    if commentary_depth >= 3:
        node_dict["includeSections"] = False
    for key in ("refs", "lengths", "addresses", "skipped_addresses", "startingAddress", "offset"):
        node_dict.pop(key, None)
    return node_dict


def build_perek_alt_struct(commentary_index, commentator_slug, info):
    base_index = library.get_index(info["base_title"])
    base_struct = base_index.get_alt_structures().get(ALT_STRUCT_NAME)
    if base_struct is None:
        raise ValueError("Base Bavli text '{}' has no '{}' alt structure".format(base_index.title, ALT_STRUCT_NAME))

    all_comment_refs = _sort_refs(Ref(commentary_index.title).all_segment_refs())
    if not all_comment_refs:
        raise ValueError("'{}' has no comment segments".format(commentary_index.title))

    perek_base_refs = [Ref(node.wholeRef) for node in base_struct.children]
    perek_starts = [all_comment_refs[0]]
    boundary_notes = []
    for i in range(1, len(perek_base_refs)):
        split_ref, note = _boundary_split_comment(
            all_comment_refs,
            base_index,
            commentary_index,
            info["node"],
            perek_base_refs[i - 1],
            perek_base_refs[i],
        )
        boundary_notes.append((i + 1, note))
        perek_starts.append(split_ref)

    node_dicts = []
    for i, base_node in enumerate(base_struct.children):
        start_ref = perek_starts[i]
        if start_ref is None:
            boundary_notes.append((i + 1, "skipped: no start comment could be determined"))
            continue
        next_start = perek_starts[i + 1] if i + 1 < len(perek_starts) else None
        end_ref = _previous_comment_ref(all_comment_refs, next_start) if next_start else all_comment_refs[-1]
        if end_ref is None or end_ref.precedes(start_ref):
            boundary_notes.append((i + 1, "skipped: empty commentary range"))
            continue
        node_dicts.append(_build_alt_struct_node_dict(
            base_node,
            start_ref.to(end_ref).normal(),
            commentator_slug,
            commentary_depth=getattr(info["node"], "depth", 0),
        ))

    if not node_dicts:
        raise ValueError("No perek nodes could be built for '{}'".format(commentary_index.title))

    struct_obj = deserialize_tree({"nodes": node_dicts}, struct_class=TitledTreeNode)
    struct_obj.title_group = commentary_index.nodes.title_group
    struct_obj.validate()
    return struct_obj, boundary_notes


def save_index_directly_to_mongo(index):
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


def set_alt_struct_visibility(index, visible):
    exclude_structs = list(getattr(index, "exclude_structs", []) or [])
    if visible:
        exclude_structs = [name for name in exclude_structs if name != ALT_STRUCT_NAME]
    elif ALT_STRUCT_NAME not in exclude_structs:
        exclude_structs.append(ALT_STRUCT_NAME)

    if exclude_structs:
        index.exclude_structs = exclude_structs
    elif hasattr(index, "exclude_structs"):
        delattr(index, "exclude_structs")


def needs_processing(index, bavli_books, force):
    info, reason = classify_commentary(index, bavli_books)
    if info is None:
        print("Skipping '{}': {}".format(index.title, reason))
        return None
    if index.get_alt_structures().get(ALT_STRUCT_NAME) is not None and not force:
        print("Skipping '{}': already has a '{}' alt structure (use --force to overwrite)".format(
            index.title, ALT_STRUCT_NAME))
        return None
    return info


def add_perek_struct_to_commentary(title, commentator_slug, dry_run=False, force=False, debug_visible=False):
    bavli_books = get_bavli_books()
    index = library.get_index(title)
    info = needs_processing(index, bavli_books, force)
    if info is None:
        return False

    struct_obj, boundary_notes = build_perek_alt_struct(index, commentator_slug, info)
    if dry_run:
        print("Would set '{}' alt structure on '{}':".format(ALT_STRUCT_NAME, title))
        print("  visibility: {}".format("visible" if debug_visible else "hidden via exclude_structs"))
        for node in struct_obj.children:
            print("  {} -> {}".format(node.get_primary_title("en"), node.wholeRef))
        for perek_num, note in boundary_notes:
            print("  boundary before perek {}: {}".format(perek_num, note))
        return True

    index.set_alt_structure(ALT_STRUCT_NAME, struct_obj)
    set_alt_struct_visibility(index, visible=debug_visible)
    save_index_directly_to_mongo(index)
    print("Added '{}' alt structure to '{}' ({})".format(
        ALT_STRUCT_NAME, title, "visible" if debug_visible else "hidden"))
    return True


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--title", help="Title of a single Bavli commentary index to process")
    group.add_argument("--all", action="store_true", help="Process all supported Bavli commentaries")
    group.add_argument("--report-shapes", action="store_true", help="Report Bavli commentary schema shapes and exit")
    parser.add_argument("--dry-run", action="store_true", help="Print what would change without saving")
    parser.add_argument("--force", action="store_true", help="Overwrite an existing 'Chapters' alt structure")
    parser.add_argument("--debug-visible", action="store_true",
                        help="Make the generated 'Chapters' alt structure visible in navigation; default is hidden")
    parser.add_argument("--skip-manual-slugs", action="store_true",
                        help="Skip commentaries with no guessable commentator term instead of prompting")
    parser.add_argument("--accept-all", action="store_true",
                        help="Accept every guessed commentator term automatically")
    args = parser.parse_args()

    if args.report_shapes:
        report_shapes()
        exit()

    bavli_books = get_bavli_books()
    candidates = [library.get_index(args.title)] if args.title else list(get_bavli_commentaries())
    to_process = []
    for index in candidates:
        info = needs_processing(index, bavli_books, args.force)
        if info is not None:
            to_process.append(index)

    confirmed_slugs = {}
    for index in to_process:
        slug = confirm_commentator_term_slug(index, skip_manual=args.skip_manual_slugs, accept_all=args.accept_all)
        if slug is None:
            print("Skipping '{}': no confirmed commentator term".format(index.title))
            continue
        confirmed_slugs[index.title] = slug

    failures = []
    for title, slug in confirmed_slugs.items():
        try:
            add_perek_struct_to_commentary(
                title, slug, dry_run=args.dry_run, force=args.force, debug_visible=args.debug_visible)
        except Exception as e:
            print("FAILED '{}': {}".format(title, e))
            failures.append(title)

    if failures:
        print("\n{} commentary(ies) failed and were skipped:".format(len(failures)))
        for title in failures:
            print("  {}".format(title))
