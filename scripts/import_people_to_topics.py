from typing import Optional
import django, re, csv, json
from tqdm import tqdm
from sefaria.model import *
from sefaria.system.exceptions import InputError
from sefaria.model.person import Person, PersonSet, PersonRelationship, PersonRelationshipSet
from collections import defaultdict
from sefaria.system.database import db
from sefaria.helper.topic import calculate_popular_writings_for_authors
import time
import requests

django.setup()

# BASE_PATH = "/Users/nss/Downloads"
# BASE_PATH = "/home/nss/Downloads"
BASE_PATH = "data"

def create_csvs_to_match():
    by_type = defaultdict(list)

    for person in PersonSet():
        if getattr(person, 'generation', False):
            by_type['talmud'] += [person]
        else:
            by_type['author'] += [person]

    for key, value in by_type.items():
        rows = []
        max_poss_slugs = 0
        for person in tqdm(value, desc=key):
            assert isinstance(person, Person)
            try:
                era_name = person.get_era().primary_name('en') if key == 'author' else person.get_generation().primary_name('en')
            except AttributeError:
                era_name = ""
                # print("NoneType error", person.primary_name('en'))
            name_pattern_list = []
            for name in person.names:
                if isinstance(name['text'], list):
                    text = ' '.join(name['text'])
                else:
                    text = name['text']
                name_pattern_list += [re.escape(text)]
            name_pattern = fr"^({'|'.join(name_pattern_list)})$"
            topics = TopicSet({"titles.text": re.compile(name_pattern)})
            if topics.count() > max_poss_slugs:
                max_poss_slugs = topics.count()
                if max_poss_slugs > 6:
                    print(max_poss_slugs, name_pattern)
            temp_row = {
                "En": person.primary_name('en'),
                "He": person.primary_name('he'),
                "Era": era_name,
                "Bio": getattr(person, 'enBio', ''),
            }
            for i, t in enumerate(topics):
                temp_row[f'Slug {i+1}'] = t.slug
            rows += [temp_row]
        print(key, max_poss_slugs)
        with open(f'data/person_matching_{key.replace("/", "-")}.csv', 'w') as fout:
            c = csv.DictWriter(fout, ['En', 'He', 'Era', 'Bio', 'Equivalent Slug'] + [f'Slug {i+1}' for i in range(max_poss_slugs)])
            c.writeheader()
            c.writerows(rows)

def create_csv_of_all_topics():
    rows = []
    ts = TopicSet({}, sort=[('numSources', -1)])
    for t in ts:
        rows += [{
            "Slug": t.slug,
            "En": t.get_primary_title('en'),
            "He": t.get_primary_title('he'),
            "Num Sources": getattr(t, 'numSources', 0)
        }]
    with open('data/all_topics.csv', 'w') as fout:
        c = csv.DictWriter(fout, ['Slug', 'En', 'He', 'Num Sources'])
        c.writeheader()
        c.writerows(rows)

def import_and_merge_talmud():
    with open(f'{BASE_PATH}/Person Topic Matching - Talmud.csv', 'r') as fin:
        c = csv.DictReader(fin)
        for row in c:
            slugs = []
            for i in range(1, 9):
                temp_slug = row[f'Slug {i}']
                if len(temp_slug) == 0: continue
                slugs += [temp_slug]
            main_topic = Topic.init(slugs[0])
            if main_topic is None:
                print("NONe")
            if len(slugs) > 1:
                for other_topic in [Topic.init(s) for s in slugs[1:]]:
                    if other_topic is None:
                        print("NONE")
                        continue
                    main_topic.merge(other_topic)
            if getattr(main_topic, 'alt_ids', None) is None:
                setattr(main_topic, 'alt_ids', {})
            if getattr(main_topic, 'properties', None) is None:
                setattr(main_topic, 'properties', {})
            person = Person().load({"key": row['En']})
            if person is None:
                print("person none", row['En'])
                continue
            for prop in ['enWikiLink', 'heWikiLink', 'jeLink', 'generation', 'sex', 'birthYear', 'birthPlace', 'deathYear', 'deathPlace', 'deathYearIsApprox', 'birthYearIsApprox']:
                val = getattr(person, prop, None)
                if val is None: continue
                main_topic.properties[prop] = {
                    'value': val,
                    'dataSource': 'person-collection'
                }
            main_topic.alt_ids['old-person-key'] = row['En']
            main_topic.save()

def migrate_to_person_data_source():
    for t in TopicSet():
        for k, v in getattr(t, 'properties', {}).items():
            for k1, v1 in v.items():
                if k1 == 'dataSource' and v1 == 'talmudic-people':
                    v[k1] = 'person-collection'
        t.save()
    TopicDataSource().load({'slug': 'talmudic-people'}).delete()
    TopicDataSource({
        'slug': 'person-collection',
        "displayName" : {
            "en" : "Person Collection", 
            "he" : "Person Collection"
        }
    }).save()

def import_and_merge_authors():
    book_col_start = 9
    auth_col_start = 4
    dont_need_disambig = {
        'העמק דבר על התורה',
        'הנצ"יב על התורה',
        'Hanatziv on the tora',
        'Haamek Davar on the tora',
        'Rabbi Moshe Sofer',
        'רבי משה סופר',
        'דעת זקנים בעלי התוספות',
        'דעת זקנים על התורה',
        'Minchat yehuda baaley hatosfot',
        'Daat zkenim al hatora',
    }
    era_slug_map = {
        "GN": "geon-person",
        "RI": "rishon-person",
        "AH": "achron-person",
        "CO": "modern-person",
        "KG": "mishnaic-people",
        "PT": "mishnaic-people",
        "T": "mishnaic-people",
        "A": "talmudic-people",
    }
    with open(f'{BASE_PATH}/Person Topic Matching - Authors.csv', 'r') as fin:
        c = csv.reader(fin)
        for irow, row in enumerate(c):
            if irow == 0: continue
            book_slugs = []
            author_slugs = []
            for icol in range(book_col_start, book_col_start+5):
                temp_slug = row[icol]
                if len(temp_slug) == 0: continue
                book_slugs += [temp_slug]
            for icol in range(auth_col_start, auth_col_start+5):
                temp_slug = row[icol]
                if len(temp_slug) == 0: continue
                author_slugs += [temp_slug]
            if len(book_slugs) > 1:
                main_book = Topic.init(book_slugs[0])
                for b in book_slugs[1:]:
                    t = Topic.init(b)
                    main_book.merge(t)
                for title in main_book.titles:
                    if title['text'] not in dont_need_disambig:
                        title['disambiguation'] = {
                            'en': 'Book',
                            'he': 'ספר'
                        }
                main_book.save()
                main_book.set_slug_to_primary_title()
            person = Person().load({"key": row[0]})
            if person is None:
                ps = PersonSet({"names.text": row[0]})
                if ps.count() > 1 or ps.count() == 0:
                    ps = PersonSet({"names.text": row[1]})
                    if ps.count() > 1 or ps.count() == 0:
                        print("NONE", row)
                        continue
                    person = ps.array()[0]
                person = ps.array()[0]
            main_author_dict = {
                "slug": person.primary_name('en') if len(person.primary_name('en')) > 0 else person.primary_name('he'),
                "titles": [],
                "alt_ids": {"old-person-key": person.key},
                "subclass": "author",
            }
            for lang in ('en', 'he'):
                prim = person.primary_name(lang)
                for title in person.all_names(lang):
                    if isinstance(title, list):
                        title = ' '.join(title).strip()
                    main_author_dict['titles'] += [{
                        "text": title,
                        "lang": lang,
                    }]
                    if title == prim:
                        main_author_dict['titles'][-1]['primary'] = True
            main_author = Topic(main_author_dict)
            for prop in ['enWikiLink', 'heWikiLink', 'jeLink', 'generation', 'sex', 'birthYear', 'birthPlace', 'deathYear', 'deathPlace', 'deathYearIsApprox', 'birthYearIsApprox', 'era']:
                val = getattr(person, prop, None)
                if val is None: continue
                if getattr(main_author, 'properties', None) is None: main_author.properties = {}
                main_author.properties[prop] = {
                    'value': val,
                    'dataSource': 'person-collection'
                }
            description = {}
            for prop in ['enBio', 'heBio']:
                val = getattr(person, prop, None)
                if val is None: continue
                description[prop[:2]] = val
            if len(description) > 0:
                main_author.description = description
                main_author.description_published = True
            main_author.save()
            if len(author_slugs) > 0:
                for a in author_slugs:
                    t = Topic.init(a)
                    main_author.merge(t)
            era = getattr(person, 'era', None)
            if era is None:
                try:
                    era = person.generation[0]
                except AttributeError:
                    continue
            itl = IntraTopicLink({
                "toTopic": era_slug_map[era],
                "fromTopic": main_author.slug,
                "linkType": "is-a",
                "dataSource": "sefaria",
                "generatedBy": "import_people_to_topics"
            })
            try:
                itl.save()
            except InputError as e:
                print(e)

            

def refactor_authors_on_indexes():
    topics_by_person = defaultdict(list)
    for t in TopicSet({"alt_ids.old-person-key": {"$exists": True}}):
        topics_by_person[t.alt_ids['old-person-key']] += [t]
    indexes = IndexSet({"authors.0": {"$exists": True}})
    for i in tqdm(indexes, total=indexes.count()):
        new_authors = []
        for a in i.authors:
            ts = topics_by_person[a]
            assert len(ts) == 1, f"author {a} has {len(ts)} topics. they are {', '.join([t.slug for t in ts])}"
            new_authors += [ts[0].slug]
        i.authors = new_authors
        # bypass save method so this goes much faster
        props = i._saveable_attrs()
        db.index.replace_one({"title":i.title}, props)



def import_people_links():
    TopicLinkType({
        "slug": "grandchild-of",
        "inverseSlug" : "grandparent-of", 
        "displayName" : {
            "en" : "Grandparent", 
            "he" : "סב"
        }, 
        "inverseDisplayName" : {
            "en" : "Grandchild", 
            "he" : "נכד"
        }, 
        "pluralDisplayName" : {
            "en" : "Grandparents", 
            "he" : "סבים"
        }, 
        "inversePluralDisplayName" : {
            "en" : "Grandchildren", 
            "he" : "נכדים"
        }, 
        "shouldDisplay" : True, 
        "inverseShouldDisplay" : True, 
        "validFrom" : [
            "people"
        ], 
        "validTo" : [
            "people"
        ]
    }).save()
    Topic({
        "slug": "group-of-rishon-people",
        "titles": [{
            "text": "group of rishon people",
            "lang": "en",
            "primary": True
        }],
        "shouldDisplay": False
    }).save()
    IntraTopicLink({
        "toTopic": "group-of-people",
        "fromTopic": "group-of-rishon-people",
        "linkType": "is-a",
        "dataSource": "sefaria",        
    }).save()
    tos_link = IntraTopicLink().load({"linkType": "is-a", "fromTopic": "tosafot1"})
    tos_link.toTopic = "group-of-rishon-people"
    tos_link.save()
    rel_to_link_type = {
        "student": "taught",
        "child": "child-of",
        "childinlaw": "child-in-law-of",
        "grandchild": "grandchild-of",
        "member": "member-of",
        "correspondent": "corresponded-with",
        "opposed": "opposed",
        "cousin": "cousin-of"
    }
    flip_link_dir = {'student'}
    topics_by_person = defaultdict(list)
    for t in TopicSet({"alt_ids.old-person-key": {"$exists": True}}):
        topics_by_person[t.alt_ids['old-person-key']] += [t]
    authors = {p.key for p in PersonSet({"generation": {"$exists": False}})}
    for rel in PersonRelationshipSet():
        if rel.from_key in authors or rel.to_key in authors:
            to_topics = topics_by_person[rel.to_key]
            try:
                assert len(to_topics) == 1
                to_topic = to_topics[0].slug
            except AssertionError:
                print(f"{rel.to_key} - {len(to_topics)}")
                continue
            from_topics = topics_by_person[rel.from_key]
            try:
                assert len(from_topics) == 1
                from_topic = from_topics[0].slug
            except AssertionError:
                print(f"{rel.from_key} - {len(from_topics)}")
                continue
            try:
                to_topic, from_topic = (from_topic, to_topic) if rel.type in flip_link_dir else (to_topic, from_topic)
                IntraTopicLink({
                    "toTopic": to_topic,
                    "fromTopic": from_topic,
                    "linkType": rel_to_link_type[rel.type],
                    "dataSource": "sefaria",
                    "generatedBy" : "update_authors_data",  # preempting ability to delete relation links safely in update_authors_data.py
                }).save()
            except AssertionError as e:
                print(e)
            except InputError as e:
                print(e)

def set_description_published():
    for t in TopicSet({"description": {"$exists": True}, "alt_ids.old-person-key": {"$exists": True}}):
        t.description_published = True
        t.save()

def create_topic_tocs():
    Topic({
        "slug": "talmudic-figures",
        "titles": [{
            "text": "Talmudic Figures",
            "lang": "en",
            "primary": True
        },{
            "text": "דמויות מהתלמוד",
            "lang": "he",
            "primary": True
        }],
        "isTopLevelDisplay": True,
        "displayOrder": 100
    }).save()
    Topic({
        "slug": "authors",
        "titles": [{
            "text": "Authors",
            "lang": "en",
            "primary": True
        },{
            "text": "מחברים",
            "lang": "he",
            "primary": True
        }],
        "isTopLevelDisplay": True,
        "displayOrder": 101
    }).save()
    IntraTopicLink({
        "toTopic": "vocations",
        "fromTopic": "authors",
        "linkType": "is-a",
        "dataSource": "sefaria",        
    }).save()
    for p in PersonSet():
        t = PersonTopic.get_person_by_key(p.key)
        if not t:
            continue
        to_topic = "authors" if p.is_post_talmudic() else "talmudic-figures"
        try:
            IntraTopicLink({
                "toTopic": to_topic,
                "fromTopic": t.slug,
                "generatedBy": "import_people_to_topics",
                "dataSource": "sefaria",
                "linkType": "displays-under"
            }).save()
        except InputError as e:
            print(e)
        
        if isinstance(t, AuthorTopic) and len(t.get_authored_indexes()) > 0:
            try:
                IntraTopicLink({
                    "toTopic": "authors",
                    "fromTopic": t.slug,
                    "linkType": "has-role",
                    "dataSource": "sefaria",        
                }).save()
            except InputError as e:
                print(e)
            except AssertionError as e:
                print(e)    


def find_popular_writings(top_n, min_pr):
    tlt = {
        "slug": "popular-writing-of",
        "inverseSlug" : "has-popular-writing", 
        "displayName" : {
            "en" : "Top Citations", 
            "he" : "ציטוטים עיקריים"
        }, 
        "inverseDisplayName" : {
            "en" : "Has Popular Writing", 
            "he" : ""
        }, 
        "shouldDisplay" : True, 
        "inverseShouldDisplay" : False,
        "validTo" : [
            "people",
            "group-of-people"
        ]
    }
    if TopicLinkType().load({"slug": tlt['slug']}) is None:
        TopicLinkType(tlt).save()
    calculate_popular_writings_for_authors(top_n, min_pr)
        

def percent_refs_translated(percent):
    rds = sorted({rd.ref: rd.pagesheetrank for rd in RefDataSet()}.items(), key=lambda x: x[1], reverse=True)
    total = len(rds)
    print('Total', total)
    cutoff = round(total * percent)
    num_translated = 0
    for ref, pr in tqdm(rds[:cutoff]):
        try:
            tc = TextChunk(Ref(ref), lang='en')
            if len(tc.text) > 0:
                num_translated += 1
        except InputError:
            continue
    print(f'Num translated for {percent}% cutoff - {num_translated}/{cutoff} = {num_translated/cutoff}%')
    
def get_wikidata_entries():
    good_guys = [t.alt_ids['wikidata'] for t in TopicSet({"alt_ids.wikidata": {"$exists": True}})]
    out = {"entities": {}}
    for i in tqdm(list(range(0, len(good_guys), 50))):
        time.sleep(1)
        good_ids = "|".join(good_guys[i:i+50])
        r = requests.get("https://www.wikidata.org/w/api.php", params={"action": "wbgetentities", "ids": good_ids, "format": "json", "languages": "en|he", "props": "sitelinks"})
        j = r.json()
        out["entities"].update(j["entities"])
    with open('data/wikidata_people.json', 'w') as fout:
        json.dump(out, fout, ensure_ascii=False, indent=2)

def get_wikipedia_links_for_wikidata_ids():
    try:
        TopicDataSource().load({'slug': 'wikidata'}).delete()
    except AttributeError:
        pass
    TopicDataSource({
        'slug': 'wikidata',
        "displayName" : {
            "en" : "Wikidata", 
            "he" : "Wikidata"
        }
    }).save()
    good_guys = [(t.alt_ids['wikidata'], t) for t in TopicSet({"alt_ids.wikidata": {"$exists": True}})]
    with open('data/wikidata_people.json', 'r') as fin:
        entity_map = json.load(fin)['entities']
    
    lang_count = defaultdict(int)
    for wikidata_id, topic in good_guys:
        sitelinks = entity_map[wikidata_id].get('sitelinks', None)
        if sitelinks is None: continue
        for lang in ('en', 'he', 'de', 'es', 'fr', 'ru'):
            wiki_link_dict = sitelinks.get(f'{lang}wiki', None)
            if wiki_link_dict is None: continue
            wiki_link = f'https://{lang}.wikipedia.org/wiki/{wiki_link_dict["title"].replace(" ", "_")}'
            lang_count[lang] += 1
            if getattr(topic, 'properties', None) is None: topic.properties = {}
            topic.properties[f'{lang}WikiLink'] = {
                "value": wiki_link,
                "dataSource": "wikidata"
            }
        topic.save()
    for k, v in lang_count.items():
        print(k, f'{v}/{len(entity_map)} = {v/len(entity_map)}')

def add_subclasses():
    person = Topic.init('people')
    for topic in person.topics_by_link_type_recursively(only_leaves=True):
        if not getattr(topic, 'subclass', False):
            topic.subclass = 'person'
            topic.save()

def reset_slugs():
    ts = TopicSet({"subclass": "author"})
    for t in tqdm(ts, total=ts.count()):
        t.set_slug_to_primary_title()

def fix_list_titles():
    for t in TopicSet():
        for title in t.titles:
            if isinstance(title['text'], list):
                title['text'] = ' '.join(title['text']).strip()
                t.save()

def reorder_toc():
    new_title_order = [s.strip() for s in """
    Holidays
    Torah Portions
    Biblical Figures
    Prayer
    Lifecycle
    Ritual Objects
    Social Issues
    Stories
    Talmudic Figures
    Authors
    Values
    Beliefs
    Nature
    Laws
    Places
    Food
    Philosophy
    History
    Art
    Supernatural
    Health
    """.strip().split('\n')]
    for ititle, title in enumerate(new_title_order):
        topic = Topic().load({"titles.text": title, "isTopLevelDisplay": True})
        topic.displayOrder = ititle * 10
        topic.save()

def refactor_isas():
    for p in AuthorTopicSet():
        linkset = p.link_set(query_kwargs={"linkType": "is-a", "generatedBy": "import_people_to_topics"})
        for l in linkset:
            l.generatedBy = "update_authors_data"
            l.save()
        linkset = p.link_set(query_kwargs={"linkType": "displays-under", "generatedBy": "import_people_to_topics"})
        for l in linkset:
            l.generatedBy = "update_authors_data"
            l.save()

if __name__ == "__main__":
    # create_csvs_to_match()
    # create_csv_of_all_topics()

    import_and_merge_talmud()
    migrate_to_person_data_source()
    import_and_merge_authors()
    refactor_authors_on_indexes()
    import_people_links()
    create_topic_tocs()
    library.rebuild()  # cache may still have old index records
    find_popular_writings(100, 300)
    add_subclasses()
    reset_slugs()
    
    # ONE TIMERS meshulam-katz | yosef-shaul-nathanson | david-ben-solomon-ibn-(abi)-zimra | aaron-samuel-kaidanover | yom-tov-lipmann-heller
    # for t in TopicSet({"alt_ids.old-person-key": {"$exists": True}}):  
    # for t in [Topic.init('rashi1')]:
    #     link_names = t.get_aggregated_urls_for_authors_indexes()
    #     if len(link_names) == 0: continue
    #     print(t.slug, t.get_primary_title('en'))
    #     for yo in link_names:
    #         print('\t', yo)
    # get_wikidata_entries()
    # get_wikipedia_links_for_wikidata_ids()
    # set_description_published()
    # refactor_isas()

"""
POD=authors-web-67cb54bf45-csc9n
kubectl cp "/home/nss/Downloads/Person Topic Matching - Talmud.csv" $POD:/app/data
kubectl cp "/home/nss/Downloads/Person Topic Matching - Authors.csv" $POD:/app/data
kubectl cp "/home/nss/sefaria/project/scripts/import_people_to_topics.py" $POD:/app/scripts
"""