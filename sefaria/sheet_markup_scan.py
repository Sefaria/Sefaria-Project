"""
Read-only detection of sheet fields that already store markup.

sefaria/sheets.py::clean_source runs bleach on the source text of ref-less
sources and on ref source text, but not on customTitle, caption, options or
sheet attribution. Sheets saved before that gap was closed can still hold
hostile markup in those fields. This module only reports paths; it never
writes. scripts/scan_sheet_markup.py drives it over the sheets collection.
"""
import re

# Any "<" that starts a tag, comment or doctype. Deliberately loose: a false
# positive only adds a row to the report, while a miss leaves hostile markup.
MARKUP_RE = re.compile(r"<\s*[A-Za-z!/?]")

# Source keys whose values are rendered as HTML without a sanitizer. The editor
# stores a source's custom title as `title`; `customTitle` is kept for legacy records.
SOURCE_FIELDS_WITHOUT_SANITIZER = ("title", "customTitle", "caption", "options", "outsideText", "outsideBiText", "comment")


def _string_paths(value, path):
    """Yield (dotted path, string) for every string nested under `value`."""
    if isinstance(value, str):
        yield path, value
    elif isinstance(value, dict):
        for key, child in value.items():
            yield from _string_paths(child, f"{path}.{key}")
    elif isinstance(value, list):
        for index, child in enumerate(value):
            yield from _string_paths(child, f"{path}[{index}]")


def find_markup_fields(sheet):
    """Return dotted paths of string values in `sheet` that contain markup, in document order."""
    candidates = list(_string_paths(sheet.get("attribution"), "attribution"))
    candidates += list(_string_paths(sheet.get("options"), "options"))
    for index, source in enumerate(sheet.get("sources") or []):
        if not isinstance(source, dict):
            continue
        for field in SOURCE_FIELDS_WITHOUT_SANITIZER:
            if field in source:
                candidates += list(_string_paths(source[field], f"sources[{index}].{field}"))
    return [path for path, text in candidates if MARKUP_RE.search(text)]


def scan_sheets(sheets):
    """Yield (sheet id, owner, flagged paths) for each sheet that has at least one flagged field."""
    for sheet in sheets:
        paths = find_markup_fields(sheet)
        if paths:
            yield sheet.get("id"), sheet.get("owner"), paths
