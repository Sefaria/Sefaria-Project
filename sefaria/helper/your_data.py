# -*- coding: utf-8 -*-
"""
The "Your data" page: what Sefaria stores about a signed-in user, and the controls on it.

PROOF OF CONCEPT. Everything a user can see or do on /settings/your-data goes through this
module, so the page, the JSON export and the history controls agree on what "your data"
means. Data is split the way the page presents it:

* **You told us** - account and profile fields, account settings, translation and version
  preferences, and the display preferences kept as cookies on the current device.
* **Based on your reading** - reading history and the traits the weekly job in
  ``sefaria/model/trend.py`` infers from it (Hebrew ability, category reads, ...).

Known gap, deliberately not fixed here: ``sefaria.utils.user.delete_user_account`` removes
history, sheets, notes, notifications, follows and the profile, but leaves this user's
``trend`` records, ``blocking`` records and Library Assistant conversations (held by the
separate chatbot service). A real self-serve deletion flow must cover those too.
"""
from datetime import datetime
import json
import urllib.parse

from sefaria.constants.model import READING_HISTORY_PAUSED_SETTING_KEY
from sefaria.model.text import Ref
from sefaria.model.trend import TrendSet, reverse_read_in_category_key
from sefaria.model.user_profile import UserHistorySet
from sefaria.system.database import db

PAUSED_KEY = READING_HISTORY_PAUSED_SETTING_KEY

RECENT_HISTORY_COUNT = 5

# Profile fields a user fills in on /settings/profile, with the label the page shows.
PROFILE_FIELDS = [
    ("position", "Position"),
    ("organization", "Organization"),
    ("location", "Location"),
    ("website", "Website"),
    ("public_email", "Public email"),
    ("bio", "Bio"),
    ("jewish_education", "Jewish education"),
    ("facebook", "Facebook"),
    ("twitter", "Twitter"),
    ("linkedin", "LinkedIn"),
    ("youtube", "YouTube"),
]

# Reader display preferences that live only in cookies on the current device.
DEVICE_COOKIES = [
    ("contentLang", "Text language (Hebrew / English / bilingual)"),
    ("sidebarLang", "Connections panel language"),
    ("translation_language_preference", "Preferred translation language"),
    ("version_preferences_by_corpus", "Preferred versions"),
]

# Profile keys that are credentials or internal CRM ids rather than things a user told us.
EXPORT_EXCLUDED_PROFILE_KEYS = {"gauth_token", "_id"}


def history_is_on(profile):
    return profile.settings.get("reading_history", True)


def history_is_paused(profile):
    return bool(profile.settings.get(PAUSED_KEY, False))


def _format_time(epoch_seconds):
    if not epoch_seconds:
        return None
    return datetime.utcfromtimestamp(epoch_seconds).strftime("%Y-%m-%d")


def _format_timestamp(ts):
    """Trend timestamps are datetimes when written by the weekly job, epoch ints otherwise."""
    if isinstance(ts, datetime):
        return ts.strftime("%Y-%m-%d")
    if isinstance(ts, (int, float)):
        return _format_time(ts)
    return None


def _trait_label(name):
    """Human-readable name for a trend, as shown on the page."""
    if name.startswith("ReadInCategory"):
        return "Passages read in %s" % reverse_read_in_category_key(name)
    return {
        "HebrewAbility": "Reads Hebrew",
        "EnglishTolerance": "Reads English",
        "SheetsRead": "Source sheets read",
        "SheetsCreated": "Source sheets created",
        "SheetsCreatedPublic": "Public source sheets created",
        "ParashaLearner": "Follows the weekly Torah portion",
    }.get(name, name)


def _trait_value(trend):
    if trend.datatype == "float":
        # HebrewAbility / EnglishTolerance are 0..1 scores; the product only ever uses them
        # as thresholds (see get_session_traits), so show the reading the site acts on.
        threshold = .5 if trend.name == "HebrewAbility" else .05
        return "Yes" if trend.value >= threshold else "No"
    if trend.datatype == "bool":
        return "Yes" if trend.value else "No"
    return trend.value


def get_inferred_traits(uid):
    """
    This user's traits from the weekly trend job, one row per trait, all-time value
    preferred over the "currently" window.
    """
    rows = {}
    for trend in TrendSet({"uid": uid, "scope": "user"}, sort=[("name", 1)]):
        existing = rows.get(trend.name)
        if existing and existing["period"] == "alltime":
            continue
        rows[trend.name] = {
            "name": trend.name,
            "label": _trait_label(trend.name),
            "value": _trait_value(trend),
            "period": trend.period,
            "computed": _format_timestamp(trend.timestamp),
        }
    # Category reads last, the rest first, both alphabetical by label.
    return sorted(rows.values(), key=lambda r: (r["name"].startswith("ReadInCategory"), r["label"]))


def _ref_url(tref):
    try:
        return "/" + Ref(tref).url()
    except Exception:
        return None


def get_history_summary(profile):
    uid = profile.id
    reading = {"uid": uid, "saved": False}
    count = db.user_history.count_documents(reading)
    oldest = db.user_history.find_one(reading, {"time_stamp": 1}, sort=[("time_stamp", 1)])
    recent = [
        {"ref": h.ref, "he_ref": getattr(h, "he_ref", h.ref), "url": _ref_url(h.ref), "date": _format_time(h.time_stamp)}
        for h in UserHistorySet(dict(reading, secondary=False), sort=[("time_stamp", -1)], limit=RECENT_HISTORY_COUNT)
    ]
    return {
        "on": history_is_on(profile),
        "paused": history_is_paused(profile),
        "count": count,
        "saved_count": db.user_history.count_documents({"uid": uid, "saved": True}),
        "since": _format_time(oldest["time_stamp"]) if oldest else None,
        "recent": recent,
    }


def get_device_preferences(cookies):
    rows = []
    for key, label in DEVICE_COOKIES:
        if key in cookies:
            value = urllib.parse.unquote(cookies[key])
            if key == "version_preferences_by_corpus":
                try:
                    value = "%d saved" % len(json.loads(value))
                except (ValueError, TypeError):
                    pass
            rows.append({"label": label, "value": value})
    return rows


def get_your_data_summary(profile, user, cookies, social_providers=()):
    """Everything the "Your data" page renders, grouped the way it presents it."""
    profile_fields = []
    for key, label in PROFILE_FIELDS:
        value = getattr(profile, key, None)
        if isinstance(value, list):
            value = ", ".join(str(v) for v in value if v)
        if value:
            profile_fields.append({"label": label, "value": value})
    if profile.profile_pic_url:
        profile_fields.append({"label": "Profile photo", "value": "Uploaded"})

    return {
        "told_us": {
            "account": {
                "name": profile.full_name,
                "email": user.email,
                "joined": user.date_joined.strftime("%Y-%m-%d") if user.date_joined else None,
                "login": ", ".join(p.capitalize() for p in social_providers) or "Email and password",
            },
            "profile_fields": profile_fields,
            "settings": profile.settings,
            "version_preferences_count": sum(len(v) for v in profile.version_preferences_by_corpus.values()),
            "device_preferences": get_device_preferences(cookies),
            "google_drive": profile.gauth_email,
        },
        "from_reading": {
            "history": get_history_summary(profile),
            "traits": get_inferred_traits(profile.id),
        },
        "counts": {
            "sheets": db.sheets.count_documents({"owner": profile.id}),
            "notes": db.notes.count_documents({"owner": profile.id}),
            "following": len(profile.followees.uids),
            "followers": len(profile.followers.uids),
        },
    }


def export_user_data(profile, user, cookies):
    """A JSON-serializable copy of everything the page describes, for download."""
    uid = profile.id
    profile_doc = {k: v for k, v in profile.to_mongo_dict().items() if k not in EXPORT_EXCLUDED_PROFILE_KEYS}
    # Read raw documents: hydrating every UserHistory record is slow for heavy readers.
    history = list(db.user_history.find({"uid": uid}, {"_id": 0, "uid": 0}).sort("time_stamp", -1))
    traits = []
    for t in TrendSet({"uid": uid, "scope": "user"}):
        traits.append({
            "name": t.name,
            "label": _trait_label(t.name),
            "value": t.value,
            "period": t.period,
            "computed": _format_timestamp(t.timestamp),
        })
    sheets = [
        {"id": s["id"], "title": s.get("title"), "status": s.get("status"),
         "dateCreated": s.get("dateCreated"), "dateModified": s.get("dateModified")}
        for s in db.sheets.find({"owner": uid}, {"id": 1, "title": 1, "status": 1, "dateCreated": 1, "dateModified": 1})
    ]
    notes = [{k: v for k, v in n.items() if k != "_id"} for n in db.notes.find({"owner": uid})]
    return {
        "exported": datetime.utcnow().isoformat() + "Z",
        "you_told_us": {
            "account": {
                "first_name": user.first_name,
                "last_name": user.last_name,
                "email": user.email,
                "date_joined": user.date_joined.isoformat() if user.date_joined else None,
            },
            "profile": profile_doc,
            "device_preferences": {k: urllib.parse.unquote(cookies[k]) for k, _ in DEVICE_COOKIES if k in cookies},
        },
        "based_on_your_reading": {
            "reading_history": history,
            "inferred_traits": traits,
        },
        "your_content": {
            "sheets": sheets,
            "notes": notes,
            "following": profile.followees.uids,
            "followers": profile.followers.uids,
        },
        "not_included": [
            "Library Assistant conversations (kept by the Library Assistant service)",
            "Newsletter data held in Salesforce (name, email, language, educator answer)",
        ],
    }


def clear_reading_history(profile):
    """
    Delete reading history and the traits inferred from it. Saved items are kept, as when
    reading history is turned off. The weekly trend job recomputes traits from whatever
    history remains.
    """
    profile.delete_user_history(exclude_saved=True, exclude_last_place=False)
    TrendSet({"uid": profile.id, "scope": "user"}).delete(bulk_delete=True)


def set_history_paused(profile, paused):
    """Pause stops recording new reading history but keeps what is already there."""
    profile.update({"settings": {PAUSED_KEY: bool(paused)}})
    profile.save()
    return profile
