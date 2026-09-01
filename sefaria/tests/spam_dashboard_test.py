"""
Tests for sefaria/spam.py -- the patterns behind both spam dashboards.

Two halves, because the dashboards read two stores. The name patterns run in Postgres
and are exercised through the real ORM query in spam_name_user_ids(). The free-text and
slug patterns run in Mongo as $regex, and are exercised here with Python's re as a
stand-in for Mongo's PCRE -- close enough for the constructs these patterns use, and it
keeps the suite off a live Mongo.

The free-text cases are written as bios but the rule is field-agnostic: spam_text_clauses()
is what both dashboards point at their own fields, so the same cases govern sheet text.

The negative cases carry most of the weight. These dashboards feed a review queue whose
only action is irreversible deletion, so a pattern that flags ordinary members is worse
than one that misses a spammer: 'Miriam Cohen' must not read as the .co TLD, '2020-2024'
must not read as a phone number, and text linking to sefaria.org must stay clear, which
is the carve-out SPAM_HREF_REGEX already makes for markup links.
"""
import re

import pytest
from django.contrib.auth.models import User

from sefaria.spam import (SPAM_PHONE_REGEX, SPAM_NAME_URL_REGEX, SPAM_KEYWORDS,
                          spam_text_clauses, spam_name_user_ids)


# (first_name, last_name, should_be_flagged, why)
NAME_CASES = [
    ("Coinbase", "Support 1-800-555-1234", True, "keyword and phone"),
    ("Binance", "Helpline", True, "keyword alone"),
    ("1-800", "555-1234", True, "phone split across the two fields"),
    ("Call", "+1 (888) 555 0199", True, "bracket and space grouping"),
    ("Wallet", "18885550199", True, "unpunctuated digit run"),
    ("Tel", "972-2-123-4567", True, "israeli grouping"),
    ("Visit", "spam.co.il", True, "bare url"),
    ("Free", "visit-us.com", True, "bare url, hyphenated host"),
    ("Click", "http://spam.ru", True, "url with scheme"),
    ("Best", "www.example.org", True, "url with www"),

    ("Miriam", "Cohen", False, "'Co' must not read as the .co TLD"),
    ("Yaakov", "Levi", False, "ordinary name"),
    ("Jean-Pierre", "St.Clair", False, "dot inside a surname"),
    ("B.", "Cohen", False, "initial followed by a dot"),
    ("Levi", "613", False, "digit run under the threshold"),
    ("Rabbi", "2020-2024", False, "date range, 8 digits"),
    ("Sarah", "Netanel", False, "contains 'net', not as a TLD"),
    ("Dov", "Weinberg", False, "no keyword, number or url"),
]

# (text, should_be_flagged, why)
TEXT_CASES = [
    ('Call our helpline at 1-800-555-1234 now', True, "phone in prose"),
    ('Visit spam.ru for free coins', True, "bare url, no markup"),
    ('reach me at WWW.SPAM-SITE.COM', True, "uppercase bare url"),
    ('crypto help: http://wallet-recovery.xyz', True, "url with scheme"),
    ('My site <a href="http://spam.ru">here</a>', True, "external link in markup"),
    ('support at 972 2 123 4567', True, "space separated number"),

    ('Read <a href="https://www.sefaria.org/Genesis">Genesis</a>', False, "sefaria link in markup"),
    ('I post my sheets at www.sefaria.org/profile/me', False, "bare sefaria url"),
    ('See sefaria.org for my sheets', False, "bare sefaria url without www"),
    ('Rabbi in Jerusalem, 2020-2024', False, "date range"),
    ('Studied 2015-2019, ordained 2021', False, "two dates in one sentence"),
    ('Born 1948. Teaching since 1975.', False, "years across two sentences"),
    ('Author of a Mishnah Berurah commentary', False, "ordinary prose"),
    ('Interested in Talmud, Halakhah and Tanakh', False, "ordinary prose with commas"),
]


def text_is_flagged(text):
    """
    Run the dashboards' actual Mongo clauses against `text` with re.

    Reads the clauses out of spam_text_clauses() rather than restating the patterns, so
    that a change to the rule -- a new pattern, a dropped one, a changed $options -- is
    picked up here instead of quietly passing against a stale copy.
    """
    for clause in spam_text_clauses("field"):
        spec = clause["field"]
        flags = re.I if spec.get("$options") == "i" else 0
        if re.search(spec["$regex"], text, flags):
            return True
    return False


def name_is_flagged(first_name, last_name):
    """Mirror of spam_name_user_ids()'s matching, without the database."""
    full_name = "%s %s" % (first_name, last_name)
    return bool(any(keyword in full_name.lower() for keyword in SPAM_KEYWORDS)
                or re.search(SPAM_PHONE_REGEX, full_name)
                or re.search(SPAM_NAME_URL_REGEX, full_name, re.I))


@pytest.mark.parametrize("first_name,last_name,expected,why", NAME_CASES)
def test_name_patterns(first_name, last_name, expected, why):
    assert name_is_flagged(first_name, last_name) is expected, why


@pytest.mark.parametrize("text,expected,why", TEXT_CASES)
def test_text_patterns(text, expected, why):
    assert text_is_flagged(text) is expected, why


def test_spam_text_clauses_covers_every_field_it_is_given():
    """Both dashboards get the identical rule, whatever field they point it at."""
    bio_clauses = spam_text_clauses("bio")
    sheet_clauses = spam_text_clauses("sources.outsideText", "sources.comment")

    assert [list(clause)[0] for clause in bio_clauses] == ["bio"] * 3
    assert len(sheet_clauses) == 6
    assert ([clause["sources.outsideText"] for clause in sheet_clauses[:3]]
            == [clause["bio"] for clause in bio_clauses]), "fields must share one rule"


@pytest.mark.django_db
def test_spam_name_user_ids_matches_the_name_patterns():
    """The ORM query flags the same names the patterns do, via Postgres rather than re."""
    for i, (first_name, last_name, _, _why) in enumerate(NAME_CASES):
        User.objects.create(id=100 + i, username="spamtest%d" % i,
                            first_name=first_name, last_name=last_name)

    flagged = set(spam_name_user_ids(50))

    for i, (first_name, last_name, expected, why) in enumerate(NAME_CASES):
        assert ((100 + i) in flagged) is expected, "%s %s: %s" % (first_name, last_name, why)


@pytest.mark.django_db
def test_spam_name_user_ids_ignores_users_below_the_cutoff():
    """An older account is out of scope even when its name matches."""
    User.objects.create(id=1, username="spamtestold", first_name="Coinbase", last_name="Support")
    User.objects.create(id=100, username="spamtestnew", first_name="Coinbase", last_name="Support")

    assert spam_name_user_ids(50) == [100]
