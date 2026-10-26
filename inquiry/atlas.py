"""Live reading map snapshots built from user_history by a Celery beat task.

A snapshot has three parts:
- sizes: reads per book across the newest BASELINE_RECORDS primary history records (circle size)
- readers: distinct readers whose most recent read (within PRESENCE_WINDOW) is that book ("reading now")
- events: individual reads from the last EVENT_WINDOW seconds, each with the book the same reader came
  from, so the client can pulse a halo or animate a dot travelling between books.
Reader ids never leave the server.
"""
import hashlib
import json
import time
from functools import lru_cache
from pathlib import Path
import structlog
from django.conf import settings
from pymongo import MongoClient, ReturnDocument
from pymongo.errors import DuplicateKeyError

logger = structlog.get_logger(__name__)

BASELINE_RECORDS = 500
PRESENCE_WINDOW = 1800
EVENT_WINDOW = 60
MAX_EVENTS = 100000
REFRESH_INTERVAL = 5
BASELINE = Path(__file__).parent / "static/inquiry/atlas-baseline.json"
PRIMARY = {"secondary": {"$ne": True}, "saved": {"$ne": True},
           "delete_saved": {"$ne": True}, "is_sheet": {"$ne": True}}
PROJECTION = {"_id": 1, "uid": 1, "book": 1, "time_stamp": 1}


@lru_cache(maxsize=1)
def catalog():
    return json.loads(BASELINE.read_text())


@lru_cache(maxsize=1)
def catalog_revision():
    return hashlib.sha256(BASELINE.read_bytes()).hexdigest()[:16]


@lru_cache(maxsize=1)
def title_ids():
    return {book[0]: i for i, book in enumerate(catalog()["books"])}


@lru_cache(maxsize=1)
def database():
    if getattr(settings, "INQUIRY_STANDALONE", False):
        return MongoClient(settings.INQUIRY_ATLAS_MONGO_URI, serverSelectionTimeoutMS=5000)[settings.INQUIRY_ATLAS_MONGO_DB]
    from sefaria.system.database import db
    return db


def _order(row):
    return row.get("time_stamp") or 0, str(row.get("_id"))


def build_snapshot(baseline_rows, recent_rows, now):
    """Pure aggregation over history rows; see module docstring for the shape."""
    titles = title_ids()
    sizes = {}
    for row in baseline_rows:
        book = titles.get(row.get("book"))
        if book is not None:
            sizes[book] = sizes.get(book, 0) + 1

    last_book, events = {}, []
    for row in sorted(recent_rows, key=_order):
        uid, stamp, book = row.get("uid"), row.get("time_stamp"), titles.get(row.get("book"))
        if uid is None or book is None or not isinstance(stamp, (int, float)) or not now - PRESENCE_WINDOW <= stamp <= now:
            continue
        previous = last_book.get(uid)
        last_book[uid] = book
        if stamp >= now - EVENT_WINDOW:
            events.append({"id": str(row["_id"]), "t": stamp, "book": book,
                           "from": previous if previous is not None and previous != book else None})

    readers = {}
    for book in last_book.values():
        readers[book] = readers.get(book, 0) + 1

    return {"generated_at": now, "catalog_revision": catalog_revision(),
            "baseline_records": len(baseline_rows), "event_window": EVENT_WINDOW,
            "presence_window": PRESENCE_WINDOW, "readers_now": len(last_book),
            "sizes": [[k, v] for k, v in sorted(sizes.items())],
            "readers": [[k, v] for k, v in sorted(readers.items())],
            "events": events}


def _demo_rows(db, query, sort=None, limit=0):
    if not getattr(settings, "INQUIRY_ATLAS_DEMO_ENABLED", False):
        return []
    cursor = db.inquiry_atlas_demo_history.find({"synthetic": True, **query}, PROJECTION)
    if sort:
        cursor = cursor.sort(sort)
    return list(cursor.limit(limit).max_time_ms(5000))


def collect(db, now):
    newest = [("time_stamp", -1), ("_id", -1)]
    baseline = list(db.user_history.find(PRIMARY, PROJECTION).sort(newest).limit(BASELINE_RECORDS).max_time_ms(5000))
    window = {"time_stamp": {"$gte": now - PRESENCE_WINDOW, "$lte": now}}
    recent = list(db.user_history.find({**PRIMARY, **window}, PROJECTION).limit(MAX_EVENTS + 1).max_time_ms(10000))
    if len(recent) > MAX_EVENTS:
        raise RuntimeError("Presence window exceeds configured event capacity")
    demo_baseline = _demo_rows(db, {}, newest, BASELINE_RECORDS)
    if demo_baseline:
        baseline = sorted(baseline + demo_baseline, key=_order, reverse=True)[:BASELINE_RECORDS]
    demo_recent = _demo_rows(db, window, limit=MAX_EVENTS)
    return build_snapshot(baseline, recent + demo_recent, now), len(demo_recent)


def refresh():
    db = database()
    now = time.time()
    snapshots = db.inquiry_activity_snapshots
    # Atomic lease shared by all workers. A crashed worker releases it by expiry.
    try:
        lock = snapshots.find_one_and_update({"_id": "lease", "until": {"$lte": now}},
            {"$set": {"until": now + 30}}, upsert=True, return_document=ReturnDocument.AFTER)
    except DuplicateKeyError:
        return {"status": "busy"}
    try:
        payload, demo_records = collect(db, now)
        payload["demo_records"] = demo_records
        snapshots.replace_one({"_id": "latest"}, {"_id": "latest", **payload}, upsert=True)
        return {"status": "updated", "events": len(payload["events"])}
    finally:
        snapshots.update_one({"_id": "lease", "until": lock["until"]}, {"$set": {"until": 0}})


def request_refresh(db, now):
    """Queue a snapshot refresh while someone is watching, at most once per REFRESH_INTERVAL.

    The chart runs no Celery beat, so the page drives refreshes. The atomic claim on the
    "requested" document lets only one of many concurrent viewers enqueue the task.
    """
    try:
        db.inquiry_activity_snapshots.find_one_and_update(
            {"_id": "requested", "at": {"$lte": now - REFRESH_INTERVAL + 1}}, {"$set": {"at": now}}, upsert=True)
    except DuplicateKeyError:
        return False
    try:
        from sefaria.celery_setup.app import app
        from sefaria.celery_setup.config import CeleryQueue
        app.send_task("inquiry.refresh_activity", queue=CeleryQueue.TASKS.value, expires=REFRESH_INTERVAL * 2)
    except Exception:
        # The page keeps serving the last snapshot; the next poll tries again.
        logger.exception("inquiry_atlas:refresh_enqueue_failed")
        return False
    return True
