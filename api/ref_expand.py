"""
POST /api/refs/expand -- validate a batch of refs and expand each into its section and segment refs.

Built for Sefaria Social, which has no text library: when it saves a Claude asset it must check the
refs the asset's manifest declares and index the asset by every segment and section it covers.
One call answers for up to MAX_REFS refs. A bad ref never fails the request; it gets its own
`ok: false` result with a message that names the problem.

Request:  {"refs": ["Genesis 1:1-5", "Rashi on Genesis 1:1:1", ...]}
Response: {"results": [
              {"input", "ok": true, "ref", "heRef", "sectionRefs": [...], "segmentRefs": [...]},
              {"input", "ok": false, "error"},
              ...]}             -- one result per input, in input order
400 {"error"} only when the body itself is wrong (not JSON, no `refs` list, more than MAX_REFS).

Read-only and anonymous. CSRF-exempt because its callers are servers, and it changes nothing.
"""

from __future__ import annotations

import json

import structlog
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_POST

from sefaria.client.util import jsonResponse
from sefaria.model.text import Ref
from sefaria.system.exceptions import InputError

logger = structlog.get_logger(__name__)

MAX_REFS = 200
# A whole book is a legal ref but not a useful anchor; cap what one ref may expand to so a single
# request stays small. Genesis has 1,533 verses, so a book of Torah still fits.
MAX_SEGMENTS_PER_REF = 2000


def _unique(values):
    return list(dict.fromkeys(values))


def _flatten(refs):
    # Ref.all_segment_refs() returns nested lists for some virtual nodes; flatten defensively.
    for item in refs:
        if isinstance(item, list):
            yield from _flatten(item)
        else:
            yield item


def _missing_segments(segment_orefs, sections) -> str | None:
    """
    Ref() checks sections against the text's shape but not segments ("Genesis 1:99" parses), and a
    range expands to every number in it. Check each segment against what its section really holds;
    return an error message naming the first segment that does not exist, or None.
    """
    existing = {}
    for name, section in sections.items():
        if section.is_segment_level() or getattr(getattr(section, "index_node", None), "is_virtual", False):
            continue  # depth-1 texts and virtual nodes: nothing finer to check against
        try:
            existing[name] = {r.normal() for r in section.all_subrefs()}
        except Exception as error:  # never block a save on a check we could not run
            logger.warning("ref_expand_segment_check_skipped", section=name, error_type=type(error).__name__)
    for segment in segment_orefs:
        section_name = segment.section_ref().normal()
        known = existing.get(section_name)
        if known is not None and segment.normal() not in known:
            return (
                f"'{segment.normal()}' does not exist: {section_name} has {len(known)} segments. "
                "Check the verse or line number."
            )
    return None


def expand_ref(tref) -> dict:
    """The result object for one input ref. Never raises."""
    if not isinstance(tref, str) or not tref.strip():
        return {"input": tref, "ok": False, "error": "Each ref must be a non-empty string."}
    try:
        oref = Ref(tref.strip())
        segment_orefs = list(_flatten(oref.all_segment_refs()))
        if len(segment_orefs) > MAX_SEGMENTS_PER_REF:
            return {
                "input": tref,
                "ok": False,
                "error": (
                    f"'{oref.normal()}' covers {len(segment_orefs)} segments, more than {MAX_SEGMENTS_PER_REF}. "
                    "Cite a chapter or a range instead of a whole book."
                ),
            }
        sections = {}
        for segment in segment_orefs:
            section = segment.section_ref()
            sections.setdefault(section.normal(), section)
        missing = _missing_segments(segment_orefs, sections)
        if missing:
            return {"input": tref, "ok": False, "error": missing}
        segment_refs = _unique(r.normal() for r in segment_orefs)
        section_refs = list(sections)
        return {
            "input": tref,
            "ok": True,
            "ref": oref.normal(),
            "heRef": oref.he_normal(),
            "sectionRefs": section_refs,
            "segmentRefs": segment_refs,
        }
    except InputError as error:
        detail = str(error).strip()
        message = f"'{tref}' is not a valid ref" + (f": {detail}" if detail else ".")
        return {"input": tref, "ok": False, "error": message}
    except Exception as error:  # a malformed ref must never become a 500
        logger.warning("ref_expand_failed", ref=tref, error_type=type(error).__name__)
        return {"input": tref, "ok": False, "error": f"'{tref}' could not be expanded."}


@csrf_exempt
@require_POST
def refs_expand_api(request):
    try:
        body = json.loads(request.body or b"null")
    except (ValueError, UnicodeDecodeError):
        return jsonResponse({"error": 'Body must be JSON: {"refs": [...]}.'}, status=400)
    refs = body.get("refs") if isinstance(body, dict) else None
    if not isinstance(refs, list):
        return jsonResponse({"error": "Body must be a JSON object with a `refs` list."}, status=400)
    if len(refs) > MAX_REFS:
        return jsonResponse({"error": f"Too many refs: {len(refs)}. Send at most {MAX_REFS} per request."}, status=400)
    return jsonResponse({"results": [expand_ref(tref) for tref in refs]})
