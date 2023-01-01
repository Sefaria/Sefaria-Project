# -*- coding: utf-8 -*-

import csv, re, django
from tqdm import tqdm

django.setup()
from sefaria.model import *
from sefaria.helper.text import modify_text_by_function
from sefaria.model.abstract import SluggedAbstractMongoRecord

UID = 28
SOURCE_SLUG = "ashlag-glossary"
TEXTS = [
    'Peticha LeChokhmat HaKabbalah',
    'Introduction to Sulam Commentary'
]
# Group 1: Openings tags
# Group 2: Matched Word(s)
# Group 3: Closing tags
# FULL_REG = re.compile(r'(?:<<|&lt&lt)((?:<[^<>]*>)*)([^<>]*)((?:<[^<>]*>)*)(?:>>|&rt&rt)')
FULL_REG = re.compile(r'(?:<<|&lt&lt)(.*?)(?:>>|&rt&rt)(?!>|&rt)')


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
    return FULL_REG.finditer(s)


#####
# IMPORT
#####
def load_raw_from_sheet():
    with open('/Users/levisrael/Downloads/Background entries DATABASE - live - Background entries DATABASE - live.csv', 'r') as csvfile:
        reader = csv.DictReader(csvfile)
        return list(reader)


def remove_existing_topics():
    get_ashlag_topics().delete()


def set_topic_datasource():
    tds_json = {
        "slug": SOURCE_SLUG,
        "displayName": {
            "en": "Glossary of terms in the writings of Rabbi Yehuda Ashlag",
            "he": "מילון מונחים בכתבי רבי יהודה אשלג"
        }
    }
    tds = TopicDataSource().load({"slug": SOURCE_SLUG})
    if tds is None:
        TopicDataSource(tds_json).save()


def build_all_topics():
    remove_existing_topics()
    set_topic_datasource()

    # add category
    category_topic = Topic()
    category_topic.add_primary_titles("Kabbalah Concept", "מושג מהקבלה")
    category_topic.slug = "Kabbalah Concept"
    category_topic.properties = {"source": SOURCE_SLUG}
    category_topic.save()

    # import from sheet
    for d in load_raw_from_sheet():
        t = build_topic_from_record(d)
        t.save()
        set_is_a(t, category_topic, SOURCE_SLUG)


def get_slug_from_record(d):
    slug_base = d.get("term english") or d.get("term translation")
    if slug_base is None:
        print(f"No slug for {d}")
    return SluggedAbstractMongoRecord.normalize_slug(slug_base)


def set_is_a(from_topic, to_topic, data_source_slug):
    link_json = {
        "class": "intraTopic",
        "fromTopic": from_topic.slug,
        "toTopic": to_topic.slug,
        "linkType": "is-a",
        "dataSource": data_source_slug
    }

    link_json['generatedBy'] = "Import Ashlag Topics"
    itl = IntraTopicLink().load(link_json)
    if itl is not None:
        itl.delete()
    itl = IntraTopicLink(link_json)
    itl.save()


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

    for title in t.get_titles_object():
        if title['lang'] == "en":
            title['disambiguation'] = "Kabbalah"
        if title['lang'] == "he":
            title['disambiguation'] = "קבלה"

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

def create_ref_topic_link(ref, topic, version, match):
    link = {
        "toTopic": topic.slug,
        "linkType": "mention",
        "dataSource": "sefaria",
        "class": "refTopic",
        "is_sheet": False,
        "ref": ref.normal(),
        "expandedRefs": [ref.normal()],
        "charLevelData": {
            "startChar": ne["start"],
            "endChar": ne["end"],
            "versionTitle": version.versionTitle,
            "language": version.language,
            "text": ne["mention"]
        }
    }


def wrap_all():
    mapping = get_normal_mapping()


    # 1 Find all cases of << >>
    # 2 Pull contiguous phrases from overall match
    # 3 If anything in there matches a term - success
    # 4 Get
    #   the location of the thing within the match object
    #   the location of the match object within the overall string
    #   correct for << >> removed up until now

    # or
    # 4 record success, and remove << >>
    # 5 make a second pass finding final location of successes



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
            matched_term = m.group(2)
            if not matched_term:
                print("No matched term")

            normal_term = normalize(matched_term)
            topic = mapping.get(normal_term)
            if not topic:
                print(f"No topic match for {matched_term} / {normal_term}")
                return f'{m.group(1)}{matched_term}{m.group(3)}'

            slug = topic.slug
            url = f"/topics/{slug}"
            return f'{m.group(1)}<a href="{url}" class="namedEntityLink" data-slug="{slug}">{matched_term}</a>{m.group(3)}'

        return FULL_REG.sub(sub_term, s)

    print(text_name)
    vs = VersionSet({'title': text_name, 'language': 'en'})
    for v in vs:
        print(v.versionTitle)
        modify_text_by_function(text_name, v.versionTitle, 'en', wrap_terms, 28, skip_links=True)


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
                all_dict_words.add(normalize(s.group(2)))

    dict_unhandled = all_dict_words - ets - tts - tas
    print("Words unhandled in dictionary itself:")
    print(dict_unhandled)


    r = Ref('Peticha LeChokhmat HaKabbalah')
    all_plh_words = set()
    for line in r.text("en").ja().flatten_to_array():
        for s in find_angle_quotes(line):
            all_plh_words.add(normalize(s.group(2)))

    plh_unhandled = all_plh_words - ets - tts - tas
    print()
    print("Words unhandled in PLH:")
    print(plh_unhandled)


    r = Ref('Introduction to Sulam Commentary')
    all_isc_words = set()
    for line in r.text("en").ja().flatten_to_array():
        for s in find_angle_quotes(line):
            all_isc_words.add(normalize(s.group(2)))

    isc_unhandled = all_isc_words - ets - tts - tas
    print()
    print("Words unhandled in ISC:")
    print(isc_unhandled)

    print()
    print("All Unhandled Words:")
    print(dict_unhandled | isc_unhandled | plh_unhandled)


def dump_all():

    for t in TEXTS:
        for seg in Ref(t).all_segment_refs():
            for s in find_angle_quotes(seg.text("en").text):
                print()
                print(s.group(1))
                # Find malformed lines
                # if "<<" in s.group(1):
                #    print()
                #    print(seg.normal())
                #    print(s.group(1))

    background_list = load_raw_from_sheet()
    for d in background_list:
        for s in find_angle_quotes(d["english description"]):
            print()
            print(s.group(1))


# test_coverage()
# build_all_topics()
# wrap_all()
# dump_all()