# run_sheet_scoring.py
"""
Run Sefaria LLM sheet scoring:
  - For ALL sheets in the DB (optionally skipping those already scored)

Usage (quick-edit mode):
    if __name__ == "__main__":
        # --- run on ALL sheets (skip already-scored by default) ---
        # run_on_all_sheets(force_update=False, limit=None)
"""

from typing import Optional
from sheet_scoring_tools import _find_all_sheets, _already_scored, _dispatch
import logging

# Configure logging (same style as tst_sheet_scoring.py)
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    force=True,
)
logger = logging.getLogger(__name__)


def run_on_all_sheets(force_update: bool = False, limit: Optional[int] = None) -> None:
    """
    Run scoring on every sheet in the DB.
    - Skips sheets that already have llm_scoring.sheet.ref_scores unless force_update=True.
    - `limit` lets you test on the first N sheets (useful for dry runs).
    """
    logger.info("Starting scan over ALL sheets (force_update=%s, limit=%s)", force_update, limit)
    count = 0
    scored = 0
    skipped = 0

    cursor = _find_all_sheets()

    for sheet in cursor:
        if limit is not None and count >= limit:
            logger.info("Limit reached (%d), stopping early", limit)
            break
        count += 1
        sid = str(sheet.get("_id"))

        if _already_scored(sheet) and not force_update:
            skipped += 1
            if skipped % 500 == 0:
                logger.debug("[SKIP] %s (already scored) — skipped so far: %d", sid, skipped)
            continue

        logger.info("[RUN] %s — title=%r", sid, sheet.get('title', ''))
        _dispatch(sheet)
        scored += 1

        if scored % 200 == 0:
            logger.info("[PROGRESS] dispatched %d (visited %d, skipped %d)", scored, count, skipped)

    logger.info("[DONE] ALL sheets visited=%d scored/dispatched=%d skipped=%d", count, scored, skipped)


if __name__ == "__main__":
    run_on_all_sheets(limit=5)
