"""
Data for the Torah Tracker dashboard: a reader's text history in compact rows, plus metadata for
each book they read, so the page can aggregate and drill down client-side without more requests.
"""
from datetime import timezone

from sefaria.system.database import db

MAX_RECORDS = 20000  # most recent views; keeps very heavy histories to a reasonable payload
LANGUAGE_CODES = {"english": "e", "hebrew": "h", "bilingual": "b"}


def torah_tracker_data(uid):
    cursor = db.user_history.find(
        {"uid": uid, "is_sheet": {"$ne": True}, "datetime": {"$exists": True}},
        {"_id": 0, "ref": 1, "book": 1, "datetime": 1, "secondary": 1, "language": 1, "categories": 1},
    ).sort("datetime", -1).limit(MAX_RECORDS)

    records, books = [], {}
    for h in cursor:
        book = h.get("book")
        if not book:
            continue
        # [epoch seconds, ref, book, opened in the sidebar (0/1), language code]; datetimes are stored as naive UTC
        epoch = int(h["datetime"].replace(tzinfo=timezone.utc).timestamp())
        records.append([epoch, h["ref"], book, int(bool(h.get("secondary"))), LANGUAGE_CODES.get(h.get("language"), "")])
        if book not in books:
            books[book] = _book_info(book, h.get("categories") or [])
    records.reverse()
    return {"records": records, "books": books}


def _book_info(book, fallback_categories):
    from sefaria.model import library
    try:
        index = library.get_index(book)
    except Exception:  # renamed or removed since it was read
        return {"categories": fallback_categories}

    info = {"categories": index.categories, "heTitle": index.get_title("he")}
    period = index.best_time_period()
    if period and period.start is not None:
        info["compDate"] = int(period.start)
    if getattr(index, "era", None):
        info["era"] = index.era
    collective = getattr(index, "collective_title", None)
    if collective:
        info["partner"] = collective
        term = library.get_term(collective)
        if term:
            info["hePartner"] = term.get_primary_title("he")
        info["base"] = getattr(index, "base_text_titles", None) or []
    if index.nodes.is_leaf() and getattr(index.nodes, "lengths", None):
        info["chapters"] = index.nodes.lengths[0]
    return info
