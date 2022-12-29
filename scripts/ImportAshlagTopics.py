# -*- coding: utf-8 -*-

import csv, re, django
from tqdm import tqdm
django.setup()
from sefaria.model import *
from sefaria.helper.text import modify_text_by_function
from sefaria.model.abstract import SluggedAbstractMongoRecord
from sefaria.model.schema import TitleGroup

# ['term english', 'term translation', 'term alternate', 'term hebrew', 'term hebrew alternate', 'hebrew description', 'english description']
with open('/Users/levisrael/Downloads/Background entries DATABASE - live - Background entries DATABASE - live.csv', 'r') as csvfile:
    reader = csv.DictReader(csvfile)
    background_list = list(reader)

# Load objects from spreadsheet
# Create Topic from each object


def getSlugFromRecord(d):
    slug_base = d.get("term english") or d.get("term translation")
    if slug_base is None:
        print(f"No slug for {d}")
    return SluggedAbstractMongoRecord.normalize_slug(slug_base)

def buildTopicFromRecord(d):
    # ['term english', 'term translation', 'term alternate', 'term hebrew', 'term hebrew alternate', 'hebrew description', 'english description']
    slug = getSlugFromRecord(d)

    t = Topic.init(slug)
    if t:
        t.delete()

    t = Topic()
    t.set_slug(slug)

    # Set all the titles and primary titles
    if d.get("term english"):
        t.add_title(d.get("term english"), "en")
    if d.get("term translation"):
        t.add_title(d.get("term translation"), "en")
    # Make a primary en title
    t.add_title(d.get("term english", d.get("term translation")), "en", True, True)
    if d.get("term alternate"):
       for s in d.get("term alternate").split(","):
           t.add_title(s, "en")
    if d.get("term hebrew"):
        t.add_title(d.get("term hebrew"), "he", True)
    if d.get("term hebrew alternate"):
        for s in d.get("term alternate").split(","):
            t.add_title(s, "he")

    t.change_description({
        "en": d.get('english description'),
        "he": d.get('hebrew description'),
    })
    t.description_published = True

def createNewTopics():

    topic_json = {
        "slug": SluggedAbstractMongoRecord.normalize_slug(slug),
        "titles": titles
    }

def findAngleQuotes(s):
    return re.findall(r'<<([^<>]*)>>', s)


def subTerm(m):
    """
    :param m: MatchObject
    :return:
    """
    matched_term = m.group(1)
    if not matched_term:
        print("No matched term")
    # Lookup term, get slug

    slug = ""
    url = f"/topics/{slug}"
    s = f'<a href="{url}" class="namedEntityLink" data-slug="{slug}">{matched_term}</a>'
    return s


def wrapTerms(s):
    return re.sub(r'<<([^<>]*)>>', subTerm, s)


def normalize(s):
    return s.replace("Ḥ", "H").replace("ḥ", "h").lower()

def set_topic_datasource():
    tds_json = {
        "slug": "ashlag-glossary",
        "displayName": {
            "en": "Glossary of terms in the writings of Rabbi Yehuda Ashlag",
            "he": "מילון מונחים בכתבי רבי יהודה אשלג"
        }
    }
    tds = TopicDataSource().load({"slug": tds_json['slug']})
    if tds is None:
        TopicDataSource(tds_json).save()

def test_coverage():
    english_terms = {normalize(d["term english"]):d for d in background_list}
    term_translations = {normalize(d['term translation']):d for d in background_list}
    term_alternates = {normalize(e.strip()):d for d in background_list for e in d['term alternate'].split(",")}
    ets = set(english_terms.keys())
    tts = set(term_translations.keys())
    tas = set(term_alternates.keys())

    all_dict_words = set()
    for d in background_list:
        if not d.get("english description"):
            print("No desc in " + d["term english"])
        else:
            for s in findAngleQuotes(d["english description"]):
                all_dict_words.add(normalize(s))

    dict_unhandled = all_dict_words - ets - tts - tas
    print("Words unhandled in dictionary itself:")
    print(dict_unhandled)


    r = Ref('Peticha LeChokhmat HaKabbalah')
    all_plh_words = set()
    for line in r.text("en").ja().flatten_to_array():
        for s in findAngleQuotes(line):
            all_plh_words.add(normalize(s))

    plh_unhandled = all_plh_words - ets - tts - tas
    print()
    print("Words unhandled in PLH:")
    print(plh_unhandled)


    r = Ref('Introduction to Sulam Commentary')
    all_isc_words = set()
    for line in r.text("en").ja().flatten_to_array():
        for s in findAngleQuotes(line):
            all_isc_words.add(normalize(s))

    isc_unhandled = all_isc_words - ets - tts - tas
    print()
    print("Words unhandled in ISC:")
    print(isc_unhandled)

    print()
    print("All Unhandled Words:")
    print(dict_unhandled | isc_unhandled | plh_unhandled)


test_coverage()

