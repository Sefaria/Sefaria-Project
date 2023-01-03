# -*- coding: utf-8 -*-

import csv, re, django
from collections import OrderedDict
from tqdm import tqdm

django.setup()
from sefaria.model import *
from sefaria.model.abstract import SluggedAbstractMongoRecord
from sefaria.system.exceptions import DuplicateRecordError

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
PHRASE_REG = re.compile(r'[^()<>,. ][^()<>,.]+[^()<>,. ]')

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


def remove_ref_topic_links():
    RefTopicLinkSet({"dataSource": SOURCE_SLUG}).delete()


def remove_intra_topic_links():
    IntraTopicLinkSet({"dataSource": SOURCE_SLUG}).delete()


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
    remove_ref_topic_links()
    remove_intra_topic_links()
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
class TextMatches:
    def __init__(self):
        self.matches = OrderedDict()

    def add_match(self, oref, phrase, topic):
        """

        :param ref: Ref object
        :param phrase: string
        :param topic: Topic object
        :return:
        """
        ref = oref.normal()
        if not self.matches.get(ref):
            self.matches[ref] = []
        self.matches[ref] += [{"phrase": phrase, "topic": topic}]

    def all_matches(self):
        return self.matches.items()

    def all_refs(self):
        return self.matches.keys()

    def for_ref(self, ref):
        for d in self.matches.get(ref):
            yield d["phrase"], d["topic"]

    def unique_for_ref(self, ref):
        done = set()
        for d in self.matches.get(ref):
            if d["phrase"] in done:
                continue
            else:
                yield d["phrase"], d["topic"]
                done.add(d["phrase"])


def get_normal_mapping():
    # Build mapping of normal forms to topics

    mapping = {}
    for topic in get_ashlag_topics():
        assert isinstance(topic, Topic)
        for t in topic.get_titles("en", with_disambiguation=False):
            mapping[normalize(t)] = topic
    return mapping


def create_ref_topic_link(ref: text.Ref, topix: topic.Topic, version: text.Version, match: re.Match):
    """

    :param ref:
    :param topix:
    :param version:
    :param match: re.Match
    :return:
    """
    link = {
        "toTopic": topix.slug,
        "linkType": "mention",
        "dataSource": SOURCE_SLUG,
        "class": "refTopic",
        "is_sheet": False,
        "ref": ref.normal(),
        "expandedRefs": [ref.normal()],
        "charLevelData": {
            "startChar": match.start(),
            "endChar": match.end(),
            "versionTitle": version.versionTitle,
            "language": version.language,
            "text": match.group()
        }
    }
    try:
        RefTopicLink(link).save()
    except DuplicateRecordError as e:
        print(e)

def wrap_all():
    remove_ref_topic_links()
    mapping = get_normal_mapping()
    for t in TEXTS:
        create_topic_links_for_text(t, mapping)


def create_topic_links_for_text(text_name, mapping):

    # 1 Find all cases of << >>
    # 2 Pull contiguous phrases from overall match
    # 3 If anything in there matches a term - success
    # 4 record success, and remove << >>
    # 5 make a second pass finding final location of successes and creating links

    matches = TextMatches()

    vs = VersionSet({'title': text_name, 'language': 'en'})
    for v in vs:
        print(text_name)
        print(v.versionTitle)

        for ref in Ref(text_name).all_segment_refs():
            tc = ref.text("en", v.versionTitle)

            # Find and record all matching terms
            referrals = FULL_REG.findall(tc.text)
            if not referrals:
                continue
            for referral in referrals:
                for phrase in PHRASE_REG.findall(referral):
                    normal_term = normalize(phrase)
                    topic = mapping.get(normal_term)

                    # TODO: organize this by ref
                    if topic:
                        matches.add_match(ref, phrase, topic)
                    else:
                        print(f"No topic match for {referral} / {phrase}")

            # Remove the << >>
            tc.text = FULL_REG.sub(r"\1", tc.text)
            tc.save()

        for ref in matches.all_refs():
            oref = Ref(ref)
            tc = oref.text("en", v.versionTitle)
            for phrase, topic in matches.unique_for_ref(ref):
                for m in re.finditer(phrase, tc.text):
                    create_ref_topic_link(oref, topic, v, m)


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
wrap_all()
# dump_all()
# print(get_normal_mapping())