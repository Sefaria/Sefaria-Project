import django, re, csv, json, srsly
from tqdm import tqdm
django.setup()
from sefaria.model import *
from sefaria.system.exceptions import InputError
from collections import defaultdict

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
    with open('/home/nss/Downloads/Person Topic Matching - Talmud.csv', 'r') as fin:
        c = csv.DictReader(fin)
        for row in c:
            slugs = []
            for i in range(1, 9):
                temp_slug = row[f'Slug {i}']
                if len(temp_slug) == 0: continue
                slugs += [temp_slug]
            if len(slugs) > 1:
                main_topic = Topic.init(slugs[0])
                if main_topic is None:
                    print("NONe")
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
                print("MERGE", " | ".join(slugs))

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
    with open('/home/nss/Downloads/Person Topic Matching - Authors.csv', 'r') as fin:
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
            }
            for lang in ('en', 'he'):
                prim = person.primary_name(lang)
                for title in person.all_names(lang):
                    main_author_dict['titles'] += [{
                        "text": title,
                        "lang": lang,
                    }]
                    if title == prim:
                        main_author_dict['titles'][-1]['primary'] = True
            main_author = Topic(main_author_dict)
            for prop in ['enWikiLink', 'heWikiLink', 'jeLink', 'generation', 'sex', 'birthYear', 'birthPlace', 'deathYear', 'deathPlace', 'deathYearIsApprox', 'birthYearIsApprox']:
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
    from sefaria.system.database import db
    topics_by_person = defaultdict(list)
    for t in TopicSet({"alt_ids.old-person-key": {"$exists": True}}):
        topics_by_person[t.alt_ids['old-person-key']] += [t]
    indexes = IndexSet({"authors.0": {"$exists": True}})
    for i in tqdm(indexes, total=indexes.count()):
        new_authors = []
        for a in i.authors:
            ts = topics_by_person[a]
            assert len(ts) == 1
            new_authors += [ts[0].slug]
        i.authors = new_authors
        # bypass save method so this goes much faster
        props = i._saveable_attrs()
        getattr(db, 'index').replace_one({"_id":i._id}, props, upsert=True)



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
                    "generatedBy" : "import_people_to_topics",
                }).save()
            except AssertionError as e:
                print(e)
            except InputError as e:
                print(e)

def set_description_published():
    for t in TopicSet({"description": {"$exists": True}, "alt_ids.old-person-key": {"$exists": True}}):
        t.description_published = True
        t.save()

if __name__ == "__main__":
    # create_csvs_to_match()
    # create_csv_of_all_topics()

    import_and_merge_talmud()
    migrate_to_person_data_source()
    import_and_merge_authors()
    refactor_authors_on_indexes()
    import_people_links()

    # set_description_published()