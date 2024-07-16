import django, csv, json, re
from tqdm import tqdm
from pymongo import InsertOne
from sefaria.model import *
from collections import defaultdict
from sefaria.system.database import db
from sefaria.model.abstract import SluggedAbstractMongoRecord
from sefaria.utils.tibetan import has_tibetan

django.setup()

# RESEARCH_NAMED_ENTITY_LOC = "/home/nss/sefaria/data/research/knowledge_graph/named_entity_recognition"
# DATASETS_NAMED_ENTITY_LOC = "/home/nss/sefaria/datasets/ner/sefaria"
RESEARCH_NAMED_ENTITY_LOC = "data"
DATASETS_NAMED_ENTITY_LOC = "data"

def add_new_alt_titles():
    with open(f"{DATASETS_NAMED_ENTITY_LOC}/new_alt_titles.json", "r") as fin:
        j = json.load(fin)
    for slug, titles in j.items():
        titles_set = set(titles)
        t = Topic.init(slug)
        if t is None:
            print("Topic is none titles", slug)
            continue
        titles_to_add = titles_set.difference(set(t.get_titles('en')))
        if len(titles_to_add) == 0:
            continue
        for title in titles_to_add:
            t.titles += [{
                "text": title,
                "lang": "en"
            }]
        t.save()

def import_bonayich_into_topics():
    with open(f"{RESEARCH_NAMED_ENTITY_LOC}/sperling_named_entities.json", "r") as fin:
        j = json.load(fin)
    tds_json = {
        "slug": "sperling-bonayich",
        "displayName": {
            "en": "Bonyaich via Michael Sperling",
            "he": "Bonyaich via Michael Sperling"
        }
    }
    tds = TopicDataSource().load({"slug": tds_json['slug']})
    if tds is None:
        TopicDataSource(tds_json).save()
    for r in tqdm(j):
        en_prime = None
        he_prime = None
        titles = list({f"{t['text']}|{t['lang']}": t for t in r['manualTitles']}.values())

        for title in titles:
            if title['lang'] == 'en' and en_prime is None:
                en_prime = title['text']
                title['primary'] = True
            if title['lang'] == 'he' and he_prime is None:
                he_prime = title['text']
                title['primary'] = True
        
        slug = en_prime if en_prime is not None else he_prime
        if slug is None:
            print("SLUG IS NONE", r)
        topic_json = {
            "slug": SluggedAbstractMongoRecord.normalize_slug(slug),
            "titles": titles
        }
        try:
            bid = int(r['id'].replace('BONAYICH:', ''))
            topic_json['alt_ids'] = { "bonayich": bid }
        except ValueError:
            print("BAD ID", r['id'])
            pass
        type_is_guess = False
        try:
            assert r['type'] in {'תנא', 'אמורא', 'בדור תנאים', 'בדור אמוראים'}, r
        except AssertionError:
            # print("GUESSING AMORA", r)
            type_is_guess = True
            r['type'] = 'אמורא' 
        type_symbol = "T" if 'תנא' in r['type'] else 'A'
        if 'gen' in r and r['gen'] is not None and len(r['gen']) > 0:
            try:
                r['gen'] = re.sub('[אב]', '', r['gen'])
                gens = re.split('[\-/]', r['gen'])
                gen_list = []
                for g in gens:
                    gen_list += [f"{type_symbol}{int(g)}"]
                symbol = "/".join(gen_list)

                try:
                    assert TimePeriod().load({"symbol": symbol}) is not None, r
                    topic_json['properties'] = { "generation": { "value": symbol, "dataSource": tds_json['slug']}}
                except AssertionError:
                    print("BAD GEN SYMBOL", symbol, r)
            except ValueError:
                print("BAD GEN NUM", r)
        # doesn't work...
        # t = Topic(topic_json)
        # t = Topic.init(t.normalize_slug_field('slug'))
        # if t is not None:
        #     t.delete()

        t = Topic(topic_json)
        t.save()

        if r['tag'] == 'NORP':
            toTopic = "group-of-mishnaic-people" if type_symbol == "T" else "group-of-talmudic-people"
            print(t.slug)
        else:
            toTopic = "mishnaic-people" if type_symbol == "T" else "talmudic-people"
        link_json = {
            "class": "intraTopic",
            "fromTopic": t.slug,
            "toTopic": toTopic,
            "linkType": "is-a",
            "dataSource": tds_json['slug']
        }
        if type_is_guess:
            link_json['generatedBy'] = "import_bonayich_into_topics. may not be amora."
        itl = IntraTopicLink().load(link_json)
        if itl is not None:
            itl.delete()
        itl = IntraTopicLink(link_json)
        itl.save()

def import_rabi_rav_rabbis_into_topics():
    with open(f"{DATASETS_NAMED_ENTITY_LOC}/new_rabbis.json", "r") as fin:
        j = json.load(fin)
    TopicSet({'alt_ids.rav_rabi': {"$exists": True}}).delete()
    for _, d in j.items():
        d['alt_ids'] = {"rav_rabi": True}
        typ = d['type']
        del d['type']
        t = Topic(d)
        t.save()
        toTopic = "mishnaic-people" if typ == "tanna" else "talmudic-people"
        link_json = {
            "class": "intraTopic",
            "fromTopic": t.slug,
            "toTopic": toTopic,
            "linkType": "is-a",
            "dataSource": "sperling-bonayich"
        }
        itl = IntraTopicLink(link_json)
        try:
            itl.save()
        except sefaria.system.exceptions.DuplicateRecordError:
            print("Duplicate", t.slug, toTopic)

    with open(f"{DATASETS_NAMED_ENTITY_LOC}/Fix Rabi and Rav Errors - rav_rabbi_errors.csv", "r") as fin:
        c = csv.DictReader(fin)
        rows = list(c)
    for row in rows:
        typ = row['Error Type (rabbi, title, mistake, correct)']
        is_heb = has_tibetan(row['Snippet'])

        if typ == 'title':
            slug_list = [row['Missing Title Slug']]
            other_slugs = row['Additional Missing Title Slugs']
            if len(other_slugs) > 0:
                slug_list += other_slugs.split(', ')
            topic_list = [Topic.init(slug.lower()) for slug in slug_list]
            for t, s in zip(topic_list, slug_list):
                if not t:
                    print("NO TOPIC", s)
                    continue
                has_title = False
                for tit in t.titles:
                    if tit['text'] == row['Missing Title']:
                        has_title = True
                        break
                if has_title:
                    continue
                t.add_title(row['Missing Title'], 'he' if is_heb else 'en')
                t.save()

def add_ambiguous_topics():
    bon_rabbis = TopicSet({"alt_ids.bonayich": {"$exists": True}})
    bon_set = {t.slug for t in bon_rabbis}
    all_slug_set = {t.slug for t in TopicSet()}

    topic_link_type_dict = {
        "slug" : "possibility-for", 
        "inverseSlug" : "has-possibility", 
        "displayName" : {
            "en" : "Possibility", 
            "he" : "אשפרות"
        }, 
        "pluralDisplayName" : {
            "en" : "Possibilities", 
            "he" : "אפשרויות"
        }, 
        "inverseDisplayName" : {
            "en" : "Has Possibility", 
            "he" : ""
        }, 
        "shouldDisplay" : False, 
        "inverseShouldDisplay" : False
    }
    if TopicLinkType().load({"slug": topic_link_type_dict['slug']}) is None:
        TopicLinkType(topic_link_type_dict).save()

    TopicSet({"isAmbiguous": True}).delete()
    IntraTopicLinkSet({"generatedBy": "add_ambiguous_topics"}).delete()
    all_mentions = get_raw_mentions()
    unique_ambiguities = defaultdict(set)
    for m in all_mentions:
        m["id_matches"] = list(filter(lambda slug: (slug not in bon_set) and (not slug.startswith("BONAYICH:")) and (slug in all_slug_set), m["id_matches"]))
        if len(m['id_matches']) < 2:
            continue
        unique_ambiguities[tuple(m['id_matches'])].add(m['mention'])
    out = []
    for k, v in unique_ambiguities.items():
        titles = [{
            "text": title,
            "lang": "he" if has_tibetan(title) else "en"
        } for title in sorted(v, key=lambda x: len(x))]
        primary_langs_found = set()
        for title in titles:
            if title['lang'] not in primary_langs_found:
                title['primary'] = True
                primary_langs_found.add(title['lang'])

        topic = Topic({
            "slug": f"{titles[0]['text']}-(ambiguous)",
            "titles": titles,
            "isAmbiguous": True,
            "shouldDisplay": False
        })
        topic.save()
        for other_slug in k:
            itl = IntraTopicLink({
                "fromTopic": other_slug,
                "toTopic": topic.slug,
                "linkType": "possibility-for",
                "dataSource": "sefaria",
                "generatedBy": "add_ambiguous_topics",
            })
            itl.save()

        out += [{
            "ids": list(k),
            "titles": list(v)
        }]
    with open(f"{DATASETS_NAMED_ENTITY_LOC}/ambiguous_rabbis.json", "w") as fout:
        json.dump(out, fout, ensure_ascii=False, indent=2)

def add_mentions(title_list=None):
    bon_rabbis = TopicSet({"alt_ids.bonayich": {"$exists": True}})
    bon_set = {t.slug for t in bon_rabbis}
    all_slug_set = {t.slug for t in TopicSet()}
    all_mentions = get_raw_mentions()

    itls = IntraTopicLinkSet({"linkType": "possibility-for"})
    possibility_map = defaultdict(set)
    for itl in itls:
        possibility_map[itl.toTopic].add(itl.fromTopic)
    possibilities2ambiguous = {}
    for ambig, possibility_set in possibility_map.items():
        possibilities2ambiguous["|".join(sorted(possibility_set))] = ambig

    out = {}
    for ne in tqdm(all_mentions):
        # remove bonayich mentions
        ne["id_matches"] = list(filter(lambda slug: (slug not in bon_set) and (not slug.startswith("BONAYICH:")) and (slug in all_slug_set), ne["id_matches"]))

        if len(ne["id_matches"]) == 0:
            continue
        id_match_to_link = None  # when ambiguous, should be set to arbitrary unambiguous topic so that we can link to an interesting page on frontend
        if len(ne["id_matches"]) > 1:
            id_str = "|".join(sorted(ne["id_matches"]))
            id_match = possibilities2ambiguous[id_str]
            id_match_to_link = ne["id_matches"][0]
        else:
            id_match = ne["id_matches"][0]

        key = f"{id_match}|{ne['ref']}|{ne['start']}|{ne['end']}|{ne['versionTitle']}|{ne['language']}"
        mention_link = {
            "toTopic": id_match,
            "linkType": "mention",
            "dataSource": "sefaria",
            "class": "refTopic",
            "is_sheet": False,
            "ref": ne["ref"],
            "expandedRefs": [ne["ref"]],
            "charLevelData": {
                "startChar": ne["start"],
                "endChar": ne["end"],
                "versionTitle": ne["versionTitle"],
                "language": ne["language"],
                "text": ne["mention"]
            }
        }
        if id_match_to_link is not None:
            mention_link['unambiguousToTopic'] = id_match_to_link

        out[key] = mention_link
    del_query = {"linkType": "mention"}
    if title_list:
        title_reg = re.compile(fr"^(?:{'|'.join(title_list)})(?: |, )")
        del_query['ref'] = title_reg
    RefTopicLinkSet(del_query).delete()
    db.topic_links.bulk_write([InsertOne(v) for _, v in out.items()])

def merge_duplicate_rabbis():
    with open(f"{DATASETS_NAMED_ENTITY_LOC}/swap_rabbis.json", "r") as fin:
        j = json.load(fin)
    for a, b in j.items():
        at = Topic.init(a)
        bt = Topic.init(b)
        if at is None:
            print("A is None", a)
            continue
        if bt is None:
            print("B is None", b)
            continue
        if getattr(at, 'alt_ids', {}).get('bonayich', None) is not None:
            del at.alt_ids['bonayich']
            if len(at.alt_ids) == 0:
                delattr(at, 'alt_ids')
            at.save()
        bt.merge(at)

def delete_bonayich_rabbis_from_topics():
    for t in TopicSet():
        if getattr(t, 'alt_ids', {}).get('bonayich', None) is not None:
            print("DELETE", t.slug)
            [l.delete() for l in t.link_set(_class=None)]
            t.delete()
    # make sure there are no 'empty' ambiguous topics
    for t in TopicSet({'isAmbiguous': True}):
        if t.link_set(_class='intraTopic', query_kwargs={'linkType': "possibility-for"}).count() == 0:
            t.delete()

def get_raw_mentions():
    all_mentions = []
    with open(f"{DATASETS_NAMED_ENTITY_LOC}/ner_output_yerushalmi.json", "r") as fin:
        all_mentions += json.load(fin)
    with open(f"{DATASETS_NAMED_ENTITY_LOC}/ner_output_mishnah.json", "r") as fin:
        all_mentions += json.load(fin)
    with open(f"{DATASETS_NAMED_ENTITY_LOC}/ner_output_bavli.json", "r") as fin:
        all_mentions += json.load(fin)
    # with open("data/ner_output_tanakh.json", "r") as fin:
    #     all_mentions += json.load(fin)
    return all_mentions

if __name__ == "__main__":
    # import_bonayich_into_topics()
    # import_rabi_rav_rabbis_into_topics()
    add_ambiguous_topics()
    add_mentions()  # this should be the only relevant command to run going forward
    # add_new_alt_titles()
    # merge_duplicate_rabbis()
    # delete_bonayich_rabbis_from_topics()
"""
kubectl cp commands
POD=devpod-noah-846cdffc8b-8l5wl
kubectl cp /home/nss/sefaria/datasets/ner/sefaria/ner_output_bavli.json $POD:/app/data
kubectl cp /home/nss/sefaria/datasets/ner/sefaria/ner_output_yerushalmi.json $POD:/app/data
kubectl cp /home/nss/sefaria/datasets/ner/sefaria/ner_output_mishnah.json $POD:/app/data
kubectl cp /home/nss/sefaria/project/scripts/import_named_entities.py $POD:/app/scripts

# not relevant anymore
kubectl cp /home/nss/sefaria/data/research/knowledge_graph/named_entity_recognition/sperling_named_entities.json $POD:/app/data
kubectl cp /home/nss/sefaria/datasets/ner/sefaria/new_rabbis.json $POD:/app/data
kubectl cp "/home/nss/sefaria/datasets/ner/sefaria/Fix Rabi and Rav Errors - rav_rabbi_errors.csv" $POD:/app/data
kubectl cp /home/nss/sefaria/datasets/ner/sefaria/new_alt_titles.json $POD:/app/data
kubectl cp /home/nss/sefaria/datasets/ner/sefaria/swap_rabbis.json $POD:/app/data

for yerushalmi launch
kubectl cp "/home/nss/Downloads/Yerushalmi People Deduplication - English Titles.csv" $POD:/app/data
kubectl cp "/home/nss/Downloads/Yerushalmi People Deduplication - Hebrew Titles.csv" $POD:/app/data
kubectl cp "/home/nss/Downloads/Yerushalmi People Deduplication - New Titles for Existing Topics.csv" $POD:/app/data
kubectl cp /home/nss/sefaria/datasets/ner/michael-sperling/sperling_en_and_he.csv $POD:/app/data
kubectl cp /home/nss/sefaria/data/research/knowledge_graph/named_entity_recognition/sperling_named_entities.json $POD:/app/data
kubectl cp /home/nss/sefaria/data/research/knowledge_graph/named_entity_recognition/import_yerushalmi_rabbis.py $POD:/app/scripts
"""