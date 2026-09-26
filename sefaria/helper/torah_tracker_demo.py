"""
"View as Ploni" for Torah Tracker: a mock reader whose history comes from data/ploni_mock_data.json,
so the page can be demoed with rich data on local and cauldron environments without real user data.

Ploni has no Django account. He is a reserved negative uid, which no real user can have, and his
history is seeded into user_history on first use (and re-seeded once it goes stale) with dates
shifted so his newest reading falls in the current week.
"""
import json
import os
from datetime import datetime, timedelta

from django.conf import settings
from django.http.request import split_domain_port, validate_host

from sefaria.system.database import db

PLONI_UID = -1
PLONI_NAME = "Ploni Almoni"
FIXTURE_PATH = os.path.join(settings.BASE_DIR, "data", "ploni_mock_data.json")
STALE_AFTER = timedelta(days=7)


def demo_enabled(request):
    if not os.path.exists(FIXTURE_PATH):
        return False
    domain, _ = split_domain_port(request.get_host())
    return validate_host(domain, getattr(settings, "TORAH_TRACKER_DEMO_HOSTS", []))


def ensure_ploni_seeded():
    newest = db.user_history.find_one({"uid": PLONI_UID}, sort=[("datetime", -1)])
    if not newest or datetime.utcnow() - newest["datetime"] > STALE_AFTER:
        seed_ploni()


def seed_ploni():
    with open(FIXTURE_PATH, encoding="utf-8") as f:
        records = json.load(f)["records"]

    parse = lambda s: datetime.strptime(s, "%Y-%m-%dT%H:%M:%S")
    newest = max(parse(r["datetime"]) for r in records)
    # Whole weeks, so weekday habits (e.g. not reading on Shabbat) survive the shift
    shift = timedelta(weeks=(datetime.utcnow() - newest).days // 7)

    docs = []
    for r in records:
        dt = parse(r["datetime"]) + shift
        epoch = int((dt - datetime(1970, 1, 1)).total_seconds())
        docs.append(dict(r, uid=PLONI_UID, datetime=dt, time_stamp=epoch, server_time_stamp=epoch,
                         is_sheet=False, last_place=False))

    db.user_history.delete_many({"uid": PLONI_UID})
    db.user_history.insert_many(docs)
    _set_ploni_category_trends()


def _set_ploni_category_trends():
    # Same counting as trend.setCategoryTraits, for Ploni only, so his charts don't wait on the weekly trends job
    from sefaria.model import library
    from sefaria.model.trend import Trend, TrendSet, get_active_dateranges, read_in_category_key

    for daterange in get_active_dateranges():
        for category in library.get_top_categories():
            name = read_in_category_key(category)
            TrendSet({"period": daterange.key, "uid": PLONI_UID, "name": name}).delete()
            count = db.user_history.count_documents(daterange.update_match({
                "uid": PLONI_UID, "secondary": False, "is_sheet": False, "categories.0": category,
            }))
            if count:
                Trend({
                    "name": name, "value": count, "datatype": "int", "timestamp": datetime.utcnow(),
                    "period": daterange.key, "scope": "user", "uid": PLONI_UID,
                }).save()
