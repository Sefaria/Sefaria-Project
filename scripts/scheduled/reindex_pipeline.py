"""Shared reindex phase helpers used by the cronjob CLI and orchestrator."""
import logging

logger = logging.getLogger(__name__)

REINDEX_TYPES = ("text", "sheet")


def clear_index_queue():
    from sefaria.search import clear_index_queue as _clear
    return _clear()


def run_sheets_catch_up(timestamp, debug=False):
    """Index public sheets modified after timestamp into the live sheet index."""
    from sefaria.search import index_sheets_by_timestamp

    logger.info(f"Running sheet catch-up - timestamp: {timestamp}, debug: {debug}")
    result = index_sheets_by_timestamp(timestamp, debug=debug)
    if isinstance(result, str):
        raise RuntimeError(f"Sheet catch-up failed: {result}")
    failed = result.get("failed", {}).get("num", 0)
    if failed:
        logger.warning(f"Sheet catch-up completed with failures - failed_count: {failed}")
    return result


def run_reindex_init_all(debug=False):
    from sefaria.search import reindex_init

    for index_type in REINDEX_TYPES:
        reindex_init(index_type, debug=debug)


def run_reindex_finalize_all(debug=False, sheet_catch_up_timestamp=None, clear_queue=True):
    """
    Finalize text, rebuild sheets on the new index, finalize sheets, optional catch-up, clear queue.
    """
    from sefaria.search import reindex_finalize, reindex_index_shard

    reindex_finalize("text", debug=debug)
    reindex_index_shard("sheet", debug=debug)
    reindex_finalize("sheet", debug=debug)
    if sheet_catch_up_timestamp:
        run_sheets_catch_up(sheet_catch_up_timestamp, debug=debug)
    if clear_queue:
        clear_index_queue()
