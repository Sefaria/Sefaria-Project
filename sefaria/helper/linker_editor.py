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
from sefaria.model.linker.linker_entity_recognizer import get_linker_normalizer
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
# Node property editing (referenceable, numeric_equivalent, ...)
# ---------------------------------------------------------------------------

# Linker-relevant node properties the editor exposes. Which ones actually apply to a
# given node is decided by that node class's `optional_param_keys` (see below).
EDITABLE_NODE_PROPERTIES = (
    "referenceable",
    "numeric_equivalent",
    "referenceableSections",
    "isSegmentLevelDiburHamatchil",
    "diburHamatchilRegexes",
    "skipped_addresses",
    "isMapReferenceable",
)


def _node_supports_property(node, prop: str) -> bool:
    """A property applies to a node iff its class lists it in optional_param_keys."""
    return prop in set(getattr(type(node), "optional_param_keys", []))


def _remove_property(node, prop: str) -> None:
    if hasattr(node, prop):
        delattr(node, prop)


def _apply_node_property(node, prop: str, value) -> None:
    """Validate `value` for `prop` and set it on `node` (or remove it to restore the default)."""
    if prop == "referenceable":
        if value is None:
            _remove_property(node, prop)
        elif value in (True, False, "optional"):
            node.referenceable = value
        else:
            raise InputError("referenceable must be true, false, or 'optional'.")

    elif prop == "numeric_equivalent":
        if value is None or value == "":
            _remove_property(node, prop)
        else:
            try:
                node.numeric_equivalent = int(value)
            except (TypeError, ValueError):
                raise InputError("numeric_equivalent must be an integer.")

    elif prop == "referenceableSections":
        if value is None:
            _remove_property(node, prop)
        else:
            if not isinstance(value, list) or not all(isinstance(x, bool) for x in value):
                raise InputError("referenceableSections must be a list of booleans.")
            depth = getattr(node, "depth", None)
            if depth is not None and len(value) != depth:
                raise InputError("referenceableSections must have length {} (node depth), got {}.".format(depth, len(value)))
            if all(value):  # all-referenceable is the default; keep the schema clean
                _remove_property(node, prop)
            else:
                node.referenceableSections = list(value)

    elif prop == "isSegmentLevelDiburHamatchil":
        if value is None or value is False:  # False is the default
            _remove_property(node, prop)
        elif value is True:
            node.isSegmentLevelDiburHamatchil = True
        else:
            raise InputError("isSegmentLevelDiburHamatchil must be a boolean.")

    elif prop == "diburHamatchilRegexes":
        if not value:  # None or []
            _remove_property(node, prop)
        else:
            if not isinstance(value, list) or not all(isinstance(x, str) and x.strip() for x in value):
                raise InputError("diburHamatchilRegexes must be a list of non-empty strings.")
            for pattern in value:
                try:
                    re.compile(pattern)
                except re.error as e:
                    raise InputError("Invalid regex '{}': {}".format(pattern, e))
            node.diburHamatchilRegexes = list(value)

    elif prop == "skipped_addresses":
        if not value:  # None or []
            _remove_property(node, prop)
        else:
            if not isinstance(value, list):
                raise InputError("skipped_addresses must be a list of integers.")
            try:
                node.skipped_addresses = [int(x) for x in value]
            except (TypeError, ValueError):
                raise InputError("skipped_addresses must be a list of integers.")

    elif prop == "isMapReferenceable":
        if value is None or value is True:  # True is the default
            _remove_property(node, prop)
        elif value is False:
            node.isMapReferenceable = False
        else:
            raise InputError("isMapReferenceable must be a boolean.")

    else:
        raise InputError("Property '{}' is not editable.".format(prop))


def serialize_node_properties(node) -> dict:
    """Current values of the editable properties that apply to this node (None when unset)."""
    return {
        prop: getattr(node, prop, None)
        for prop in EDITABLE_NODE_PROPERTIES
        if _node_supports_property(node, prop)
    }


def set_node_properties(title: str, node_key_path: str, properties: dict) -> dict:
    """
    Update linker-relevant properties on a schema node. `properties` is a partial map of
    {property_name: value}; a value of null removes the property (restoring its default).
    """
    if not isinstance(properties, dict) or not properties:
        raise InputError("'properties' must be a non-empty object.")

    index = library.get_index(title)
    node, _ = get_node_by_editor_path(index, parse_node_key_path(node_key_path))
    if node is None:
        raise InputError("Could not find node '{}' in index '{}'.".format(node_key_path, title))

    for prop, value in properties.items():
        if prop not in EDITABLE_NODE_PROPERTIES:
            raise InputError("Property '{}' is not editable.".format(prop))
        if not _node_supports_property(node, prop):
            raise InputError("Property '{}' does not apply to a {}.".format(prop, type(node).__name__))
        _apply_node_property(node, prop, value)

    index.save()
    return serialize_node_properties(node)


# ---------------------------------------------------------------------------
# NonUniqueTerm read / search
# ---------------------------------------------------------------------------

def search_non_unique_terms(q: str, limit: int = 20) -> List[dict]:
    """Search NonUniqueTerms by title text or slug (case-insensitive) for autocomplete."""
    q = get_linker_normalizer("he").normalize(q or "").strip()
    if not q:
        return []
    regex = {"$regex": re.escape(q), "$options": "i"}
    query = {"$or": [{"titles.text": regex}, {"slug": regex}]}
    results = []
    for term in NonUniqueTermSet(query, limit=limit):
        results.append({
            "slug": term.slug,
            "primary_en": term.get_primary_title("en"),
            "primary_he": term.get_primary_title("he"),
        })
    return results


def get_non_unique_term_titles(slugs: List[str]) -> dict:
    """Map each slug to its primary en/he titles, for rendering MatchTemplate badges."""
    unique_slugs = list({s for s in slugs if s})
    if not unique_slugs:
        return {}
    titles = {}
    for term in NonUniqueTermSet({"slug": {"$in": unique_slugs}}):
        titles[term.slug] = {
            "primary_en": term.get_primary_title("en"),
            "primary_he": term.get_primary_title("he"),
        }
    return titles


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


def create_non_unique_term(titles: List[dict]) -> dict:
    """
    Create a new NonUniqueTerm from a list of {lang, text} titles (at least one
    non-blank title is required). The first title of each language becomes its primary.
    Returns the new term's detail, including the slug generated on save.
    """
    if not isinstance(titles, list):
        raise InputError("titles must be a list.")
    cleaned = []
    for title in titles:
        if not isinstance(title, dict):
            raise InputError("Each title must be an object.")
        lang = title.get("lang")
        text = (title.get("text") or "").strip()
        if lang not in ("en", "he"):
            raise InputError("Title lang must be 'en' or 'he'.")
        if text:
            cleaned.append((lang, text))
    if not cleaned:
        raise InputError("At least one title (English or Hebrew) is required.")

    # Seed the slug from the primary English title, falling back to the first title.
    slug_seed = next((text for lang, text in cleaned if lang == "en"), cleaned[0][1])
    term = NonUniqueTerm({"slug": slug_seed, "titles": []})
    primary_langs = set()
    for lang, text in cleaned:
        term.title_group.add_title(text, lang, primary=(lang not in primary_langs))
        primary_langs.add(lang)
    term.save()
    return get_non_unique_term_detail(term.slug)


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
        if lang not in ("en", "he"):
            raise InputError("Title lang must be 'en' or 'he'.")
        # Normalize the title with the same normalizer the linker applies to input text
        # server-side, so stored titles match what the linker sees at match time.
        text = get_linker_normalizer(lang).normalize(title.get("text") or "").strip()
        if not text:
            raise InputError("Title text may not be blank.")
        term.add_title(text, lang)

    term.save()
    return get_non_unique_term_detail(slug)
