import logging
from typing import Any, Dict
from sefaria.system.database import db
from sefaria_llm_interface.sheet_scoring import SheetScoringInput, SheetScoringOutput

logger = logging.getLogger(__name__)

LLM_SCORING_ROOT = "llm_scoring"
SHEET_FIELD = f"{LLM_SCORING_ROOT}.sheet"
UPDATED_AT_FIELD = f"{LLM_SCORING_ROOT}.processed_datetime"

KEYS_TO_STORE_IN_DB = (
    "ref_scores",
    "title_interest_level",
    "title_interest_reason",
    "language",
    "creativity_score",
)


def _prepare_sheet_payload(result: SheetScoringOutput) -> Dict[str, Any]:
    """
    Build the object to store under `llm_scoring.sheet` with ONLY the whitelisted fields.
    Excludes None values.
    """
    payload: Dict[str, Any] = {}
    for key in KEYS_TO_STORE_IN_DB:
        val = getattr(result, key, None)
        if val is not None:
            payload[key] = val
    return payload


def save_sheet_scoring_output(result: SheetScoringOutput) -> bool:
    """
    Save sheet scoring output under llm_scoring.sheet with a narrow payload.
    """
    if result.request_status == 0:
        logger.error(getattr(result, "request_status_message",
                             "LLM scoring failed"))
        return False
    sheet_id = result.sheet_id
    try:
        payload = _prepare_sheet_payload(result)
        update_doc = {
            "$set": {
                SHEET_FIELD: payload,
                UPDATED_AT_FIELD: result.processed_datetime,
            }
        }
        update_result = db.sheets.update_one({"id": int(sheet_id)}, update_doc)
        success = update_result.matched_count > 0

        if success:
            logger.info("Updated %s for sheet with id=%s", SHEET_FIELD, sheet_id)
        else:
            logger.warning("Sheet with id=%s not found in database", sheet_id)

        return success

    except Exception as e:
        logger.exception("Error updating sheet %s: %s", sheet_id, e)
        return False


def make_sheet_scoring_input(sheet_content: Dict[str, Any]) -> SheetScoringInput:
    """
    Create SheetScoringInput from sheet content dictionary.
    """
    return SheetScoringInput(sheet_id=str(sheet_content["id"]),
                             title=sheet_content['title'],
                             expanded_refs=sheet_content['expandedRefs'],
                             sources=sheet_content['sources'])