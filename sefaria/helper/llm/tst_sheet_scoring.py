# run_sheet_scoring.py
"""
Run Sefaria LLM sheet scoring:
  - For a single sheet_id
  - For every sheet that cites a given ref (tref)

Usage (quick-edit mode):
    if __name__ == "__main__":
        # --- run on a single sheet ---
        # sheet_id = "5f4d29656d2ff2888edf2a0c"
        # run_on_single_sheet(sheet_id=sheet_id, force_update=True)

        # --- run on all sheets for a ref ---
        # tref = "Genesis 6:19"
        # run_on_ref(tref=tref, force_update=False)
"""

import sys
from typing import List, Dict, Any, Iterable, Optional

from bson import ObjectId
from sefaria.system.database import db
from sefaria.helper.llm.tasks.sheet_scoring import generate_and_save_sheet_scoring
import pathlib
import os
import django

from sefaria.model import Ref  # if this import differs in your tree, adjust it


def _already_scored(sheet: Dict[str, Any]) -> bool:
    """
    Detect if a sheet is already scored in the *new* format.
    We consider it scored if llm_scoring.sheet.ref_scores exists and is non-empty.
    """
    llm = sheet.get("llm_scoring", {})
    llm_sheet = llm.get("sheet", {}) or {}
    ref_scores = llm_sheet.get("ref_scores")
    return isinstance(ref_scores, dict) and len(ref_scores) > 0


def _fetch_sheet_by_id(sheet_id: str) -> Optional[Dict[str, Any]]:
    try:
        return db.sheets.find_one({"_id": ObjectId(sheet_id)})
    except Exception as e:
        print(f"[ERR] invalid sheet_id={sheet_id}: {e}")
        return None


def _segment_list_for_ref(tref: str) -> List[str]:
    """
    Expand a tref into all segment refs (normalized strings) to match
    against includedRefs/expandedRefs.
    """
    oref = Ref(tref)
    return [r.normal() for r in oref.all_segment_refs()]


def _find_sheets_for_ref(tref: str) -> Iterable[Dict[str, Any]]:
    """
    Find all sheets (public + private) that cite the tref in includedRefs OR expandedRefs.
    """
    segments = _segment_list_for_ref(tref)
    query = {"$or": [{"includedRefs": {"$in": segments}},
                     {"expandedRefs": {"$in": segments}}]}
    cur = db.sheets.find(query)
    return cur


def _dispatch(sheet: Dict[str, Any]) -> None:
    """
    Call the actual worker function. It may return an AsyncResult (Celery),
    a bool, or None depending on your implementation. We handle common cases.
    """
    res = generate_and_save_sheet_scoring(sheet)
    # best-effort logging of outcome type
    try:
        if hasattr(res, "id"):  # Celery AsyncResult
            print(f"  → queued task id: {res.id}")
        elif isinstance(res, bool):
            print(f"  → sync result: {'OK' if res else 'FAIL'}")
        else:
            print("  → dispatched (no return value)")
    except Exception:
        print("  → dispatched")



def run_on_single_sheet(sheet_id: str, force_update: bool = True) -> None:
    sheet = _fetch_sheet_by_id(sheet_id)
    if not sheet:
        print(f"[WARN] sheet not found: {sheet_id}")
        return

    if _already_scored(sheet) and not force_update:
        print(f"[SKIP] sheet {sheet_id} already scored")
        return

    print(f"[RUN] scoring sheet {sheet_id} — title={sheet.get('title','')!r}")
    _dispatch(sheet)


def run_on_ref(tref: str, force_update: bool = False) -> None:
    print(f"[SCAN] finding sheets for tref={tref!r}")
    count = 0
    scored = 0
    skipped = 0

    for sheet in _find_sheets_for_ref(tref):
        count += 1
        sid = str(sheet.get("_id"))
        if _already_scored(sheet) and not force_update:
            skipped += 1
            print(f"[SKIP] {sid} (already scored)")
            continue
        print(f"[RUN] {sid} — title={sheet.get('title','')!r}")
        _dispatch(sheet)
        scored += 1

    print(f"[DONE] tref={tref!r} total={count} scored/dispatched={scored} skipped={skipped}")



if __name__ == "__main__":
    # --- quick-edit mode (uncomment one of the blocks) ---
    # # to run on single sheet uncomment these lines and write sheet_id
    # # if you want NOT to update sheets already scored, set force_update=False
    # sheet_id = "5f4d29656d2ff2888edf2a0c"
    # run_on_single_sheet(sheet_id=sheet_id, force_update=True)

    # # to run on a ref (all sheets that cite it)
    tref = "Genesis 6:19"
    run_on_ref(tref=tref, force_update=False)


