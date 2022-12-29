# -*- coding: utf-8 -*-

import csv, re, django
from tqdm import tqdm

django.setup()
from sefaria.model import *
from sefaria.helper.text import modify_text_by_function
from sefaria.model.abstract import SluggedAbstractMongoRecord
from sefaria.model.schema import TitleGroup

UID = 28
SOURCE_SLUG = "ashlag-glossary"
TEXTS = [
    'Peticha LeChokhmat HaKabbalah',
    'Introduction to Sulam Commentary'
]

#####
# UTIL
#####
def get_ashlag_topics():
    return TopicSet({"properties.source": SOURCE_SLUG})


def replace_dots(s):
    return s.replace("Ḥ", "H").replace("ḥ", "h")


def normalize(s):
    return replace_dots(s).lower()


def find_angle_quotes(s):
    return re.findall(r'<<([^<>]*)>>', s)


#####
# IMPORT
#####
def load_raw_from_sheet():
    with open('/Users/levisrael/Downloads/Background entries DATABASE - live - Background entries DATABASE - live.csv', 'r') as csvfile:
        reader = csv.DictReader(csvfile)
        return list(reader)


def remove_existing_topics():
    get_ashlag_topics().delete()


def import_from_sheet():
    remove_existing_topics()
    for d in load_raw_from_sheet():
        t = build_topic_from_record(d)
        t.save()


def get_slug_from_record(d):
    slug_base = d.get("term english") or d.get("term translation")
    if slug_base is None:
        print(f"No slug for {d}")
    return SluggedAbstractMongoRecord.normalize_slug(slug_base)


def build_topic_from_record(d):
    # ['term english', 'term translation', 'term alternate', 'term hebrew', 'term hebrew alternate', 'hebrew description', 'english description']
    slug = get_slug_from_record(d)

    t = Topic()
    t.slug = slug

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
    t.properties = {"source": SOURCE_SLUG}

    return t

#####
# WRAP
#####


def get_normal_mapping():
    # Build mapping of normal forms to topics

    mapping = {}
    for topic in get_ashlag_topics():
        assert isinstance(topic, Topic)
        for t in topic.get_titles("en"):
            mapping[normalize(t)] = topic
    return mapping


def wrap_all():
    mapping = get_normal_mapping()
    for t in TEXTS:
        wrap_text(t, mapping)


def wrap_text(text_name, mapping):
    def wrap_terms(s, _):
        # Find bracketed terms
        # For each term
        # Normalize - find associated topic
        # If no topic - unwrap brackets and carp
        # If topic found - wrap term

        def sub_term(m):
            """
            :param m: MatchObject
            :return:
            """
            matched_term = m.group(1)
            if not matched_term:
                print("No matched term")

            normal_term = normalize(matched_term)
            topic = mapping.get(normal_term)
            if not topic:
                print(f"No topic match for {matched_term} / {normal_term}")
                return matched_term

            slug = topic.slug
            url = f"/topics/{slug}"
            return f'<a href="{url}" class="namedEntityLink" data-slug="{slug}">{matched_term}</a>'

        return re.sub(r'<<([^<>]*)>>', sub_term, s)

    print(text_name)
    vs = VersionSet({'title': text_name, 'language': 'en'})
    for v in vs:
        print(v.versionTitle)
        modify_text_by_function(text_name, v.versionTitle, 'en', wrap_terms, 28)


def set_topic_datasource():

    tds_json = {
        "slug": SOURCE_SLUG,
        "displayName": {
            "en": "Glossary of terms in the writings of Rabbi Yehuda Ashlag",
            "he": "מילון מונחים בכתבי רבי יהודה אשלג"
        }
    }
    tds = TopicDataSource().load({"slug": tds_json['slug']})
    if tds is None:
        TopicDataSource(tds_json).save()


def test_coverage():
    background_list = load_raw_from_sheet()
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
            for s in find_angle_quotes(d["english description"]):
                all_dict_words.add(normalize(s))

    dict_unhandled = all_dict_words - ets - tts - tas
    print("Words unhandled in dictionary itself:")
    print(dict_unhandled)


    r = Ref('Peticha LeChokhmat HaKabbalah')
    all_plh_words = set()
    for line in r.text("en").ja().flatten_to_array():
        for s in find_angle_quotes(line):
            all_plh_words.add(normalize(s))

    plh_unhandled = all_plh_words - ets - tts - tas
    print()
    print("Words unhandled in PLH:")
    print(plh_unhandled)


    r = Ref('Introduction to Sulam Commentary')
    all_isc_words = set()
    for line in r.text("en").ja().flatten_to_array():
        for s in find_angle_quotes(line):
            all_isc_words.add(normalize(s))

    isc_unhandled = all_isc_words - ets - tts - tas
    print()
    print("Words unhandled in ISC:")
    print(isc_unhandled)

    print()
    print("All Unhandled Words:")
    print(dict_unhandled | isc_unhandled | plh_unhandled)

# test_coverage()
# import_from_sheet()
wrap_all()
