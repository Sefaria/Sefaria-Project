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
from sefaria.helper.linker.tasks import LinkingArgs, link_segment_with_worker

# Local DBs may be missing `availableTexts` aggregates on root SchemaNodes
# (e.g. Bach, Beit Yosef when resolved bare). Link._set_available_langs
# raises KeyError in that case. Patch to be permissive instead of aborting.
_orig_set_available_langs = Link._set_available_langs
def _safe_set_available_langs(self):
    try:
        _orig_set_available_langs(self)
    except KeyError:
        self.availableLangs = [[], []]
Link._set_available_langs = _safe_set_available_langs


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
