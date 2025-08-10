import logging
from typing import Any,Dict,Optional

from bson import ObjectId
from sefaria.system.database import db
from sefaria_llm_interface.sheet_scoring import (
    SheetScoringInput,
    SheetScoringOutput,
)

logger = logging.getLogger(__name__)


def _prepare_update_data(result: SheetScoringOutput) -> Dict[str,Any]:
    """
    Prepare update data for database, filtering out None values.

    Args:
        result: Result dictionary from processing

    Returns:
        Filtered update data
    """
    update_data = {
        "ref_scores": result.ref_scores,
        "ref_levels": result.ref_levels,
        "language": result.language,
        "title_interest_level": result.title_interest_level,
        "title_interest_reason": result.title_interest_reason,
        "processed_at": result.processed_at,
        "creativity_score": result.creativity_score,
    }

    return {k: v for k, v in update_data.items() if v is not None}


def save_sheet_scoring_output(result: SheetScoringOutput) -> bool:
    """
    Save sheet scoring output to database.

    Args:
        result: SheetScoringOutput object containing scoring data

    Returns:
        bool: True if update was successful, False otherwise
    """
    sheet_id = result.sheet_id

    try:
        object_id = ObjectId(sheet_id)
        update_data = _prepare_update_data(result)

        update_result = db.sheets.update_one(
            {"_id": object_id},
            {"$set": update_data}
        )

        success = update_result.matched_count > 0
        if success:
            logger.info(f"Updated sheet {sheet_id} with grading data")
        else:
            logger.warning(f"Sheet {sheet_id} not found in database")

        return success

    except Exception as e:
        logger.error(f"Error updating sheet {sheet_id}: {e}")
        return False


def make_sheet_scoring_input(
        sheet_content: Dict[str,Any]) -> SheetScoringInput:
    """
    Create SheetScoringInput from sheet content dictionary.

    Args:
        sheet_content: Dictionary containing sheet data

    Returns:
        SheetScoringInput object
    """
    sheet_content["_id"] = str(sheet_content["_id"])
    return SheetScoringInput(sheet_content)