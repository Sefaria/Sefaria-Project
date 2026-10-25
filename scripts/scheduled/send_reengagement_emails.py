# -*- coding: utf-8 -*-
"""
PoC: send "pick up where you left off" re-engagement emails to users who have
gone quiet for a while, pointing them back to the last thing they were reading
(with Daf Yomi framing when it applies).

Dry-run by default: prints who would be emailed and what the email would say.
Pass --send to actually send mail. --send still requires --send-to-self, which
redirects every email to one address, so this script cannot yet reach real
users by accident - that needs a deliberate follow-up change once reviewed.

Usage:
    python scripts/scheduled/send_reengagement_emails.py
    python scripts/scheduled/send_reengagement_emails.py --min-days 3 --max-days 14
    python scripts/scheduled/send_reengagement_emails.py --send --send-to-self you@sefaria.org --limit 5
"""
import argparse
import datetime
import sys
import time

import django
django.setup()

from django.contrib.auth.models import User
from django.core.mail import EmailMultiAlternatives
from django.template.loader import render_to_string
from django.utils import translation

from sefaria.model import Ref
from sefaria.model.user_profile import UserProfile
from sefaria.system.database import db
from sefaria.utils.calendars import daf_yomi

SECONDS_PER_DAY = 86400


def find_candidates(min_days, max_days, limit=0):
    """
    Finds each user's most recent primary (non-sidebar) reading, and returns
    the ones whose last reading falls between min_days and max_days ago.
    """
    now = time.time()
    window_start = now - (max_days * SECONDS_PER_DAY)
    window_end = now - (min_days * SECONDS_PER_DAY)

    pipeline = [
        {"$match": {"secondary": {"$ne": True}}},
        {"$sort": {"server_time_stamp": -1}},
        {"$group": {"_id": "$uid", "last": {"$first": "$$ROOT"}}},
        {"$match": {"last.server_time_stamp": {"$gte": window_start, "$lte": window_end}}},
    ]
    if limit:
        pipeline.append({"$limit": limit})

    return [row["last"] for row in db.user_history.aggregate(pipeline)]


def find_daf_yomi_context(book, max_lookback_days=14):
    """
    If `book` matches a tractate Daf Yomi covered within the last
    max_lookback_days, returns (days_ago, display_value) for the closest
    match. Otherwise returns None.
    """
    today = datetime.datetime.today()
    for days_ago in range(max_lookback_days + 1):
        date = today - datetime.timedelta(days=days_ago)
        for entry in daf_yomi(date):
            if entry["ref"].startswith(book):
                return days_ago, entry["displayValue"]["en"]
    return None


def build_email(user, history_item):
    oref = Ref(history_item["ref"])
    days_since = int((time.time() - history_item["server_time_stamp"]) / SECONDS_PER_DAY)

    daf_context = None
    if oref.index.get_primary_category() == "Talmud":
        daf_context = find_daf_yomi_context(history_item["book"])

    context = {
        "recipient": user.first_name or user.username,
        "ref": oref.normal(),
        "he_ref": history_item.get("he_ref", oref.he_normal()),
        "ref_url": "/" + oref.url(),
        "days_since": days_since,
        "daf_yomi_display": daf_context[1] if daf_context else None,
    }

    message_html = render_to_string("email/reengagement_email.html", context)
    subject = "Pick up today's Daf Yomi where you left off" if daf_context else "Continue learning %s" % oref.normal()
    return subject, message_html


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--min-days", type=int, default=3, help="Minimum days of inactivity to qualify (default: 3)")
    parser.add_argument("--max-days", type=int, default=30, help="Maximum days of inactivity to qualify, so very long-gone users aren't emailed (default: 30)")
    parser.add_argument("--limit", type=int, default=0, help="Cap the number of candidates processed (0 = no cap)")
    parser.add_argument("--send", action="store_true", help="Actually send email. Without this flag, the script only prints what it would do.")
    parser.add_argument("--send-to-self", metavar="EMAIL", help="Redirect every email to this address instead of the real user, for safe testing. Required when using --send.")
    args = parser.parse_args()

    if args.send and not args.send_to_self:
        print("Refusing to send: this PoC script hasn't been reviewed for emailing real users yet.")
        print("Pass --send-to-self you@example.com to test the send path safely.")
        sys.exit(1)

    candidates = find_candidates(args.min_days, args.max_days, args.limit)
    print("Found %d candidate(s) inactive between %d and %d days.\n" % (len(candidates), args.min_days, args.max_days))

    sent = 0
    for history_item in candidates:
        try:
            user = User.objects.get(id=history_item["uid"])
        except User.DoesNotExist:
            continue
        if not user.is_active or not user.email:
            continue

        profile = UserProfile(id=user.id)
        if profile.settings.get("email_notifications") == "never":
            continue
        if not profile.settings.get("reading_history", True):
            continue

        curr_lang = translation.get_language()
        try:
            if "interface_language" in profile.settings:
                translation.activate(profile.settings["interface_language"][0:2])
            subject, message_html = build_email(user, history_item)
        finally:
            translation.activate(curr_lang)

        if args.send:
            to_email = args.send_to_self
            msg = EmailMultiAlternatives(subject, message_html, "Sefaria <hello@sefaria.org>", [to_email])
            msg.content_subtype = "html"
            msg.send()
            sent += 1
            print("Sent to %s (real user would have been %s, ref: %s)" % (to_email, user.email, history_item["ref"]))
        else:
            print("--- DRY RUN: would email %s ---" % user.email)
            print("Subject: %s" % subject)
            print(message_html)
            print()

    if args.send:
        print("\nSent %d email(s) to %s." % (sent, args.send_to_self))


if __name__ == "__main__":
    main()
