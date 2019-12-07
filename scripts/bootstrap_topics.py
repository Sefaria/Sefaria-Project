import django, csv, json, re
django.setup()
from tqdm import tqdm
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


def do_topics():
    db.topics.drop()
    for t in tqdm(topics):
        titles = []
        if len(t.get('en_transliteration', '')) > 0:
            titles += [{
                'text': t['en_transliteration'],
                'lang': 'en',
                'primary': True
            }]
            if len(t.get('en', '')) > 0:
                titles += [{
                    'text': t['en'],
                    'lang': 'en'
                }]
        elif len(t.get('en', '')) > 0:
            titles += [{
                'text': t['en'],
                'lang': 'en',
                'primary': True
            }]
        if len(t.get('he', '')) > 0:
            titles += [{
                'text': t['he'],
                'lang': 'he',
                'primary': True
            }]
        for alt_t in t.get('alt_en', []):
            titles += [{
                'text': alt_t,
                'lang': 'en'
            }]
        for alt_t in t.get('alt_he', []):
            titles += [{
                'text': alt_t,
                'lang': 'he'
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


def do_topic_link_types():
    db.topic_link_types.drop()
    for edge_type in edge_types:
        if len(edge_type["Edge Inverse"]) == 0:
            continue
        attrs = {
            'slug': edge_type['Edge'],
            'displayName': titlecase(edge_type['Edge']),
            'inverseDisplayName': titlecase(edge_type['Edge Inverse']),
            'shouldDisplay': True
        }
        if len(edge_type["BFO ID"]) > 0:
            attrs['alt_ids'] = {"bfo": re.findall(r'/([^/]+)$', edge_type["BFO ID"])[0]}
            attrs['inverse_alt_ids'] = {"bfo": re.findall(r'/([^/]+)$', edge_type["Inverse BFO ID"])[0]}

        tlt = TopicLinkType(attrs)
        tlt.save()
    tlt = TopicLinkType({
        "slug": "about",
        "displayName": "About",
        "inverseDisplayName": "Has About",
        "shouldDisplay": True
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
            "slug": "aspaklria-edited-by-Sefaria",
            "displayName": "Aspaklaria-edited-by-Sefaria"
        }
    ]
    for d in data_sources:
        tds = TopicDataSource(d)
        tds.save()


def do_intra_topic_link():
    edge_inverses = set()
    for edge_type in edge_types:
        if len(edge_type["Edge Inverse"]) == 0:
            continue
        edge_inverses.add(edge_type['Edge Inverse'])
    for t in tqdm(topics):
        topic = Topic().load({"alt_ids._temp_id": t['id']})
        for edge_type, to_topic_list in t.get('edges', {}).items():
            if edge_type in edge_inverses:
                continue
            linkType = TopicLinkType().load({"slug": edge_type.replace(' ', '-')})
            for to_topic_id in to_topic_list:
                to_topic = Topic().load({"alt_ids._temp_id": to_topic_id})
                if to_topic is None:
                    print(to_topic_id)
                    continue
                tl = IntraTopicLink({
                    "fromTopic": topic.slug,
                    "toTopic": to_topic.slug,
                    "linkType": linkType.slug,
                    "dataSource": "aspaklria-edited-by-Sefaria"
                })
                tl.save()


def do_ref_topic_link():
    for l in tqdm(ref_topic_links):
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
            "toTopic": to_topic.slug,
            "ref": l["Ref"],
            "expandedRefs": [r.normal() for r in Ref(l["Ref"]).range_list()],
            "linkType": "about"
        }
        if dataSource is not None:
            attrs["dataSource"] = dataSource.slug
        tl = RefTopicLink(attrs)
        tl.save()

if __name__ == '__main__':
    # do_topics()
    # do_topic_link_types()
    # do_data_source()
    # db.topic_links.drop()
    # do_intra_topic_link()
    # do_ref_topic_link()
    r = Ref("Shabbat 90b:7-96a:3")
    from collections import defaultdict
    topics_count = defaultdict(list)
    for rr in tqdm(r.range_list()):
        links = RefTopicLinkSet({"expandedRefs": rr.normal()})
        for l in links:
            topics_count[l.toTopic] += [l.ref]
    sorted_topics_count = sorted(topics_count.items(), key=lambda x: len(x[1]), reverse=True)
    for t, ref_list in sorted_topics_count:
        print('{}\t{}'.format(t, len(ref_list)))


# TODO remove whitespace from topic names
# TODO anger123? probably error in slug creation
# TODO hatreddislike? probably convert / to -
# TODO add transliteration bool to titles
