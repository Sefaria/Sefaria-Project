import django, csv, json, re
django.setup()
from tqdm import tqdm
from collections import defaultdict
from sefaria.model import *
from sefaria.utils.util import titlecase
from sefaria.system.database import db

with open("../data/final_ref_topic_links.csv", 'r') as fin:
    cin = csv.DictReader(fin)
    ref_topic_links = list(cin)
with open("../data/edge_types.csv", 'r') as fin:
    cin = csv.DictReader(fin)
    edge_types = list(cin)
with open("../data/final_topics.json", 'r') as fin:
    topics = json.load(fin)
with open("../data/source_sheet_cats.csv", 'r') as fin:
    cin = csv.DictReader(fin)
    cat_replacer = {"Bible": "Tanakh"}
    fallback_sheet_cat_map = {}
    for row in cin:
        cat = cat_replacer.get(row['Cat'], row['Cat'])
        fallback_sheet_cat_map[row['Tag']] = cat


def do_topics():
    db.topics.drop()
    db.topics.create_index('slug')
    db.topics.create_index('isTopLevelDisplay')
    slug_to_sheet_map = defaultdict(list)
    term_to_slug_map = {}
    invalid_term_to_slug_map = {}
    for t in tqdm(topics, desc="topics"):
        titles = []
        title_set = set()
        if len(t.get('en_transliteration', '')) > 0:
            titles += [{
                'text': t['en_transliteration'],
                'lang': 'en',
                'primary': True,
                'transliteration': True
            }]
            title_set.add(t['en_transliteration'])
            if len(t.get('en', '')) > 0:
                titles += [{
                    'text': t['en'],
                    'lang': 'en'
                }]
                title_set.add(t['en'])
        elif len(t.get('en', '')) > 0:
            titles += [{
                'text': t['en'],
                'lang': 'en',
                'primary': True
            }]
            title_set.add(t['en'])
        if len(t.get('he', '')) > 0:
            titles += [{
                'text': t['he'],
                'lang': 'he',
                'primary': True
            }]
            title_set.add(t['he'])
        for alt_t in t.get('alt_en', []):
            titles += [{
                'text': alt_t,
                'lang': 'en'
            }]
            title_set.add(alt_t)
        for alt_t in t.get('alt_he', []):
            titles += [{
                'text': alt_t,
                'lang': 'he'
            }]
            title_set.add(alt_t)

        # sheet titles
        valid_terms = []
        invalid_terms = []
        for sheet_tag in t.get('source_sheet_tags', []):
            term = Term().load({"name": sheet_tag})
            if term is None:
                term = Term().load_by_title(sheet_tag)
                if term is None:
                    # apparently not all tags have terms
                    invalid_terms += [sheet_tag]
                    continue
            valid_terms += [term.name]
            for title in term.titles:
                if title['text'] not in title_set:
                    titles += [{
                        'text': title['text'],
                        'lang': title['lang']
                    }]
        main_en = None
        for title in titles:
            if title['lang'] == 'en' and title['primary']:
                main_en = title['text']
                break
        if main_en is None:
            print("No main english for", t['id'])
            continue

        # ids
        alt_ids = {'_temp_id': t['id']}
        if len(t.get('bfo_id', '')) > 0:
            alt_ids['bfo'] = re.findall(r'/([^/]+)$', t['bfo_id'])[0]

        if len(t.get('wikidata_id', '')) > 0:
            alt_ids['wikidata'] = t['wikidata_id']

        attrs = {"slug": main_en, "titles": titles}
        if len(alt_ids) > 0:
            attrs['alt_ids'] = alt_ids

        props = ['heWikiLink', 'enWikiLink', 'jeLink', 'generation']
        final_props = {}
        for prop in props:
            if len(t.get(prop, '')) > 0:
                final_props[prop] = {
                    "value": t[prop],
                    "dataSource": "talmudic-people"
                }
        if len(final_props) > 0:
            attrs['properties'] = final_props

        if len(t.get('description', '')) > 0:
            attrs['description'] = {
                'en': t['description'],
                'he': None
            }
        ot = Topic(attrs)
        ot.save()
        for sheet_tag in t.get('source_sheet_tags', []):
            for sheet in db.sheets.find({"tags": sheet_tag}):
                slug_to_sheet_map[ot.slug] += [sheet['id']]
        for term_name in valid_terms:
            term_to_slug_map[term_name] = ot.slug
        for tag in invalid_terms:
            invalid_term_to_slug_map[tag] = ot.slug

    # look up {scheme: "Tag Category"}.order
    # displays-under links
    for top_toc in TermSet({"scheme": "Tag Category"}):
        attrs = {
            "slug": top_toc.name,
            "alt_ids": {'_temp_id': 'TOC|{}'.format(top_toc.name)},
            "titles": top_toc.titles,
            "isTopLevelDisplay": True,
            "displayOrder": top_toc.order
        }
        ot = Topic(attrs)
        ot.save()
    return slug_to_sheet_map, term_to_slug_map, invalid_term_to_slug_map


def do_topic_link_types():
    db.topic_link_types.drop()
    for edge_type in edge_types:
        if len(edge_type["Edge Inverse"]) == 0:
            continue
        attrs = {
            'slug': edge_type['Edge'],
            'inverseSlug': edge_type['Edge Inverse'],
            'displayName': {
                'en': titlecase(edge_type['Edge']),
                'he': titlecase(edge_type['Edge'])
            },
            'inverseDisplayName': {
                'en': titlecase(edge_type['Edge Inverse']),
                'he': titlecase(edge_type['Edge Inverse'])
            },
            'shouldDisplay': True
        }
        if len(edge_type["BFO ID"]) > 0:
            attrs['alt_ids'] = {"bfo": re.findall(r'/([^/]+)$', edge_type["BFO ID"])[0]}
            attrs['inverse_alt_ids'] = {"bfo": re.findall(r'/([^/]+)$', edge_type["Inverse BFO ID"])[0]}

        tlt = TopicLinkType(attrs)
        tlt.save()
    tlt = TopicLinkType({
        "slug": "about",
        "inverseSlug": "has-about",
        "displayName": {
            "en": "About",
            "he": "About"
        },
        "inverseDisplayName": {
            "en": "Has About",
            "he": "Has About"
        },
        "shouldDisplay": True
    })
    tlt.save()
    tlt = TopicLinkType({
        "slug": "displays-under",
        "inverseSlug": "displays-above",
        "displayName": {
            "en": "Displays Under",
            "he": "Displays Under"
        },
        "inverseDisplayName": {
            "en": "Displays Above",
            "he": "Displays Above"
        },
        "shouldDisplay": False
    })
    tlt.save()


def do_data_source():
    db.topic_data_sources.drop()
    data_sources = [
        {
            "slug": "talmudic-people",
            "displayName": "Talmudic People"
        },
        {
            "slug": "sefer-haagada",
            "displayName": "Sefer Haagada"
        },
        {
            "slug": "aspaklaria",
            "displayName": "Aspaklaria"
        },
        {
            "slug": "aspaklria-edited-by-sefaria",
            "displayName": "Aspaklaria-edited-by-Sefaria"
        },
        {
            "slug": "sefaria-users",
            "displayName": "Sefaria Users"
        },
        {
            "slug": "sefaria",
            "displayName": "Sefaria"
        }
    ]
    for d in data_sources:
        tds = TopicDataSource(d)
        tds.save()


def do_intra_topic_link(term_to_slug_map, invalid_term_to_slug_map):
    # edge_inverses = set()
    # for edge_type in edge_types:
    #     if len(edge_type["Edge Inverse"]) == 0:
    #         continue
    #     edge_inverses.add(edge_type['Edge Inverse'])
    # for t in tqdm(topics, desc="intraTopic links"):
    #     topic = Topic().load({"alt_ids._temp_id": t['id']})
    #     for edge_type, to_topic_list in t.get('edges', {}).items():
    #         if edge_type in edge_inverses:
    #             continue
    #         linkType = TopicLinkType().load({"slug": edge_type.replace(' ', '-')})
    #         for to_topic_id in to_topic_list:
    #             to_topic = Topic().load({"alt_ids._temp_id": to_topic_id})
    #             if to_topic is None:
    #                 # print(to_topic_id)
    #                 continue
    #             tl = IntraTopicLink({
    #                 "class": "intraTopic",
    #                 "fromTopic": topic.slug,
    #                 "toTopic": to_topic.slug,
    #                 "linkType": linkType.slug,
    #                 "dataSource": "aspaklria-edited-by-sefaria"
    #             })
    #             tl.save()

    # displays-under links
    for top_term in tqdm(TermSet({"scheme": "Tag Category"}), desc="valid intraTopic terms"):
        top_topic = Topic().load({"alt_ids._temp_id": "TOC|{}".format(top_term.name)})
        for sub_term in TermSet({"category": top_term.name}):
            try:
                from_slug = term_to_slug_map[sub_term.name]
            except KeyError:
                print("No term slug mapping", sub_term.name)
                continue
            tl = IntraTopicLink().load({
                "class": "intraTopic",
                "fromTopic": from_slug,
                "toTopic": top_topic.slug
            })
            if tl is None:
                tl = IntraTopicLink({
                    "class": "intraTopic",
                    "fromTopic": from_slug,
                    "toTopic": top_topic.slug,
                    "linkType": 'displays-under',
                    "dataSource": "sefaria"
                })
                tl.save()
    for invalid_term, from_slug in tqdm(invalid_term_to_slug_map.items(), desc="invalid intraTopic terms"):
        top_topic = Topic().load({"alt_ids._temp_id": "TOC|{}".format(fallback_sheet_cat_map[invalid_term])})
        if top_topic is None:
            print("Top Topic Fallback is None", invalid_term, fallback_sheet_cat_map[invalid_term])
            continue
        tl = IntraTopicLink().load({
            "class": "intraTopic",
            "fromTopic": from_slug,
            "toTopic": top_topic.slug
        })
        if tl is None:
            tl = IntraTopicLink({
                "class": "intraTopic",
                "fromTopic": from_slug,
                "toTopic": top_topic.slug,
                "linkType": 'displays-under',
                "dataSource": "sefaria"
            })
            tl.save()


def do_ref_topic_link(slug_to_sheet_map):
    for l in tqdm(ref_topic_links, desc="refTopic links"):
        to_topic = Topic().load({"alt_ids._temp_id": l["Topic"]})
        if to_topic is None:
            print(l["Ref"], l["Topic"])
            continue
        dataSource = None
        if len(l.get("Source", '')) > 0:
            dataSource = TopicDataSource().load({"slug": l['Source']})
            if dataSource is None:
                print('Source', l['Source'])
                continue
        attrs = {
            "class": "refTopic",
            "toTopic": to_topic.slug,
            "ref": l["Ref"],
            "expandedRefs": [r.normal() for r in Ref(l["Ref"]).range_list()],
            "linkType": "about",
            "is_sheet": False
        }
        if dataSource is not None:
            attrs["dataSource"] = dataSource.slug
        tl = RefTopicLink(attrs)
        tl.save()
    for slug, sheet_id_list in tqdm(slug_to_sheet_map.items(), desc="refTopic sheet links"):
        to_topic = Topic().load({"slug": slug})
        for sheet_id in sheet_id_list:
            attrs = {
                "class": "refTopic",
                "toTopic": to_topic.slug,
                "ref": "Sheet {}".format(sheet_id),
                "expandedRefs": ["Sheet {}".format(sheet_id)],
                "linkType": "about",
                "is_sheet": True,
                "dataSource": "sefaria-users"
            }
            tl = RefTopicLink(attrs)
            tl.save()


def clean_up_time():
    for t in tqdm(TopicSet(), desc="clean up", total=5898):
        if getattr(t, 'alt_ids', None):
            alt_ids = getattr(t, 'alt_ids')
            del alt_ids['_temp_id']
            if len(alt_ids) == 0:
                delattr(t, 'alt_ids')
            else:
                setattr(t, 'alt_ids', alt_ids)
            t.save()


if __name__ == '__main__':
    slug_to_sheet_map, term_to_slug_map, invalid_term_to_slug_map = do_topics()
    do_topic_link_types()
    # do_data_source()
    # db.topic_links.drop()
    # db.topic_links.create_index('class')
    # db.topic_links.create_index('expandedRefs')
    # db.topic_links.create_index('toTopic')
    # db.topic_links.create_index('fromTopic')
    do_intra_topic_link(term_to_slug_map, invalid_term_to_slug_map)
    # do_ref_topic_link(slug_to_sheet_map)
    # clean_up_time()

# TODO Halcha is not Halakha
# TODO consider how to dedup TOC nodes

