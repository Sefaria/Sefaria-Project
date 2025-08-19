import sys
from typing import List, Dict, Any, Iterable, Optional

from bson import ObjectId
from sefaria.system.database import db
from sefaria.helper.llm.tasks.sheet_scoring import generate_and_save_sheet_scoring
import pathlib
import os
import django
import logging

from sefaria.model import Ref  # adjust import if needed

logger = logging.getLogger(__name__)


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
        return db.sheets.find_one({"id": int(sheet_id)})
    except Exception as e:
        logger.error("Invalid sheet_id=%s: %s", sheet_id, e)
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
    logger.debug("Querying sheets for tref=%r with segments count=%d", tref, len(segments))
    return db.sheets.find(query)


def _find_all_sheets() -> Iterable[Dict[str, Any]]:
    """
    Stream all sheets (public + private). Uses a cursor to avoid loading into memory.
    """
    logger.debug("Querying all sheets cursor")
    return db.sheets.find({})


def _dispatch(sheet: Dict[str, Any]) -> None:
    """
    Call the actual worker function. It may return an AsyncResult (Celery),
    a bool, or None depending on your implementation. We handle common cases.
    """
    res = generate_and_save_sheet_scoring(sheet)
    try:
        if hasattr(res, "id"):  # Celery AsyncResult
            logger.info("Queued scoring task id=%s", res.id)
        elif isinstance(res, bool):
            logger.info("Synchronous scoring result: %s", "OK" if res else "FAIL")
        else:
            logger.debug("Dispatched scoring (no return value)")
    except Exception as e:
        logger.exception("Error while logging dispatch result: %s", e)


def run_on_single_sheet(sheet_id: str, force_update: bool = True) -> None:
    sheet = _fetch_sheet_by_id(sheet_id)
    if not sheet:
        logger.warning("Sheet not found: %s", sheet_id)
        return

    if _already_scored(sheet) and not force_update:
        logger.info("Skip sheet %s (already scored)", sheet_id)
        return

    logger.info("Scoring sheet %s — title=%r", sheet_id, sheet.get("title", ""))
    _dispatch(sheet)