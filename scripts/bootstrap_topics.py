import django, csv, json, re
from tqdm import tqdm
from collections import defaultdict
from pymongo.errors import AutoReconnect
from sefaria.model import *
from sefaria.utils.util import titlecase
from sefaria.system.database import db
from sefaria.helper.topic import generate_all_topic_links_from_sheets, update_ref_topic_link_orders, update_intra_topic_link_orders, add_num_sources_to_topics
from sefaria.system.exceptions import DuplicateRecordError
from sefaria.utils.tibetan import has_tibetan
from sefaria.model.abstract import SluggedAbstractMongoRecord
from pymongo import UpdateOne, DeleteOne

django.setup()

# with open("data/final_ref_topic_links.csv", 'r') as fin:
#     cin = csv.DictReader(fin)
#     ref_topic_links = list(cin)
# with open("data/edge_types.csv", 'r') as fin:
#     cin = csv.DictReader(fin)
#     edge_types = list(cin)
# with open("data/final_topics.json", 'r') as fin:
#     topics = json.load(fin)
# with open("data/source_sheet_cats.csv", 'r') as fin:
#     cin = csv.DictReader(fin)
#     cat_replacer = {"Bible": "Tanakh"}
#     fallback_sheet_cat_map = {}
#     for row in cin:
#         cat = cat_replacer.get(row['Cat'], row['Cat'])
#         fallback_sheet_cat_map[row['Tag']] = cat


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
                    title['fromTerm'] = True
        # remove duplicate titles
        title_tup_dict = {}
        for title in titles:
            title_key = (title['text'], title['lang'], title.get('primary', False))
            if title_key not in title_tup_dict:
                title_tup_dict[title_key] = title
        titles = list(title_tup_dict.values())

        # remove "A ..." from topic names
        # for title in titles:
        #     if title['lang'] == 'en' and re.match(r'An? [A-Za-z\'"]', title['text']):
        #         title['text'] = re.sub(r'^An? ', '', title['text'])
        for title in titles:
            title['text'] = title['text'].strip()

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
        "Tanakh": "holy-books",
        "Prayer": "prayer",
        "Food": "food",
        "Israel": "israel",
        "Language": "language",
        "Education": "jewish-education",
        "Art": "artistic-process",
        "History": "history",
        "Calendar": "calendar",
        "Science": "science",
        "Medicine": "healing",
        "Religion": "theology",
        "Folklore": "aggadah",
        "Geography": "geographic-locations",
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
            ot = Topic.init(dedup_slug)
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
        "slug": Topic.uncategorized_topic,
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
            "en": "Has Related By Sheets",
            "he": "Has Related By Sheets"
        },
        "shouldDisplay": True,
        "groupRelated": True,
        "inverseShouldDisplay": False
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
            "slug": "aspaklaria-edited-by-sefaria",
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

    # IS A links first so that validation will work on second pass
    for t in tqdm(topics, desc="intraTopic links is-a"):
        topic = Topic().load({"alt_ids._temp_id": t['id']})
        if topic is None:
            print("Intra topic link topic is None: {}".format(t['id']))
            continue
        for edge_type, to_topic_list in t.get('edges', {}).items():
            if edge_type in edge_inverses or edge_type != 'is a':
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
                    "dataSource": "aspaklaria-edited-by-sefaria"
                })
                tl.save()
    num_invalid_links = 0
    for t in tqdm(topics, desc="intraTopic links is-not-a"):
        topic = Topic().load({"alt_ids._temp_id": t['id']})
        if topic is None:
            print("Intra topic link topic is None: {}".format(t['id']))
            continue
        for edge_type, to_topic_list in t.get('edges', {}).items():
            if edge_type in edge_inverses or edge_type == 'is a':
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
                    "dataSource": "aspaklaria-edited-by-sefaria"
                })
                try:
                    tl.save()
                except AssertionError:
                    num_invalid_links += 1
                    tl.linkType = TopicLinkType.related_type
                    try:
                        tl.save()
                    except DuplicateRecordError as e:
                        print(e)
                except DuplicateRecordError as e:
                    print(e)
    print("Num invalid links fixed: {}".format(num_invalid_links))

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
                "linkType": "displays-under",
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
            else:
                print("TL good", from_slug, "->", top_topic.slug)

    for invalid_term, from_slug in tqdm(invalid_term_to_slug_map.items(), desc="invalid intraTopic terms"):
        top_topic = Topic().load({"alt_ids._temp_toc_id": fallback_sheet_cat_map[invalid_term]})
        if top_topic is None:
            print("Top Topic Fallback is None", invalid_term, fallback_sheet_cat_map[invalid_term])
            continue
        tl = IntraTopicLink().load({
            "class": "intraTopic",
            "linkType": "displays-under",
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
        else:
            print("TL", from_slug, "->", top_topic.slug)


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
            "expandedRefs": [r.normal() for r in Ref(l["Ref"]).all_segment_refs()],
            "linkType": "about",
            "is_sheet": False
        }
        if dataSource is not None:
            attrs["dataSource"] = dataSource.slug
        tl = RefTopicLink(attrs)
        try:
            tl.save()
        except DuplicateRecordError:
            pass
    for slug, sheet_id_list in tqdm(slug_to_sheet_map.items(), desc="refTopic sheet links"):
        to_topic = Topic.init(slug)
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
            try:
                tl.save()
            except DuplicateRecordError:
                pass


def do_sheet_refactor(tag_to_slug_map):
    IntraTopicLinkSet({"toTopic": Topic.uncategorized_topic}).delete()
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
                titles = term.titles if term else [{"lang": "he" if has_tibetan(t) else "en", "text": t, "primary": True}]
                if t in uncategorized_dict:
                    topic_slug = uncategorized_dict[t]
                else:
                    topic = Topic({"slug": t, "titles": titles})
                    topic.save()
                    topic_slug = topic.slug
                    itl = IntraTopicLink({
                        "fromTopic": topic_slug,
                        "toTopic": Topic.uncategorized_topic,
                        "linkType": "is-a",
                        "class": "intraTopic",
                        "dataSource": "sefaria"
                    })
                    try:
                        itl.save()
                    except DuplicateRecordError as e:
                        print(e)
                    uncategorized_dict[t] = topic_slug

                # ref topic link wasn't created for uncategorized topics
                rtl = RefTopicLink({
                    "class": "refTopic",
                    "toTopic": topic_slug,
                    "ref": "Sheet {}".format(s['id']),
                    "expandedRefs": ["Sheet {}".format(s['id'])],
                    "linkType": "about",
                    "is_sheet": True,
                    "dataSource": "sefaria-users"
                })
                try:
                    rtl.save()
                except DuplicateRecordError:
                    pass
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
    itls = {l.fromTopic for l in IntraTopicLinkSet({"linkType": "is-a", "toTopic": Topic.uncategorized_topic})}

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
    """
    topics to create
    Halloween
    Taanit Esther
    Yom Hashoah

    no term
    Rabbinic Holiday
    Yom Haatzmaut
    Yom Yerushalayim
    Taanit Bekhorot
    Yom HaZikaron
    Sigd

    ambig
    Fast Day: fasting, fast-day
    Shabbat: shabbat, shabbat1
    Sukkot: sukkot, sukkot1
    Bereshit: bereshit, bereshit1, bereshit2
    Noach: noach, noach1
    Shemot: shemot, shemot1, shemot2
    Yitro: yitro, yitro1
    Terumah: terumah, terumah1
    Vayikra: vayikra, vayikra1
    Bamidbar: bamidbar, bamidbar1
    Korach: korach, korach1, korach2
    Balak: balak, balak1
    Pinchas: pinchas, pinchas1
    Devarim: deuteronomy, devarim
    Shoftim: shoftim, shoftim1, shoftim2
    """
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


def pre_dedup_topics():
    """
    Needs way more validation
    a:
        b
        c
    c:
        b
    :return:
    """
    def get_all_paths(start, path=None):
        is_init = path is None
        path = path or []
        path += [start]
        isa_set = inv_dedup_map[start]
        paths = [path]
        for isa_slug in isa_set:
            if isa_slug not in path:
                newpaths = get_all_paths(isa_slug, [p for p in path])
                for newpath in newpaths:
                    if newpath not in paths:
                        paths += [newpath]
        if is_init:
            paths.sort(key=lambda x: len(x), reverse=True)
            final_paths = []
            for p in paths:
                is_subset = False
                for p2 in final_paths:
                    if len(p2) > len(p) and p == p2[:len(p)]:
                        is_subset = True
                        break
                if is_subset:
                    continue
                final_paths += [p]
            paths = final_paths
        return paths

    with open("data/dup_topics - dup_topics.csv", 'r') as fin:
        cin = csv.DictReader(fin)
        dup_hard = list(cin)
    with open("data/dup_topics - dup_topics easy.csv", 'r') as fin:
        cin = csv.DictReader(fin)
        dup_easy = list(cin)
    dup_full = dup_easy + dup_hard
    dedup_map = defaultdict(set)
    inv_dedup_map = defaultdict(set)
    curr_block = []
    curr_key = None
    for irow, row in enumerate(dup_full):
        curr_block += [row]
        if irow == len(dup_full) - 1 or len(dup_full[irow + 1]['Key']) > 0:
            num_ps = len(list(filter(lambda x: x['Should Merge'] == 'p', curr_block)))
            num_ys = len(list(filter(lambda x: x['Should Merge'] == 'y', curr_block)))
            if num_ps > 1 or (num_ys == 0 and num_ps > 0) or (num_ys > 0 and num_ps == 0):
                print("Issue with block with key {} has issues. Row # {}".format(curr_key, irow))
            elif num_ps == 1:
                p = list(filter(lambda x: x['Should Merge'] == 'p', curr_block))[0]
                dedup_map[p['Slug']] |= {x['Slug'] for x in filter(lambda x: x['Should Merge'] == 'y', curr_block)}
            curr_block = []
            if irow < len(dup_full) - 1:
                curr_key = dup_full[irow + 1]['Key']
    for k, v in dedup_map.items():
        for slug in v:
            inv_dedup_map[slug].add(k)
    final_dedup_map = defaultdict(set)
    for k, v in dedup_map.items():
        for slug in v:
            all_paths = get_all_paths(slug)
            parent_nodes = [p[-1] for p in all_paths]
            if parent_nodes[1:] != parent_nodes[:-1]:
                print('----')
                for p in all_paths:
                    print(p)
            for p in all_paths:
                for inner_slug in p[:-1]:
                    final_dedup_map[p[-1]].add(inner_slug)
    for k, v in final_dedup_map.items():
        final_dedup_map[k] = list(v)
    with open('data/final_dedup_map.json', 'w') as fout:
        json.dump(final_dedup_map, fout, ensure_ascii=False, indent=2)


def dedup_topics():
    db.sheets.create_index('topics.slug')
    with open("data/final_dedup_map.json", 'r') as fin:
        dedup_map = json.load(fin)
    for k, v in tqdm(dedup_map.items()):
        main_topic = Topic.init(k)
        for slug in v:
            minor_topic = Topic.init(slug)
            if main_topic is None:
                print(main_topic, 'main')
                continue
            if minor_topic is None:
                print(minor_topic, 'minor')
                continue
            main_topic.merge(minor_topic)


def recat_toc():
    # TOC_MAP = {
    #     'art': 'art',
    #     'group-of-people': 'authors',
    #     'people': 'authors',
    #     'tanakh-people': 'tanakh',
    #     "biblical-event": 'tanakh',
    #     'biblical-source': 'tanakh',
    #     "specific-biblical-person-relationship": 'tanakh',
    #     'magic': 'aggadah',
    #     'sustenance': 'food',
    #     'place': 'geographic-locations',
    #     'history': 'history',
    #     'holiday': 'holidays',
    #     'language-entity': 'language',
    #     'preposition': 'language',
    #     'law': 'law',
    #     'halachic-process': 'law',
    #     'halachic-role': 'law',
    #     'philosophy': 'philosophy',
    #     'freedom': 'philosophy',
    #     'knowledge1': 'philosophy',
    #     'prayer': 'prayer',
    #     'brachah': 'prayer',
    #     'theology': 'theology',
    #     'theological-tenets': 'theology',
    #     'divine-names': 'theology',
    #     'theological-process': 'theology',
    #     'ethics': 'theology',
    #     'halachic-role-of-inanimate-object': 'ritual-objects',
    #     'science': 'science',
    #     'group-of-animals': 'science',
    #     'animals': 'science',
    #     'plants': 'science',
    #     'weather': 'science',
    #     'middot': 'society',
    #     'emotions': 'society',
    #     'role-of-person': 'society',
    #     'specific-person-relationship': 'society',
    #     'source': 'source'
    # }
    # cat_prefs = {
    #     ('history', 'tanakh'): 'tanakh',
    #     ('philosophy', 'theology'): 'theology',
    #     ('history', 'theology'): 'theology',
    #     ('law', 'ritual-objects'): 'ritual-objects',
    #     ('society', 'tanakh'): 'tanakh',
    #     ('authors', 'tanakh'): 'tanakh',
    #     ('law', 'society'): 'law',
    #     ('art', 'society'): 'art',
    #     ('food', 'science'): 'food',
    #     ('prayer', 'source', 'theology'): 'prayer'
    # }

    display_links = IntraTopicLinkSet({'linkType': 'displays-under'})
    display_map = {}
    top_level = {t.slug: t.get_primary_title('en') for t in TopicSet({'isTopLevelDisplay': True})}
    for l in display_links:
        if l.fromTopic in display_map:
            print("WARNING:", l.fromTopic, 'has value', display_map[l.fromTopic], 'not', l.toTopic)
        display_map[l.fromTopic] = l.toTopic
    ts = TopicSet({'numSources': {"$gt": 0}})
    rows = []
    for t in tqdm(ts, total=ts.count()):
        row = {
            "En": t.get_primary_title('en'),
            "He": t.get_primary_title('he'),
            "Num Sources": t.numSources,
            "Slug": t.slug,
            "Description": getattr(t, 'description', {}).get('en', ''),
            "Order": getattr(t, 'displayOrder', '10000'),
            'Link': f'topics-dev.sandbox.sefaria.org/topics/{t.slug}'
        }
        # old_slug = getattr(t, 'alt_ids', {}).get('_old_slug', None)
        # if old_slug:
        #     row['Old Slug'] = old_slug
        if t.slug in display_map and display_map[t.slug] in top_level:
            row['Cat'] = top_level[display_map[t.slug]]
            row['Cat Source'] = 'Old Mapping'
            rows += [row]
        # else:
        #     types = t.get_types()
        #     auto_matches = TOC_MAP.keys() & types
        #     if len(auto_matches) == 0:
        #         pass
        #     else:
        #         cats = set()
        #         for match in auto_matches:
        #             cats.add(TOC_MAP[match])
        #         cat_key = tuple(sorted(list(cats), key=lambda x: x))
        #         if cat_key in cat_prefs:
        #             cats = [cat_prefs[cat_key]]
        #         elif len(cats) > 1:
        #             print(row['En'], "CATS:", ', '.join(cats))
        #         row['Cat'] = top_level[list(cats)[0]]
        #         row['Cat Source'] = 'Auto-match'


    with open('recat.csv', 'w') as fout:
        c = csv.DictWriter(fout, ['Cat Source', 'Cat', 'En', 'He', 'Num Sources', 'Order', 'Slug', 'Link', 'Description', 'Old Slug'])
        c.writeheader()
        c.writerows(rows)


def recat_top_level():
    top_level = {t.slug: t for t in TopicSet({'isTopLevelDisplay': True})}
    rows = []
    for s, t in top_level.items():
        rows += [{
            "ID": t.get_primary_title('en'),
            "En": t.get_primary_title('en'),
            "He": t.get_primary_title('he'),
            "Order": t.displayOrder,
            "Status": ""
        }]
    with open('data/recat_top.csv', 'w') as fout:
        c = csv.DictWriter(fout, ['ID', 'En', 'He', 'Order', 'Status'])
        c.writeheader()
        c.writerows(rows)


def renormalize_slugs():
    ts = TopicSet()

    for t in tqdm(ts, total=ts.count()):
        title = t.get_primary_title('en') if len(t.get_primary_title('en')) > 0 else t.get_primary_title('he')
        if SluggedAbstractMongoRecord.normalize_slug(title) != t.slug:  # re.search(r'\d+$', t.slug) and
            old_slug = t.slug
            new_alt_ids = getattr(t, 'alt_ids', {})
            new_alt_ids['_old_slug'] = old_slug
            setattr(t, 'alt_ids', new_alt_ids)
            new_slug = SluggedAbstractMongoRecord.normalize_slug(title)
            t.slug = new_slug
            t.save()
            print('---')
            print('En', t.get_primary_title('en'))
            print('He', t.get_primary_title('he'))
            print('Old', old_slug)
            print('New', new_slug)
            t.merge(old_slug)


def set_should_display():
    with open('data/upper_level_nodes.csv', 'r') as fin:
        c = csv.DictReader(fin)
        for row in c:
            if row['display'] == 'No':
                slug = row['Node'].lower()
                slug = re.sub(r"[ /]", "-", slug.strip())
                slug = re.sub(r"[^a-z0-9\-א-ת]", "", slug)
                topic = Topic.init(slug)
                if topic is None:
                    print("BAD", row['Node'])
                    continue
                if getattr(topic, 'numSources', 0) > 0:
                    print("Has Sources", slug, topic.get_primary_title('en'))
                    continue
                print("GOOD", slug, topic.get_primary_title('en'))
                setattr(topic, 'shouldDisplay', False)
                topic.save()


def new_edge_type_research():
    itls = IntraTopicLinkSet({"linkType": "specifically-dependent-on"})
    for l in tqdm(itls, total=itls.count()):
        ft = Topic().load({'slug': l.fromTopic})
        tt = Topic().load({'slug': l.toTopic})
        if ft.has_types({'specific-person-relationship'}) and tt.has_types({'people'}):
            l.linkType = 'relationship-of'
            l.save()
    itls = IntraTopicLinkSet({"linkType": "participates-in"})
    for l in tqdm(itls, total=itls.count()):
        ft = Topic().load({'slug': l.fromTopic})
        tt = Topic().load({'slug': l.toTopic})
        if ft.has_types({'people'}) and tt.has_types({'history'}):
            l.linkType = 'person-participates-in-event'
            l.save()
    itls = IntraTopicLinkSet({"linkType": "member-of"})
    for l in tqdm(itls, total=itls.count()):
        ft = Topic().load({'slug': l.fromTopic})
        tt = Topic().load({'slug': l.toTopic})
        if ft.has_types({'people'}) and tt.has_types({'a-people'}):
            l.linkType = 'leader-of'
            l.save()


def fix_recat_toc():
    with open("data/Recategorize Topics - TOC Mapping.csv", 'r') as fin:
        c = csv.DictReader(fin)
        rows = list(c)
    for row in rows:
        t = Topic().load({"slug": row["Slug"]})
        if t:
            row["Slug"] = t.slug
        if not Topic().load({"slug": row["Slug"]}):
            print("No Topic for", row["Slug"])
        else:
            row["Link"] = "topics-dev.sandbox.sefaria.org/topics/{}".format(row["Slug"])

    with open("data/fixed_recat_toc.csv", "w") as fout:
        c = csv.DictWriter(fout, c.fieldnames)
        c.writeheader()
        c.writerows(rows)


def recat_law():
    top_law = [l.fromTopic for l in IntraTopicLinkSet({"linkType": TopicLinkType.isa_type, "toTopic": "halakhah"})]
    name_map = {}
    with open("/Users/nss/Documents/Sefaria-Data/research/knowledge_graph/bootstrapper/final_topic_names.csv", "r") as fin:
        c = csv.DictReader(fin)
        for i, row in enumerate(c):
            if i >= 4727 and i < 5039:
                name = row["Final English Translation"].strip()
                if name in name_map:
                    print("DUP", name, i)
                    continue
                name_map[name] = i-4727
    out_rows = []
    for slug in top_law:
        children = Topic().load({"slug": slug}).get_leaf_nodes(TopicLinkType.isa_type)
        children.sort(key=lambda t: name_map.get(t.get_primary_title("en"), 9999))
        for i, c in enumerate(children):
            out_rows += [{
                "Cat Source": "Is A",
                "Cat": slug,
                "En": c.get_primary_title("en"),
                "He": c.get_primary_title("he"),
                "Num Sources": c.numSources,
                "Order": i,
                "Slug": c.slug,
                "Link": "topics-dev.sandbox.sefaria.org/topics/" + c.slug,
                "Description": getattr(c, 'description', {}).get('en', '')
            }]
    with open('data/recat_law.csv', 'w') as fout:
        c = csv.DictWriter(fout, ['Cat Source', 'Cat', 'En', 'He', 'Num Sources', 'Order', 'Slug', 'Link', 'Description'])
        c.writeheader()
        c.writerows(out_rows)


def export_law_toc():
    def recurse_displays_under(curr_slug='law'):
        curr_topic = Topic.init(curr_slug)
        curr_links = curr_topic.link_set('intraTopic', query_kwargs={'linkType': 'displays-under'})
        temp_rows = []
        for l in curr_links:
            contents = l.contents()
            if not contents['isInverse']:
                continue
            temp_rows += [{
                'Cat': curr_topic.get_primary_title('en'),
                'Slug': l.topic,
                'Order': '10000',
                'Cat Source': '',
                'En': '',
                'He': '',
                'Num Sources': '',
                'Link': '',
                'Description': ''
            }]
            if l.topic != curr_slug:
                temp_rows += recurse_displays_under(l.topic)
        return temp_rows

    rows = recurse_displays_under()
    with open('../data/new-new-recat-toc.csv', 'w') as fout:
        c = csv.DictWriter(fout, ['Cat Source', 'Cat', 'En', 'He', 'Num Sources', 'Order', 'Slug', 'Link', 'Description'])
        c.writeheader()
        c.writerows(rows)


def apply_recat_toc():
    law_slugs = [
        'law',
        'legal-text',
        'united-states-law',
        'halachic-principles',
        'human-ethics',
        'family-law',
        'laws-of-prayer',
        'laws-of-kindness',
        'property-law',
        'tort-law',
        'laws-of-impurity-and-purity',
        'agricultural-law',
        'laws-of-optional-restrictions',
        'laws-of-scribes',
        'laws-of-the-calendar',
        'laws-of-worship-of-god',
        'laws-of-government',
        'laws-of-food',
        'laws-of-clothing',
        'noahide-(gentile)-law'
    ]
    delete_query = {'linkType': 'displays-under', '$and': [{key: {'$ne': lslug}} for key in ('fromTopic', 'toTopic') for lslug in law_slugs]}
    find_query = {'linkType': 'displays-under', 'or': [{key: lslug} for key in ('fromTopic', 'toTopic') for lslug in law_slugs]}

    db.topic_links.delete_many(delete_query)
    # IntraTopicLinkSet({"linkType": "displays-under"}).delete()
    file_prefix = "../data/Recategorize Topics - "
    # with open(file_prefix + "Categories.csv", "r") as fin:
    #     c = csv.DictReader(fin)
    #     categories = list(c)
    # with open(file_prefix + "Law Categories.csv", "r") as fin:
    #     c = csv.DictReader(fin)
    #     law_categories = list(c)
    with open(file_prefix + "TOC Mapping.csv", "r") as fin:
        c = csv.DictReader(fin)
        toc_mapping = list(c)
    # with open("../data/new-new-recat-toc.csv", "r") as fin:
    #     c = csv.DictReader(fin)
    #     law_toc_mapping = list(c)
    #     law_slugs = {row['Slug'] for row in law_toc_mapping if len(row['Cat']) > 0}

    top_level = TopicSet({"isTopLevelDisplay": True})
    name_topic_map = {t.get_primary_title('en'): t for t in top_level}
    name_slug_map = {}
    # for cat in categories:
    #     if cat["Status"] == "New category":
    #         # if len(cat["New Slug"]) > 0:
    #         t = Topic().load({"slug": cat["New Slug"]})
    #         # else:
    #         #     t = Topic({"slug": cat["En"], "titles": [{"primary": True, "lang": "en", "text": cat["En"]}, {"primary": True, "lang": "he", "text": cat["He"]}]})
    #         if t is None:
    #             print("NONE!", cat["New Slug"])
    #         name_slug_map[cat["En"]] = t.slug
    #         setattr(t, "isTopLevelDisplay", True)
    #         setattr(t, "displayOrder", int(cat["Order"]))
    #         for title in t.titles:
    #             if title.get('primary', False) and title['lang'] == 'en':
    #                 title['text'] = cat["En"]
    #         t.save()
    #     elif cat["Status"] == "Deleted":
    #         t = name_topic_map[cat["En"]]
    #         delattr(t, "isTopLevelDisplay")
    #         delattr(t, "displayOrder")
    #         t.save()
    #     elif cat["Status"] == "Fully Deleted":
    #         t = name_topic_map[cat["En"]]
    #         t.delete()
    #     else:
    #         if cat["En"] == "NA":
    #             continue
    #         t = name_topic_map[cat["En"]]
    #         setattr(t, "isTopLevelDisplay", True)
    #         setattr(t, "displayOrder", int(cat["Order"]))
    #         t.save()
    #         name_slug_map[cat["En"]] = t.slug

    links = []
    for row in toc_mapping:
        if row['Cat'] == 'Law' or row['Slug'] in law_slugs or len(row['Cat']) == 0:
            continue

        try:
            link = {
                "fromTopic": row['Slug'],
                "toTopic": name_topic_map[row['Cat']].slug,
                "linkType": "displays-under",
                "dataSource": "sefaria",
                "class": "intraTopic",
            }
        except KeyError:
            print("KEY ERROR", row['Cat'], row['Slug'])
        t = Topic().load({"slug": row["Slug"]})
        if t is None:
            print("TOC MAPPING NONE", row["Slug"])
            continue
        if row["Order"] != "10000":
            setattr(t, 'displayOrder', int(row["Order"]))
            t.save()
        links += [link]

    # for cat in law_categories:
    #     link = {
    #         "fromTopic": cat['ID'],
    #         "toTopic": 'law',
    #         "linkType": "displays-under",
    #         "dataSource": "sefaria",
    #         "class": "intraTopic",
    #     }
    #     t = Topic().load({"slug": cat["ID"]})
    #     if t is None:
    #         print("LAW CAT NONE", cat["ID"])
    #         continue
    #     if cat["Order"] != "10000":
    #         setattr(t, 'displayOrder', int(cat["Order"]))
    #         t.save()
    #     links += [link]

    # for row in law_toc_mapping:
    #     link = {
    #         "fromTopic": row['Slug'],
    #         "toTopic": row['Cat'],
    #         "linkType": "displays-under",
    #         "dataSource": "sefaria",
    #         "class": "intraTopic",
    #     }
    #     t = Topic().load({"slug": row["Slug"]})
    #     if t is None:
    #         print("TOC MAPPING NONE", row["Slug"])
    #         continue
    #     if row["Order"] != "10000":
    #         setattr(t, 'displayOrder', int(row["Order"]))
    #         t.save()
    #     links += [link]

    deduper = {}
    for link in links:
        deduper[(link['fromTopic'], link['toTopic'])] = link
    links = list(deduper.values())
    with open('../data/new-toc-links.csv', 'w') as fout:
        json.dump(links, fout, ensure_ascii=False, indent=2)
    db.topic_links.insert_many(links, ordered=False)


def find_ambiguous_topics():
    ts = TopicSet()
    ambig = defaultdict(list)
    for t in ts:
        norm_en = t.get_primary_title('en').lower()
        norm_he = t.get_primary_title('he').lower()
        if len(norm_en) > 0:
            ambig[norm_en] += [t]
        if len(norm_he) > 0:
            ambig[norm_he] += [t]

    rows = []
    max_titles = 0
    max_isa = 0
    for k, v in tqdm(ambig.items()):
        if len(v) <= 1:
            continue
        for i, t in enumerate(v):
            row = {
                "Ambiguous": k,
                "Slug": t.slug,
                "En": t.get_primary_title('en'),
                "He": t.get_primary_title('he'),
                "New En": "",
                "New He": "",
                "Disambiguation En": "",
                "Disambiguation He": "",
                "Other Titles": " | ".join([tit['text'] for tit in t.titles if not tit.get('primary', False)]),
                "Link": "topics-dev.sandbox.sefaria.org/topics/{}".format(t.slug)
            }
            if len(t.titles) > max_titles:
                max_titles = len(t.titles)
            # for ititle, title in enumerate(t.titles):
            #     row["T{}".format(ititle)] = title['text']
            #     if title.get('transliteration', False):
            #         row["T{}".format(ititle)] += ' (t)'
            #     if title.get('primary', False):
            #         row["T{}".format(ititle)] += ' (p)'
            #     row["T{}".format(ititle)] += ' ({})'.format(title['lang'])
            """
            isas = IntraTopicLinkSet({"fromTopic": t.slug, "linkType": 'is-a'})
            if isas.count() > max_isa:
                max_isa = isas.count()
            for iisa, isa in enumerate(isas):
                row["I{}".format(iisa)] = isa.toTopic
            """
            rows += [row]
    with open('data/ambig_topics.csv', 'w') as fout:
        c = csv.DictWriter(fout, ['Ambiguous', 'Slug', 'En', 'He', 'New En', 'New He', 'Disambiguation En', 'Disambiguation He', 'Other Titles', 'Link'])  # + ['I{}'.format(i) for i in range(0, max_isa)]
        c.writeheader()
        c.writerows(rows)


def more_title_changes():
    ts = TopicSet({"numSources": {"$gte": 10}})
    rows = []
    for t in ts:
        rows += [{
            "En": t.get_primary_title('en'),
            "He": t.get_primary_title('he'),
            "Slug": t.slug,
            "Link": f"topics-dev.sandbox.sefaria.org/topics/{t.slug}",
            "New En": "",
            "New He": "",
        }]
    with open('data/new_topic_titles.csv', 'w') as fout:
        c = csv.DictWriter(fout, ['Slug', "En", 'He', 'New En', 'New He', 'Link'])
        c.writeheader()
        c.writerows(rows)


def more_rabbi_matching_oh_boy():
    roots = [Topic.init('mishnaic-people'), Topic.init('talmudic-people')]
    all_rabbis = [t for r in roots for t in r.get_leaf_nodes()]
    all_rabbi_dict = {t.slug: t for t in all_rabbis}
    props = ['enWikiLink', 'heWikiLink', 'jeLink', 'generation']
    all_link_types = {
        link_type.slug: link_type for link_type in TopicLinkTypeSet()
    }
    rows = []
    unique_link_types = set()
    for t in all_rabbis:
        row_dict = defaultdict(set)
        for l in t.link_set():
            c = l.contents()
            if c['topic'] not in all_rabbi_dict:
                continue
            if c['linkType'] == "sheets-related-to":
                continue  # avoid user input for this
            lt = all_link_types[c['linkType']]
            ltDisp = getattr(lt, 'pluralDisplayName', lt.displayName)['en']
            row_dict[ltDisp].add(all_rabbi_dict[c['topic']].get_primary_title('en'))
            unique_link_types.add(ltDisp)
        for k, v in row_dict.items():
            row_dict[k] = ' | '.join(v)
        row_dict.update({
            'Slug': t.slug,
            'En': t.get_primary_title('en'),
            'He': t.get_primary_title('he'),
            'Link': f'topics-dev.sandbox.sefaria.org/topics/{t.slug}'
        })
        for p in props:
            pval, _ = t.get_property(p)
            if pval:
                row_dict[p] = pval
        rows += [row_dict]
    with open('data/more_rabbi_matching.csv', 'w') as fout:
        c = csv.DictWriter(fout, ['Slug', 'En', 'He'] + [lt for lt in unique_link_types] + props + ['Link'])
        c.writeheader()
        c.writerows(rows)

def reupdate_descs():
    with open('data/Topic Descriptions - Biblical Figures.csv', 'r') as fin:
        c = csv.DictReader(fin)
        rows = list(c)
    for row in rows:
        t = Topic.init(row['Slug'])
        if len(row['Copy']) == 0:
            continue
        setattr(t, 'description', {
            'en': row['Copy'],
            'he': row['Hebrew Copy']
        })
        t.save()


def reupdate_titles():
    with open('data/New Topic Titles - new_topic_titles.csv', 'r') as fin:
        c = csv.DictReader(fin)
        rows = list(c)
    for row in rows:
        if len(row['New En']) == 0:
            continue
        t = Topic.init(row['Slug'])
        title_exists = False
        title_index = -1
        for ititle, title in enumerate(t.titles):
            if title.get('primary', False) and title['lang'] == 'en':
                del title['primary']
            if (not title_exists) and (title['text'] == row['New En'].strip()) and (title['lang'] == 'en'):
                title_exists = True
                title_index = ititle
                title['primary'] = True

        if not title_exists:
            t.titles += [{
                "primary": True,
                "text": row['New En'].strip(),
                "lang": "en"
            }]
        is_trans = len(row['Is Transliteration']) > 0
        if is_trans:
            t.titles[title_index]['transliteration'] = True
        t.save()


def refactor_disambiguation():
    for t in TopicSet():
        if not getattr(t, 'disambiguation', None):
            continue
        for lang, disambig in t.disambiguation.items():
            for title in t.titles:
                if title['lang'] == lang and title.get('primary', False):
                    title['disambiguation'] = disambig
        delattr(t, 'disambiguation')
        t.save()


if __name__ == '__main__':
    # slug_to_sheet_map, term_to_slug_map, invalid_term_to_slug_map, tag_to_slug_map = do_topics(dry_run=False)
    # do_data_source()
    # do_topic_link_types()
    # db.topic_links.drop()
    # db.topic_links.create_index('class')
    # db.topic_links.create_index('expandedRefs')
    # db.topic_links.create_index('toTopic')
    # db.topic_links.create_index('fromTopic')
    # do_intra_topic_link(term_to_slug_map, invalid_term_to_slug_map)
    # do_ref_topic_link(slug_to_sheet_map)
    # do_sheet_refactor(tag_to_slug_map)
    # dedup_topics()
    # generate_topic_links_from_sheets()
    # update_ref_topic_link_orders()
    # import_term_descriptions()
    # new_edge_type_research()
    # add_num_sources_to_topics()
    # update_intra_topic_link_orders()
    # clean_up_time()
    # find_ambiguous_topics()
    # recat_toc()
    # recat_top_level()
    # more_rabbi_matching_oh_boy()
    # export_law_toc()
    apply_recat_toc()


def yo():
    rtls = RefTopicLinkSet({"is_sheet": True})
    sheet_cache = {}
    updates = {}
    for  l in tqdm(rtls, total=rtls.count()):
        sid = int(l.ref.replace("Sheet ", ""))
        sheet = sheet_cache.get(sid, db.sheets.find_one({"id": sid}, {"title": 1}))
        sheet_cache[sid] = sheet
        try:
            title_lang = 'english' if re.search(r'[a-zA-Z]', re.sub(r'<[^>]+>', '', sheet.get('title', 'a'))) is not None else 'hebrew'
        except TypeError:
            continue
        new_order = getattr(l, 'order', {})
        new_order['titleLanguage'] = title_lang
        updates[l._id] = new_order
    db.topic_links.bulk_write([
        UpdateOne({"_id": l[0]}, {"$set": {"order": l[1]}}) for l in updates.items()
    ])


def yoyo():
    ts = TopicSet()
    updates = {}
    for topic in tqdm(ts, total=ts.count()):
        topic_slug = topic.slug
        sheets = RefTopicLinkSet({'toTopic': topic_slug, 'is_sheet': True})
        if sheets.count() == 0:
            continue
        for sheet_link in sheets:
            sheet_id = int(sheet_link.ref.replace('Sheet ', ''))
            avg_pr = sheet_link.order['relevance']

            sheet = db.sheets.find_one({"id": sheet_id},
                                       {"views": 1, "includedRefs": 1, "dateCreated": 1, "options": 1, "title": 1, "topics": 1})

            # relevance based on other topics on this sheet
            other_topic_slug_set = {t['slug'] for t in sheet.get('topics', []) if t['slug'] != topic_slug}
            total_links_in_common = 0
            for other_topic_slug in other_topic_slug_set:
                intra_topic_link = IntraTopicLink().load({'$or': [
                    {'fromTopic': topic_slug, 'toTopic': other_topic_slug},
                    {'fromTopic': other_topic_slug, 'toTopic': topic_slug}]})
                if intra_topic_link:
                    total_links_in_common += getattr(intra_topic_link, 'order', {}).get('linksInCommon', 0)
            avg_in_common = 1 if len(other_topic_slug_set) == 0 else (total_links_in_common / len(other_topic_slug_set)) + 1

            relevance = 0 if avg_pr == 0 else 500*avg_pr + avg_in_common
            new_order = getattr(sheet_link, 'order', {})
            new_order['relevance'] = relevance
            updates[sheet_link._id] = new_order
    db.topic_links.bulk_write([
        UpdateOne({"_id": l[0]}, {"$set": {"order": l[1]}}) for l in updates.items()
    ])


def sup():
    is_hebrew = re.compile('[א-ת]')
    query = {"topics.asTyped": is_hebrew}
    bad = list(db.sheets.find(query, {'topics': True, 'id': True}))
    ambig_set = defaultdict(list)
    good_set = defaultdict(list)
    for b in tqdm(bad):
        for tag in b['topics']:
            if not re.search(is_hebrew, tag['asTyped']):
                continue
            t = Topic().load({'slug': tag['slug']})
            if t is None or tag['asTyped'] not in {tit['text'] for tit in t.titles}:
                ts = TopicSet({"titles.text": tag['asTyped']})
                if ts.count() == 0:
                    print('No topics for {}'.format(tag['asTyped']))
                elif ts.count() > 1:
                    ambig_set[tag['asTyped']] += [b['id']]
                    # print('AMBIG {}'.format(tag['asTyped']))
                else:
                    t = ts.array()[0]
                    good_set[tag['asTyped']] += [[t.slug, b['id']]]
                    # print('PERFECT {} {}'.format(tag['asTyped'], t.slug))
    with open('data/sheet_ambig_tags.json', 'w') as fout:
        json.dump(ambig_set, fout, ensure_ascii=False, indent=2)
    with open('data/sheet_good_tags.json', 'w') as fout:
        json.dump(good_set, fout, ensure_ascii=False, indent=2)


def supyo():
    deletes = set()
    sheet_links = RefTopicLinkSet({"is_sheet": True})
    sheet_cache = {}
    for l in tqdm(sheet_links, total=sheet_links.count()):
        sid = int(l.ref.replace("Sheet ", ''))
        sheet = sheet_cache.get(sid, db.sheets.find_one({"id": sid}, {"status": 1}))
        sheet_cache[sid] = sheet
        if sheet['status'] != 'public':
            deletes.add(l._id)
    db.topic_links.bulk_write([
        DeleteOne({"_id": _id} for _id in deletes)
    ])


def modify_parashot():
    pars = IntraTopicLinkSet({"toTopic": "parasha", "linkType": "displays-under"})
    pars = [Topic().load({'slug': l.fromTopic}) for l in pars]
    pars = list(filter(lambda x: getattr(x, 'ref', False), pars))
    for p in pars:
        sans_par_en = p.get_primary_title('en')
        sans_par_en.replace('Parashat ', '')
        sans_par_he = p.get_primary_title('he')
        sans_par_en.replace('פרשת ', '')
        p.add_title('Parashat {}'.format(sans_par_en), 'en', True, True)
        p.add_title('פרשת {}'.format(sans_par_he), 'he', True, True)
        p.save()


def make_desc_csv():
    ts = TopicSet({"description": {"$exists": True}})
    rows = []
    for t in ts:
        rows += [{
            "Slug": t.slug,
            "En": t.get_primary_title('en'),
            "He": t.get_primary_title('he'),
            "Desc En": t.description['en'],
            "Desc He": t.description['he'],
            "Link": "topics-dev.sandbox.sefaria.org/topics/{}".format(t.slug)
        }]
    with open("data/edit_descriptions.csv", "w") as fout:
        c = csv.DictWriter(fout, ['Slug', 'En', 'He', 'Desc En', 'Desc He', 'Link'])
        c.writeheader()
        c.writerows(rows)


def add_good_to_promote():
    terms = TermSet({"good_to_promote": True})
    all_terms = set()
    for t in terms:
        all_terms |= set(t.get_titles())
    sheets = list(db.sheets.find({"$or": [{"topics.asTyped": t} for t in all_terms]}))
    term_mapping = defaultdict(set)
    for s in tqdm(sheets, desc='sheets'):
        for top in s['topics']:
            if top['asTyped'] in all_terms:
                term_mapping[top['asTyped']].add(top['slug'])
    for k, v in term_mapping.items():
        for t in v:
            tt = Topic.init(t)
            if not tt:
                print("No", t)
                continue
            # setattr(tt, 'good_to_promote', True)
            # tt.save()


def add_gens_to_rabs():
    gens = TimePeriodSet.get_generations()
    all_peeps = []
    for gen in gens:
        all_peeps += gen.get_people_in_generation()

    rabbi_topics = {t.fromTopic for t in IntraTopicLinkSet(
        {'linkType': 'is-a', '$or': [{'toTopic': 'mishnaic-people'}, {'toTopic': 'talmudic-people'}]})}

    for peep in tqdm(all_peeps):
        query = {"titles.text": peep.primary_name("en")}
        topic_set = [t for t in TopicSet(query) if t.slug in rabbi_topics]
        if len(topic_set) > 1 or len(topic_set) == 0:
            print('Len', len(topic_set),peep.primary_name("en"))
            continue
        p_dict = {
            'jeLink': peep.jeLink,
            'enWikiLink': getattr(peep, 'enWikiLink', None),
            'heWikiLink': getattr(peep, 'heWikiLink', None),
            'generation': peep.generation
        }
        t = topic_set[0]
        props = ['heWikiLink', 'enWikiLink', 'jeLink', 'generation']
        final_props = {}
        for prop in props:
            if p_dict.get(prop, '') is not None and len(p_dict.get(prop, '')) > 0:
                final_props[prop] = {
                    "value": p_dict[prop],
                    "dataSource": "talmudic-people"
                }
        if getattr(t, 'properties', False):
            for k, v in t.properties.items():
                if v['value'] != final_props[k]['value']:
                    print(v['value'])
                    print('Topic', t.properties)
                    print('Peeps', final_props)
        elif len(final_props) > 0:
            t.properties = final_props
            # t.save()


def set_top_holidays():
    top_holidays = [
        "shabbat",
        "rosh-chodesh",
        "rosh-hashanah",
        "yom-kippur",
        "sukkot",
        "shemini-atzeret",
        "simchat-torah",
        "chanukah",
        "tu-bshvat",
        "purim",
        "passover",
        "shavuot",
        "tisha-bav",
    ]
    current_slugs = IntraTopicLinkSet({"linkType": "displays-under", "toTopic": "holidays"}).distinct("fromTopic")
    current_topics = TopicSet({"slug": {"$in": current_slugs}})
    for topic in current_topics:
        if topic.slug == "holidays":
            continue
        if hasattr(t, "displayOrder"):
            del topic.displayOrder
            topic.save()

    for i, slug in enumerate(top_holidays):
        topic = Topic.init(slug)
        topic.displayOrder = i
        topic.save()


def merge_rav_nataf():
    with open('data/Analyze Ambiguous Topics - Resolve merges.csv', 'r') as fin:
        c = csv.DictReader(fin)
        for row in c:
            if row['To merge into (Unique ID)'] == 'dont merge':
                continue
            t = Topic.init(row['To merge into (Unique ID)'])
            s = Topic.init(row['Unique ID'])
            # t.merge(s)


def add_disambiguation():
    with open('data/Analyze Ambiguous Topics - ambig_topics.csv', 'r') as fin:
        c = csv.DictReader(fin)
        for row in c:
            t = Topic.init(row['Unique ID'])
            if not t:
                print('No', row['Unique ID'])
                continue
            if 'MERGE' in row['New En']:
                continue
            new_titles = {}
            disambiguation = {}
            if len(row['New En']) > 0:
                new_titles['en'] = row['New En'].strip()
            elif len(row['New He']) > 0:
                new_titles['he'] = row['New He'].strip()
            elif len(row['Disambiguation En']) > 0:
                disambiguation['en'] = row['Disambiguation En']
            elif len(row['Disambiguation He']) > 0:
                disambiguation['he'] = row['Disambiguation He']

            for lang, new_title in new_titles.items():
                for title in t.titles:
                    if title['lang'] == lang and title.get('primary', False):
                        title['text'] = new_title
            if len(disambiguation) > 0:
                old_disambig = getattr(t, 'disambiguation', {})
                old_disambig.update(disambiguation)
                t.disambiguation = old_disambig
            t.save()


def recat_toc_round2():
    display_links = IntraTopicLinkSet({'linkType': 'displays-under'})
    display_map = {}
    top_level = {t.slug: t.get_primary_title('en') for t in TopicSet({'isTopLevelDisplay': True})}
    for l in display_links:
        if l.fromTopic in display_map:
            print("WARNING:", l.fromTopic, 'has value', display_map[l.fromTopic], 'not', l.toTopic)
        display_map[l.fromTopic] = l.toTopic
