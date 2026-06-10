# -*- coding: utf-8 -*-

import csv, re, django, os
from collections import OrderedDict

django.setup()
from sefaria.model import *
from sefaria.model.abstract import SluggedAbstractMongoRecord
from sefaria.system.exceptions import DuplicateRecordError
from sefaria.helper.category import move_index_into, create_category

UID = 28
SOURCE_SLUG = "ashlag-glossary"
TEXTS = [
    # 'Peticha LeChokhmat HaKabbalah',
    "Petichah LeChokhmat HaKabbalah",
    'Introduction to Sulam Commentary',
    "Baal HaSulam's Preface to Zohar"
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
def replace_dots(s):
    return s.replace("Ḥ", "H").replace("ḥ", "h").replace("’", "'")


def normalize(s):
    return replace_dots(s).lower()


def find_angle_quotes(s):
    return FULL_REG.finditer(s)


def opening_tag_count(s):
    return len(re.findall(r"<\w+>", s))


def closing_tag_count(s):
    return len(re.findall(r"</\w+>", s))


def remove_tags(s):
    return re.sub(r"</?\w+>", "", s)


def get_ashlag_topics():
    return TopicSet({"properties.source": SOURCE_SLUG})


def get_normal_mapping():
    # Build mapping of normal forms to topics
    mapping = {}
    for topic in get_ashlag_topics():
        assert isinstance(topic, Topic)
        for t in topic.get_titles("en", with_disambiguation=False):
            mapping[normalize(t)] = topic
    return mapping


#####
# IMPORT
#####
def load_raw_from_sheet():
    f = os.getenv("KBDB")  # export KBDB='/Users/levisrael/Downloads/Background entries DATABASE - live - Background entries DATABASE - live.csv'
    with open(f, 'r') as csvfile:
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

    # save original descriptions, because the <<>> gets mangled by bleach
    orig_descs = {}

    # import from sheet
    for d in load_raw_from_sheet():
        t = build_topic_from_record(d)
        orig_desc = t.description["en"]
        t.save()
        orig_descs[t.slug] = orig_desc
        create_intra_topic_link(t.slug, category_topic.slug, "is-a", SOURCE_SLUG)

    interlink_topics(orig_descs)


def get_slug_from_record(d):
    slug_base = d.get("term english") or d.get("term translation")
    if slug_base is None:
        print(f"No slug for {d}")
    return SluggedAbstractMongoRecord.normalize_slug(slug_base)


def create_intra_topic_link(from_slug, to_slug, link_type, data_source_slug):
    link_json = {
        "class": "intraTopic",
        "fromTopic": from_slug,
        "toTopic": to_slug,
        "linkType": link_type,
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
    t.add_title(d.get("term english") or d.get("term translation"), "en", True, True)
    if d.get("term alternate"):
        for s in d.get("term alternate").split(","):
            t.add_title(s.strip(), "en")
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


# For each topic
#   Get its description
#       Record place of reference to other topics
#       Add to list of interlinks
# For reach topic
#   Rewrite descriptions, wrapping references
# Create an intratopic link for each pair


def interlink_topics(orig_descs):
    '''

    :return:
    '''

    mapping = get_normal_mapping()
    topic_pairs = set()

    for topix in get_ashlag_topics():
        from_slug = topix.slug

        def do_sub(m, group=0):
            rawmatch = m.group(group)
            norm = normalize(remove_tags(rawmatch))
            to_topic = mapping.get(norm)
            if to_topic:
                to_slug = to_topic.slug
                if to_slug != from_slug:
                    topic_pairs.add(frozenset([from_slug, to_slug]))
                    return f'<a href="/topics/{to_slug}" class="namedEntityLink" data-slug="{to_slug}">{rawmatch}</a>'
                else:
                    print(f"Reference to {norm} in it's own description")
            return m.group()

        def full_sub(m):
            full_result = do_sub(m, 1)
            if full_result != m.group():
                return full_result
            else:
                return PHRASE_REG.sub(do_sub, m.group(1))

        desc = orig_descs.get(topix.slug)  #getattr(topix, "description", {}).get("en")
        if not desc:
            continue

        new_desc = FULL_REG.sub(full_sub, desc)
        if new_desc != desc:
            topix.description["en"] = new_desc
            topix.save()

    for from_slug, to_slug in topic_pairs:
        create_intra_topic_link(from_slug, to_slug, "related-to", SOURCE_SLUG)


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
        "linkType": "about",
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
            old = tc.text

            # Find and record all matching terms
            for referral in FULL_REG.findall(tc.text):
                norm = normalize(remove_tags(referral))
                topix = mapping.get(norm)
                if topix:
                    matches.add_match(ref, referral, topix)
                    continue

                for sub in PHRASE_REG.findall(referral):
                    normal_sub = normalize(sub)
                    topix = mapping.get(normal_sub)
                    if topix:
                        matches.add_match(ref, sub, topix)

            # Remove the << >>
            tc.text = FULL_REG.sub(r"\1", tc.text)
            if tc.text != old:
                tc.save()

        for ref in matches.all_refs():
            oref = Ref(ref)
            tc = oref.text("en", v.versionTitle)
            for phrase, topic in matches.unique_for_ref(ref):
                for m in re.finditer(phrase, tc.text):
                    create_ref_topic_link(oref, topic, v, m)


#####
# Create Cat / Move Indexes
#####
def categorize():
    c = create_category(["Kabbalah", "Baal HaSulam"], "Baal HaSulam", "בעל הסולם", order=40)
    for t in TEXTS + ["Baal HaSulam's Introduction to Zohar", "Sulam on Zohar", "Kuntres Matan Torah"]:
        i = library.get_index(t)
        move_index_into(i, c)

def test_coverage():
    background_list = load_raw_from_sheet()
    english_terms = {normalize(d["term english"]) for d in background_list}
    term_translations = {normalize(d['term translation']) for d in background_list}
    term_alternates = {normalize(e.strip()) for d in background_list for e in d['term alternate'].split(",")}
    all_entries = english_terms | term_translations | term_alternates

    misses = set()
    for d in background_list:
        desc = d.get("english description")
        if not desc:
            print("No desc in " + d["term english"])
        else:
            for referral in FULL_REG.findall(desc):
                hit = False
                if normalize(remove_tags(referral)) in all_entries:
                    continue
                for phrase in PHRASE_REG.findall(referral):
                    if normalize(phrase) in all_entries:
                        hit = True
                if not hit:
                    misses.add(remove_tags(referral))

    print("Words unhandled in dictionary itself:")
    print(misses)

    all_unhandled = misses

    for t in TEXTS:
        r = Ref(t)
        misses = set()
        for line in r.text("en").ja().flatten_to_array():
            for referral in FULL_REG.findall(line):
                hit = False
                if normalize(remove_tags(referral)) in all_entries:
                    continue
                for phrase in PHRASE_REG.findall(referral):
                    if normalize(phrase) in all_entries:
                        hit = True
                if not hit:
                    misses.add(remove_tags(referral))

        print()
        print(f"Words unhandled in {t}:")
        print(misses)
        all_unhandled |= misses

    print()
    print("All Unhandled Words:")
    print(all_unhandled)


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
    print(background_list)

    for d in background_list:
        for s in find_angle_quotes(d["english description"]):
            print()
            print(s.group(1))


test_coverage()
build_all_topics()
wrap_all()
categorize()
# dump_all()
