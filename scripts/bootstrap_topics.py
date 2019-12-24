import django, csv, json, re
django.setup()
from tqdm import tqdm
from collections import defaultdict
from pymongo.errors import AutoReconnect
from sefaria.model import *
from sefaria.utils.util import titlecase
from sefaria.system.database import db
from sefaria.helper.topic import generate_topic_links_from_sheets, update_link_orders, calculate_mean_tfidf

with open("data/final_ref_topic_links.csv", 'r') as fin:
    cin = csv.DictReader(fin)
    ref_topic_links = list(cin)
with open("data/edge_types.csv", 'r') as fin:
    cin = csv.DictReader(fin)
    edge_types = list(cin)
with open("data/final_topics.json", 'r') as fin:
    topics = json.load(fin)
with open("data/source_sheet_cats.csv", 'r') as fin:
    cin = csv.DictReader(fin)
    cat_replacer = {"Bible": "Tanakh"}
    fallback_sheet_cat_map = {}
    for row in cin:
        cat = cat_replacer.get(row['Cat'], row['Cat'])
        fallback_sheet_cat_map[row['Tag']] = cat


def autoreconnect_query(collection=None, query=None, proj=None, tries=0):
    if collection:
        try:
            return [d for d in getattr(db, collection).find(query, proj)]
        except AutoReconnect:
            if tries < 10:
                return autoreconnect_query(collection=collection, query=query, proj=proj, tries=tries+1)
            else:
                print("Tried 10 times")
                raise AutoReconnect


def do_topics(dry_run=False):
    if not dry_run:
        db.topics.drop()
        db.topics.create_index('slug')
        db.topics.create_index('isTopLevelDisplay')
    slug_to_sheet_map = defaultdict(list)
    tag_to_slug_map = {}
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
            term_prime_titles = {
                "en": term.get_primary_title('en'),
                "he": term.get_primary_title('he')
            }
            titles += list(filter(lambda x: x['text'] not in title_set, term.titles))
            for title in titles:
                if title.get('primary', False) and title['text'] != term_prime_titles[title['lang']] and len(term_prime_titles[title['lang']]) > 0:
                    # remove primary status from existing title
                    del title['primary']
                elif not title.get('primary', False) and title['text'] == term_prime_titles[title['lang']]:
                    title['primary'] = True
                if title['text'] not in title_set:
                    title['fromSheet'] = True
        # remove duplicate titles
        title_tup_dict = {}
        for title in titles:
            title_key = (title['text'], title['lang'], title.get('primary', False))
            if title_key not in title_tup_dict:
                title_tup_dict[title_key] = title
        titles = list(title_tup_dict.values())

        # remove "A ..." from topic names
        for title in titles:
            if title['lang'] == 'en' and re.match(r'An? [A-Za-z\'"]', title['text']):
                title['text'] = re.sub(r'^An? ', '', title['text'])

        # validate there's exactly one primary title per language
        primaries = {"prim_en": 0, "prim_he": 0, "he": 0, "en": 0}
        for title in titles:
            primaries[title['lang']] += 1
            if title.get('primary', False):
                primaries["prim_" + title['lang']] +=1
        if primaries['he'] > 0 and primaries['prim_he'] != 1:
            print("{} he primaries for {}".format(primaries['prim_he'], t['id']))
        if primaries['en'] > 0 and primaries['prim_en'] != 1:
            print("{} en primaries for {}".format(primaries['prim_en'], t['id']))
        main_en = None
        for title in titles:
            if title['lang'] == 'en' and title.get('primary', False):
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
        if dry_run:
            ot = Topic().load({"alt_ids._temp_id": t['id']})
        else:
            ot = Topic(attrs)
            ot.save()
        for sheet_tag in t.get('source_sheet_tags', []):
            temp_sheets = autoreconnect_query('sheets', {"tags": sheet_tag})
            for sheet in temp_sheets:
                slug_to_sheet_map[ot.slug] += [sheet['id']]
            if tag_to_slug_map.get(sheet_tag, False) and ot.slug != tag_to_slug_map[sheet_tag]:
                print("TAG TO SLUG ALREADY EXISTS!!!", sheet_tag, ot.slug, tag_to_slug_map[sheet_tag])
            term = Term().load_by_title(sheet_tag)
            term_titles = [sheet_tag] if term is None else [term_title['text'] for term_title in term.titles]
            for term_title in term_titles:
                tag_to_slug_map[term_title] = ot.slug
        for term_name in valid_terms:
            term_to_slug_map[term_name] = ot.slug
        for tag in invalid_terms:
            invalid_term_to_slug_map[tag] = ot.slug

    # look up {scheme: "Tag Category"}.order
    # displays-under links
    top_toc_dedupper = {
        "Philosophy": "philosophy",
        "Tanakh": "the-holy-books-bible",
        "Prayer": "liturgy",
        "Food": "food",
        "Israel": "israel",
        "Language": "language",
        "Education": "education",
        "Art": "artistic-process",
        "History": "historical-event",
        "Calendar": "calendar",
        "Science": "science",
        "Medicine": "healing",
        "Religion": "theology",
        "Folklore": "aggadah",
        "Geography": "geographic-site",
        "Law": "law",
        "Texts": "source",
        "Torah Portions": "parasha"
    }
    for top_toc in TermSet({"scheme": "Tag Category"}):
        attrs = {
            "slug": top_toc.name,
            "alt_ids": {'_temp_toc_id': top_toc.name},
            "titles": top_toc.titles,
            "isTopLevelDisplay": True,
            "displayOrder": top_toc.order
        }
        dedup_slug = top_toc_dedupper.get(top_toc.name, False)
        if dedup_slug:
            ot = Topic().load({"slug": dedup_slug})
            if ot is None:
                print("Dedup Slug is None", dedup_slug, top_toc.name)
                continue
            for t in ot.titles:
                if t.get('primary', False):
                    del t['primary']
            ot.titles = attrs['titles'] + ot.titles
            ot.alt_ids['_temp_toc_id'] = top_toc.name
            setattr(ot, 'isTopLevelDisplay', True)
            setattr(ot, 'displayOrder', attrs['displayOrder'])
        else:
            ot = Topic(attrs)
        if not dry_run:
            ot.save()
    # Uncategorized topic
    ot = Topic({
        "slug": "_uncategorized",
        "titles": [{
            "text": "_Uncategorized",
            "lang": "en",
            "primary": True,
        },{
            "text": "_Uncategorized",
            "lang": "he",
            "primary": True,
        }]
    })
    if not dry_run:
        ot.save()
    return slug_to_sheet_map, term_to_slug_map, invalid_term_to_slug_map, tag_to_slug_map


def do_topic_link_types():
    db.topic_link_types.drop()
    for edge_type in edge_types:
        if len(edge_type["Edge Inverse"]) == 0:
            continue
        attrs = {
            'slug': edge_type['Edge'],
            'inverseSlug': edge_type['Edge Inverse'].replace(' ', '-'),
            'displayName': {
                'en': edge_type['en name'],
                'he': edge_type['he name']
            },
            'inverseDisplayName': {
                'en': edge_type['inverse en name'],
                'he': edge_type['inverse he name']
            },
            'shouldDisplay': len(edge_type['display']) > 0,
            'inverseShouldDisplay': len(edge_type['inverse display']) > 0
        }
        if len(edge_type['Valid From']) > 0:
            attrs['validFrom'] = edge_type['Valid From'].split('|')
        if len(edge_type['Valid To']) > 0:
            attrs['validTo'] = edge_type['Valid To'].split('|')

        if len(edge_type['plural en name']) > 0:
            attrs['pluralDisplayName'] = {
                'en': edge_type['plural en name'],
                'he': edge_type['plural he name']
            }
        if len(edge_type['inverse plural en name']) > 0:
            attrs['inversePluralDisplayName'] = {
                'en': edge_type['inverse plural en name'],
                'he': edge_type['inverse plural he name']
            }
        if len(edge_type['group related']) > 0:
            attrs['groupRelated'] = True
        if len(edge_type['inverse group related']) > 0:
            attrs['inverseGroupRelated'] = True

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
        "shouldDisplay": True,
        "inverseShouldDisplay": True
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
        "shouldDisplay": False,
        "inverseShouldDisplay": False
    })
    tlt.save()
    tlt = TopicLinkType({
        "slug": "sheets-related-to",
        "inverseSlug": "sheets-related-to",
        "displayName": {
            "en": "Related By Sheets",
            "he": "Related By Sheets"
        },
        "inverseDisplayName": {
            "en": "Related By Sheets",
            "he": "Related By Sheets"
        },
        "shouldDisplay": True,
        "inverseShouldDisplay": True
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
    edge_inverses = set()
    for edge_type in edge_types:
        # don't exclude bi-directional edges!
        if len(edge_type["Edge Inverse"]) == 0 or edge_type["Edge Inverse"] == edge_type["Edge"]:
            continue
        edge_inverses.add(edge_type['Edge Inverse'])
    for t in tqdm(topics, desc="intraTopic links"):
        topic = Topic().load({"alt_ids._temp_id": t['id']})
        if topic is None:
            print("Intra topic link topic is None: {}".format(t['id']))
            continue
        for edge_type, to_topic_list in t.get('edges', {}).items():
            if edge_type in edge_inverses:
                continue
            linkType = TopicLinkType().load({"slug": edge_type.replace(' ', '-')})
            for to_topic_id in to_topic_list:
                to_topic = Topic().load({"alt_ids._temp_id": to_topic_id})
                if to_topic is None:
                    # print(to_topic_id)
                    continue
                tl = IntraTopicLink({
                    "class": "intraTopic",
                    "fromTopic": topic.slug,
                    "toTopic": to_topic.slug,
                    "linkType": linkType.slug,
                    "dataSource": "aspaklria-edited-by-sefaria"
                })
                tl.save()

    # displays-under links
    for top_term in tqdm(TermSet({"scheme": "Tag Category"}), desc="valid intraTopic terms"):
        top_topic = Topic().load({"alt_ids._temp_toc_id": top_term.name})
        if top_topic is None:
            print("Top Term is None!!", top_term.name)  # Prayer
            continue
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
        top_topic = Topic().load({"alt_ids._temp_toc_id": fallback_sheet_cat_map[invalid_term]})
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


def do_sheet_refactor(tag_to_slug_map):
    from sefaria.utils.hebrew import is_hebrew
    IntraTopicLinkSet({"toTopic": "_uncategorized"}).delete()
    sheets = autoreconnect_query('sheets', {}, {"tags": 1, "id": 1})
    uncategorized_dict = {}
    for s in tqdm(sheets, desc="sheet refactor"):
        tags = s.get("tags", [])
        if len(tags) == 0:
            continue
        sheet_topics = []
        for t in tags:
            if t in tag_to_slug_map:
                topic_slug = tag_to_slug_map[t]
            else:
                # uncategorized
                term = Term().load_by_title(t)
                titles = term.titles if term else [{"lang": "he" if is_hebrew(t) else "en", "text": t, "primary": True}]
                if t in uncategorized_dict:
                    topic_slug = uncategorized_dict[t]
                else:
                    topic = Topic({"slug": t, "titles": titles})
                    topic.save()
                    topic_slug = topic.slug
                    itl = IntraTopicLink({
                        "fromTopic": topic_slug,
                        "toTopic": "_uncategorized",
                        "linkType": "is-a",
                        "class": "intraTopic"
                    })
                    itl.save()
                    uncategorized_dict[t] = topic_slug

            sheet_topics += [{"slug": topic_slug, "asTyped": t}]
        db.sheets.update_one({"id": s['id']}, {"$set": {"topics": sheet_topics}})


def clean_up_time():
    for t in tqdm(TopicSet(), desc="clean up", total=5898):
        if getattr(t, 'alt_ids', None):
            alt_ids = getattr(t, 'alt_ids')
            del alt_ids['_temp_id']
            try:
                del alt_ids['_temp_toc_id']
            except KeyError:
                pass
            if len(alt_ids) == 0:
                delattr(t, 'alt_ids')
            else:
                setattr(t, 'alt_ids', alt_ids)
            t.save()


def set_term_descriptions(topic, en, he, itls):
    term = Term().load_by_title(topic)
    if not term:
        print("No {}".format(topic))
        return
    ts = [t for t in TopicSet({"titles.text": topic}) if t.slug not in itls]
    if len(ts) != 1:
        print("{} topics matched for {}: {}".format(len(ts), topic, ', '.join([t.slug for t in ts])))
        return
    t = ts[0]
    if getattr(t, 'description', None):
        print("Description already exists for {}".format(t.slug))
        print(t.description['en'])
    t.description = {
        "en": en,
        "he": he
    }
    # print u"{}, {}, {}".format(topic,en,he)
    t.save()


def import_term_descriptions():
    itls = {l.fromTopic for l in IntraTopicLinkSet({"linkType": "is-a", "toTopic": "_uncategorized"})}

    holidays_filename = 'data/Topic Descriptions - Holidays.tsv'
    parshiot_filename = 'data/Topic Descriptions - Parshiyot.tsv'

    # HOLIDAYS
    # 0 Category
    # 1 Topic
    # 2 Copy
    # 3 Hebrew Copy

    # PARSHIYOT
    # 0 Topic
    # 1 Copy
    # 2 Hebrew Copy
    with open(holidays_filename) as tsvfile:
        next(tsvfile)
        next(tsvfile)
        reader = csv.reader(tsvfile, delimiter='\t')
        for row in reader:
            set_term_descriptions(row[1], row[2], row[3], itls)

    with open(parshiot_filename) as tsvfile:
        next(tsvfile)
        next(tsvfile)
        reader = csv.reader(tsvfile, delimiter='\t')
        for row in reader:
            set_term_descriptions(row[0], row[1], row[2], itls)


if __name__ == '__main__':
    slug_to_sheet_map, term_to_slug_map, invalid_term_to_slug_map, tag_to_slug_map = do_topics(dry_run=False)
    do_topic_link_types()
    do_data_source()
    db.topic_links.drop()
    db.topic_links.create_index('class')
    db.topic_links.create_index('expandedRefs')
    db.topic_links.create_index('toTopic')
    db.topic_links.create_index('fromTopic')
    do_intra_topic_link(term_to_slug_map, invalid_term_to_slug_map)
    do_ref_topic_link(slug_to_sheet_map)
    do_sheet_refactor(tag_to_slug_map)
    generate_topic_links_from_sheets()
    update_link_orders()
    import_term_descriptions()

    # clean_up_time()

# TODO Halacha is not Halakha
# TODO refactor sheets to hold topics
# TODO add class automattically to intratopiclinks
# TODO is `is category` being applied from Aspaklaria sheet?

"""
potential things we should fix
- make transliterations in italics
- figure out how to disambiguate topic names (Food, Food)
- make "more" button for link types that have many items
- decide which topics are invisible from side bar
- translate link types. Both en and he. En needs to decide what will make sense to users. could be some link types will be collapsed for users
- translate all topics that dont have he (mostly top level topics that won't be invisible)
- decide sort order for sheets and sources (sources can simply be ref order)
- pagination!
- change TOC
  - Authors -> People
  - Religion -> Theology
  - Folklore -> maybe something with less of a strong connotation. I feel like this implies it's not true

why is {toTopic: "stingy", class: "refTopic", ref: /^Pesik/} the highest?
how does it have such a high mean tfidf?

why does /insistence-or-exactitude not have any sources? there are sources in aspaklaria

Rename 'intention' to 'purpose'/'תכלית'
"""

