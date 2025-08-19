"""
Test Sheet Scoring:
  - For a single sheet_id
  - For a single ref

Usage (quick-edit mode):
    if __name__ == "__main__":
        # --- run on a single sheet ---
        # sheet_id = "5f4d29656d2ff2888edf2a0c"
        # run_on_single_sheet(sheet_id=sheet_id, force_update=True)

        # --- run on all sheets for a ref ---
        # tref = "Genesis 6:19"
        # run_on_ref(tref=tref, force_update=False)
"""

from sheet_scoring_tools import _find_sheets_for_ref, _already_scored, _dispatch, run_on_single_sheet
import logging



logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    force=True,
)
logger = logging.getLogger(__name__)


def run_on_ref(tref: str, force_update: bool = False) -> None:
    logger.info("Scanning for sheets citing tref=%r", tref)
    count = 0
    scored = 0
    skipped = 0

    for sheet in _find_sheets_for_ref(tref):
        count += 1
        sid = str(sheet.get("id"))
        if _already_scored(sheet) and not force_update:
            skipped += 1
            logger.debug("Skipping sheet %s (already scored)", sid)
            continue

        logger.info("Scoring sheet %s — title=%r", sid, sheet.get('title', ''))
        _dispatch(sheet)
        scored += 1

    logger.info(
        "Finished tref=%r: total=%d, scored/dispatched=%d, skipped=%d",
        tref, count, scored, skipped
    )



if __name__ == "__main__":
    # # --- quick-edit mode (uncomment one of the blocks) ---
    # run on single sheet
    # sheet_id = "1"
    # run_on_single_sheet(sheet_id=sheet_id, force_update=True)

    # run on single ref
    tref = "Genesis 10:1"
    run_on_ref(tref=tref, force_update=False)
