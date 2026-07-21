"""
Business logic for the staff-only linker editor tool (/linker-editor).

Reads and mutates linker metadata (MatchTemplates, AddressTypes) on schema nodes and
keeps the NonUniqueTerm usage index in sync. Kept separate from the thin API views in
api/views.py. See docs / Shortcut epic 44935.
"""
import re
from typing import List, Optional

from sefaria.model import library
from sefaria.model.schema import NonUniqueTerm, NonUniqueTermSet, AddressType
from sefaria.model.linker.match_template import MatchTemplate
import sefaria.model.linker.nonuniqueterm_index as nut_index
from sefaria.system.exceptions import InputError


# ---------------------------------------------------------------------------
# Node resolution
# ---------------------------------------------------------------------------

def parse_node_key_path(node_key_path: str) -> List[str]:
    """Node key paths are passed as dot-separated keys, e.g. "Berakhot.Intro"."""
    return [k for k in node_key_path.split(".") if k != ""]


def get_node_by_key_path(index, key_path: List[str]):
    """
    Resolve a schema node from a list of keys (as produced by node.address(), which
    includes the root key). Tolerates a path that omits the leading root key.
    """
    root = index.nodes
    if not key_path:
        return root
    keys = key_path[:]
    if keys[0] == getattr(root, "key", None):
        keys = keys[1:]
    node = root
    for key in keys:
        child = node.get_child_by_key(key)
        if child is None:
            return None
        node = child
    return node


def get_node_by_editor_path(index, key_path: List[str]):
    """
    Resolve a linker editor node path.
    Default-structure paths are schema key paths. Alt-structure paths are encoded as:
    ["__alt__", struct_name, child_index, ...], where child indexes traverse the raw
    alt_structs nodes arrays.
    """
    if key_path and key_path[0] == "__alt__":
        if len(key_path) < 3:
            return None, None
        struct_name = key_path[1]
        node = index.get_alt_structure(struct_name)
        if node is None:
            return None, struct_name
        try:
            for child_index in key_path[2:]:
                node = node.children[int(child_index)]
        except (ValueError, IndexError):
            return None, struct_name
        return node, struct_name
    return get_node_by_key_path(index, key_path), None


# ---------------------------------------------------------------------------
# MatchTemplate editing
# ---------------------------------------------------------------------------

def _validate_slugs(term_slugs: List[str]) -> None:
    for slug in term_slugs:
        if NonUniqueTerm.init(slug) is None:
            raise InputError("No NonUniqueTerm with slug '{}'.".format(slug))


def _normalize_scope(scope: Optional[str]) -> str:
    scope = scope or "combined"
    if scope not in ("combined", "alone", "any"):
        raise InputError("Invalid scope '{}'. Must be one of combined|alone|any.".format(scope))
    return scope


def _match_templates_equal(a: dict, b: dict) -> bool:
    return (list(a.get("term_slugs", [])) == list(b.get("term_slugs", []))
            and a.get("scope", "combined") == b.get("scope", "combined"))


def add_match_template(title: str, node_key_path: str, term_slugs: List[str], scope: str = "combined") -> dict:
    """Append a new MatchTemplate to a node, persist, and update the usage index."""
    if not term_slugs:
        raise InputError("term_slugs must be a non-empty list.")
    _validate_slugs(term_slugs)
    scope = _normalize_scope(scope)

    index = library.get_index(title)
    node, struct_name = get_node_by_editor_path(index, parse_node_key_path(node_key_path))
    if node is None:
        raise InputError("Could not find node '{}' in index '{}'.".format(node_key_path, title))

    template = MatchTemplate(list(term_slugs), scope)
    serialized = template.serialize()
    node.match_templates = list(getattr(node, "match_templates", [])) + [serialized]
    index.save()

    nut_index.add_template_usage(title, node, template, struct_name=struct_name)
    return serialized


def remove_match_template(title: str, node_key_path: str, serialized_template: dict) -> None:
    """Remove the MatchTemplate matching `serialized_template` from a node."""
    index = library.get_index(title)
    node, struct_name = get_node_by_editor_path(index, parse_node_key_path(node_key_path))
    if node is None:
        raise InputError("Could not find node '{}' in index '{}'.".format(node_key_path, title))

    existing = list(getattr(node, "match_templates", []))
    remaining = [mt for mt in existing if not _match_templates_equal(mt, serialized_template)]
    if len(remaining) == len(existing):
        raise InputError("No matching MatchTemplate found on node '{}'.".format(node_key_path))
    node.match_templates = remaining
    index.save()

    template = MatchTemplate(
        list(serialized_template.get("term_slugs", [])),
        serialized_template.get("scope", "combined"),
    )
    nut_index.remove_template_usage(title, node, template, struct_name=struct_name)


# ---------------------------------------------------------------------------
# AddressType editing
# ---------------------------------------------------------------------------

def all_address_type_names() -> List[str]:
    """All valid addressType strings (AddressType subclass names minus the 'Address' prefix)."""
    names = []

    def recurse(cls):
        for sub in cls.__subclasses__():
            names.append(sub.__name__[len("Address"):])
            recurse(sub)

    recurse(AddressType)
    return sorted(set(names))


def set_address_types(title: str, node_key_path: str, address_types: List[str]) -> List[str]:
    """Overwrite a node's addressTypes. Validates length == depth and that each name resolves."""
    index = library.get_index(title)
    node, _ = get_node_by_editor_path(index, parse_node_key_path(node_key_path))
    if node is None:
        raise InputError("Could not find node '{}' in index '{}'.".format(node_key_path, title))

    depth = getattr(node, "depth", None)
    if depth is None:
        raise InputError("Node '{}' has no depth; it does not support addressTypes.".format(node_key_path))
    if len(address_types) != depth:
        raise InputError("Expected {} addressTypes to match node depth, got {}.".format(depth, len(address_types)))

    valid = set(all_address_type_names())
    for atype in address_types:
        if atype not in valid:
            raise InputError("Unknown addressType '{}'.".format(atype))

    node.addressTypes = list(address_types)
    index.save()
    return node.addressTypes


# ---------------------------------------------------------------------------
# NonUniqueTerm read / search
# ---------------------------------------------------------------------------

def search_non_unique_terms(q: str, limit: int = 20) -> List[dict]:
    """Search NonUniqueTerms by title text (case-insensitive) for autocomplete."""
    q = (q or "").strip()
    if not q:
        return []
    query = {"titles.text": {"$regex": re.escape(q), "$options": "i"}}
    results = []
    for term in NonUniqueTermSet(query, limit=limit):
        results.append({
            "slug": term.slug,
            "primary_en": term.get_primary_title("en"),
            "primary_he": term.get_primary_title("he"),
        })
    return results


def get_non_unique_term_detail(slug: str) -> dict:
    """Term titles (all languages) plus every node that uses it (from the usage index)."""
    term = NonUniqueTerm.init(slug)
    if term is None:
        raise InputError("No NonUniqueTerm with slug '{}'.".format(slug))
    return {
        "slug": term.slug,
        "titles": term.get_titles_object(),
        "usages": nut_index.get_term_usages(slug),
    }


def add_non_unique_term_titles(slug: str, titles: List[dict]) -> dict:
    """Add alternate titles to a NonUniqueTerm and return the refreshed term detail."""
    term = NonUniqueTerm.init(slug)
    if term is None:
        raise InputError("No NonUniqueTerm with slug '{}'.".format(slug))
    if not isinstance(titles, list) or not titles:
        raise InputError("titles must be a non-empty list.")

    for title in titles:
        if not isinstance(title, dict):
            raise InputError("Each title must be an object.")
        lang = title.get("lang")
        text = (title.get("text") or "").strip()
        if lang not in ("en", "he"):
            raise InputError("Title lang must be 'en' or 'he'.")
        if not text:
            raise InputError("Title text may not be blank.")
        term.add_title(text, lang)

    term.save()
    return get_non_unique_term_detail(slug)
