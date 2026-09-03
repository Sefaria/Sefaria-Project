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


def run_reindex_entities(debug=False):
    """Rebuild the entity indices (topic, book, category) that power /api/entity-search.

    Not part of REINDEX_TYPES: entity types are not sharded (their corpora are thousands
    of documents against text's millions), and index_entities() drives the full
    init -> index -> finalize cycle per type itself.

    This exists because the two refactors met awkwardly. On master the weekly CronJob
    entrypoint is reindex_elasticsearch_cronjob.py, whose index_all() calls
    index_entities(); this branch repoints the CronJob at reindex_orchestrator.py, which
    never calls index_all(). Without this helper the entity aliases keep pointing at
    stale indexes and the job still exits 0 -- a silent degradation, not a loud break.

    Deliberately not wrapped in try/except. index_entities() already attempts every type
    before raising a combined summary, so a raise here means at least one entity corpus
    is genuinely stale. The catch-and-log convention in run_reindex_finalize_all covers
    cheap re-runs of already-durable work; a stale entity index is neither.
    """
    from sefaria.search import index_entities

    logger.info(f"Running entity reindex (topic, book, category) - debug: {debug}")
    return index_entities(debug=debug)


def run_reindex_finalize_all(debug=False, sheet_catch_up_timestamp=None, clear_queue=True):
    """
    Finalize text, rebuild sheets on the new index, finalize sheets, optional catch-up, clear queue.

    The catch-up and queue-clear steps run AFTER both alias swaps above have already
    committed the durable, expensive work. A failure in either step is caught and logged
    rather than raised, so a transient hiccup here doesn't discard hours of already-completed
    text/sheet reindexing and force a full re-run - matching the old cronjob's tolerance for
    this specific step (it retried sheet catch-up with backoff and recorded failure rather
    than raising). This is a cost argument, not a silence argument: unlike finding #7
    (pagesheetrank, which runs before any expensive work and stays fail-loud by design), the
    work being protected here is already done and would be wastefully repeated on a crash.
    """
    from sefaria.search import reindex_finalize, reindex_index_shard

    reindex_finalize("text", debug=debug)
    reindex_index_shard("sheet", debug=debug)
    reindex_finalize("sheet", debug=debug)
    if sheet_catch_up_timestamp:
        try:
            run_sheets_catch_up(sheet_catch_up_timestamp, debug=debug)
        except Exception as e:
            logger.error(f"Sheet catch-up failed after alias swaps already committed - continuing, not re-raising: {e}")
    if clear_queue:
        try:
            clear_index_queue()
        except Exception as e:
            logger.error(f"Clearing index queue failed after alias swaps already committed - continuing, not re-raising: {e}")
