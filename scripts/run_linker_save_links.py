"""
Run the canonical linker pipeline over every segment under a given Ref.

This calls ``link_segment_with_worker`` (from sefaria.helper.linker.tasks) as
a plain function — no Celery worker required. The task body writes both:

  1. ``MarkedUpTextChunk`` (collection: ``marked_up_text_chunks``) — what the
     React reader actually reads via ``TextRequestAdapter`` /
     ``return_format='wrap_all_entities'`` to wrap citations inline.
  2. ``Link`` rows (collection: ``links``) — used by older endpoints and by
     side panels.

Usage:
    PYTHONPATH=/path/to/Sefaria-Project DJANGO_SETTINGS_MODULE=sefaria.settings \\
    python scripts/run_linker_save_links.py
"""

from dataclasses import asdict

import django
django.setup()

from sefaria.model import *
from sefaria.model.marked_up_text_chunk import MarkedUpTextChunk
from sefaria.helper.linker.tasks import LinkingArgs, link_segment_with_worker

# --- Patches for local-dev quirks ----------------------------------------

# (1) Local DBs may be missing `availableTexts` aggregates on root SchemaNodes
#     (e.g. Bach, Beit Yosef). Link._set_available_langs raises KeyError.
#     Patch to be permissive.
_orig_set_available_langs = Link._set_available_langs
def _safe_set_available_langs(self):
    try:
        _orig_set_available_langs(self)
    except KeyError:
        self.availableLangs = [[], []]
Link._set_available_langs = _safe_set_available_langs


# (2) Some indexes (Encyclopedia Talmudit, etc.) return TextChunk.text as a
#     LIST of paragraph strings even for a segment-level ref. The MUTC
#     validator does `text[charRange[0]:charRange[1]]` which yields '[]' on a
#     list, breaking validation. Coerce the list to the right segment string.
_orig_mutc_validate = MarkedUpTextChunk._validate
def _safe_mutc_validate(self):
    from sefaria.model.text import TextChunk  # local import to avoid cycles
    oref = Ref(self.ref)
    tc = TextChunk(oref, lang=self.language, vtitle=self.versionTitle)
    if isinstance(tc.text, list):
        idx = oref.sections[-1] - 1 if oref.sections else 0
        if 0 <= idx < len(tc.text) and isinstance(tc.text[idx], str):
            # mutate the chunk's text in place so the parent validator sees a string
            tc.text = tc.text[idx]
            # cache the patched chunk on the ref so the parent reuses it via TextChunk(...)
            # — but TextChunk re-instantiates, so we instead monkey-patch ref.text below
    # Replicate the parent validator's checks against the (possibly-fixed) tc
    from sefaria.system.exceptions import InputError, DuplicateRecordError
    from sefaria.model.marked_up_text_chunk import MUTCSpanType
    if not tc.text:
        raise InputError(type(self).__name__ + "._validate(): Corresponding TextChunk is empty")
    pkey_query = {k: getattr(self, k) for k in self.pkeys}
    existing = self.__class__().load(pkey_query)
    if existing and existing._id != getattr(self, "_id", None):
        raise DuplicateRecordError(
            f"{type(self).__name__}._validate(): Duplicate primary key {self.pkeys}, "
            f"found {pkey_query} to already exist in the database."
        )
    for span in self.spans:
        if span['type'] == MUTCSpanType.CITATION.value and 'ref' not in span:
            raise InputError(f'{type(self).__name__}._validate(): Span must have "ref" attribute if type is "citation".')
        if span['type'] == MUTCSpanType.NAMED_ENTITY.value and 'topicSlug' not in span:
            raise InputError(f'{type(self).__name__}._validate(): Span must have "topicSlug" attribute if type is "named_entity".')
        text = tc.text
        citation_text = text[span['charRange'][0]:span['charRange'][1]]
        if citation_text != span['text']:
            raise InputError(
                f"{type(self).__name__}._validate(): Span text does not match the text in the corresponding TextChunk "
                f"for {span.get('ref', span.get('topicSlug'))}: expected '{span['text']}', found '{citation_text}'."
            )
    return True
MarkedUpTextChunk._validate = _safe_mutc_validate
# -------------------------------------------------------------------------


CITING_REF = Ref("אנציקלופדיה תלמודית, דבר חריף")
LANG = "he"
VTITLE = "Encyclopedia Talmudit, Yad Harav Herzog"  # only `he` version present


def text_for_segment(segment_ref):
    """Return the per-segment Hebrew text as a string.

    Encyclopedia Talmudit's TextChunk.text returns the entire entry as a list
    of paragraph strings even for a segment-level ref; index by segment
    position to get just that segment's text.
    """
    tc = segment_ref.text(LANG)
    text = tc.text or ""
    if isinstance(text, list):
        idx = segment_ref.sections[-1] - 1 if segment_ref.sections else 0
        if 0 <= idx < len(text) and isinstance(text[idx], str):
            text = text[idx]
        else:
            text = " ".join(t for t in text if isinstance(t, str))
    return text if isinstance(text, str) else ""


def main():
    segment_refs = CITING_REF.all_segment_refs()
    print(f"Found {len(segment_refs)} segment refs under {CITING_REF.normal()}")

    ok = 0
    skipped = 0
    failed = 0
    failures = []

    for i, seg_ref in enumerate(segment_refs, 1):
        text = text_for_segment(seg_ref)
        if not text.strip():
            skipped += 1
            continue

        linking_args = LinkingArgs(
            ref=seg_ref.normal(),
            text=text,
            lang=LANG,
            vtitle=VTITLE,
        )
        try:
            link_segment_with_worker(asdict(linking_args))
            ok += 1
            print(f"  [{i}/{len(segment_refs)}] {seg_ref.normal()} OK")
        except Exception as e:
            failed += 1
            msg = f"{type(e).__name__}: {e}"
            failures.append((seg_ref.normal(), msg))
            print(f"  [{i}/{len(segment_refs)}] {seg_ref.normal()} FAILED: {msg}")

    print()
    print("=== DONE ===")
    print(f"OK:       {ok}")
    print(f"Skipped:  {skipped}  (empty text)")
    print(f"Failed:   {failed}")
    if failures:
        print("\nFailures:")
        for ref, msg in failures[:10]:
            print(f"  {ref}: {msg}")


if __name__ == "__main__":
    main()
