r"""
Patterns for spotting spam in the text a user can write, wherever they can write it.

Used by both spam dashboards (sefaria.views.sheet_spam_dashboard and
profile_spam_dashboard). What reads as spam in a profile bio reads as spam in a sheet,
so the free-text rule is defined once here as spam_text_clauses() and pointed at
whichever field is being reviewed.

The patterns run against two different stores: first and last name live on the Django
User record in Postgres, while slugs, bios and sheet text live in Mongo. A pattern that
runs against both has to stay inside the regex subset Postgres, Python and PCRE share --
no \b, \d or lookarounds. Where a boundary is needed, ([^a-z]|$) stands in for the \y
Postgres wants and the \b Python wants.
"""

SPAM_KEYWORDS = ["support", "coin", "helpline", "base"]

# Matched against the profile slug in Mongo.
SPAM_KEYWORDS_REGEX = r'(?i)' + "|".join(r'.*%s.*' % keyword for keyword in SPAM_KEYWORDS)

# Markup links in user-written text. Deliberately ignores links back to Sefaria.
SPAM_HREF_REGEX = r'.*(?!href=[\'"](\/|http(s)?:\/\/(www\.)?sefaria).+[\'"])(href).*'

# User-written text can advertise a contact number with no spam keyword present. This wants
# 9+ digits in a loose grouping, so that prose like a "2020-2024" date range doesn't read
# as a phone number, and so that two years in one sentence can't chain into a single match.
# The trade is that a bare 7 digit local number is missed -- it has the same shape as a
# year range, and a number advertised as spam carries an area or country code anyway.
SPAM_PHONE_REGEX = r'[0-9]([-. ()+]{0,2}[0-9]){8,}'

SPAM_URL_TLDS = ["com", "net", "org", "info", "biz", "xyz", "top", "club", "online", "site",
                 "shop", "live", "io", "co", "ru", "uk", "de", "me", "il"]

# Matched against names in Postgres, so no lookaheads.
SPAM_NAME_URL_REGEX = r'(https?://|www\.|[a-z0-9_-]+\.(%s)([^a-z]|$))' % "|".join(SPAM_URL_TLDS)

# Matched against free text, and only ever in Mongo, so this one can use a lookahead to leave
# links back to Sefaria alone the way SPAM_HREF_REGEX does. The leading boundary is what makes
# that exclusion hold: without it the pattern would sidestep the lookahead by matching from
# "efaria.org". Built from the same TLD list so the two can't drift apart.
SPAM_URL_REGEX = r'(^|[^a-z0-9_.-])(https?://)?(www\.)?(?!sefaria\.)[a-z0-9_-]+\.(%s)([^a-z]|$)' % "|".join(SPAM_URL_TLDS)


def spam_text_clauses(*fields):
    """
    Mongo $or branches flagging spammy free text in any of `fields`.

    One rule for every place a user can write prose -- a profile bio, a sheet's outside
    text -- so that the two dashboards can't drift apart on what counts as spam.
    """
    return [clause for field in fields for clause in (
        {field: {"$regex": SPAM_HREF_REGEX}},
        {field: {"$regex": SPAM_PHONE_REGEX}},
        {field: {"$regex": SPAM_URL_REGEX, "$options": "i"}},
    )]


def spam_name_user_ids(min_user_id):
    """
    Ids of Users above `min_user_id` whose first or last name reads as spam.

    Names aren't in the Mongo profile doc, so the dashboard's main query can't reach them.
    This gets the ids from Postgres to fold back into that query. The two fields are matched
    as one string so that a phone number split across them is still caught.
    """
    from django.contrib.auth.models import User
    from django.db.models import Q, Value
    from django.db.models.functions import Concat

    name_query = Q()
    for keyword in SPAM_KEYWORDS:
        name_query |= Q(full_name__icontains=keyword)
    for pattern in [SPAM_PHONE_REGEX, SPAM_NAME_URL_REGEX]:
        name_query |= Q(full_name__iregex=pattern)

    return list(User.objects
                .annotate(full_name=Concat("first_name", Value(" "), "last_name"))
                .filter(name_query, id__gt=min_user_id)
                .values_list("id", flat=True))
