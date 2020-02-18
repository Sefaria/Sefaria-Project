import re
from collections import defaultdict
from functools import cmp_to_key
from sefaria.model import *
import logging
logger = logging.getLogger(__name__)


def get_topic(topic, with_links, annotate_links, with_refs, group_related):
    topic_obj = Topic().load({"slug": topic})
    response = topic_obj.contents()
    response['primaryTitle'] = {
        'en': topic_obj.get_primary_title('en'),
        'he': topic_obj.get_primary_title('he')
    }
    response['primaryTitleIsTransliteration'] = {
        'en': topic_obj.title_is_transliteration(response['primaryTitle']['en'], 'en'),
        'he': topic_obj.title_is_transliteration(response['primaryTitle']['he'], 'he')
    }
    if with_links and with_refs:
        # can load faster by querying `topic_links` query just once
        all_links = topic_obj.link_set(_class=None)
        intra_links = [l.contents() for l in all_links if isinstance(l, IntraTopicLink)]
        response['refs'] = [l.contents() for l in all_links if isinstance(l, RefTopicLink)]
    else:
        if with_links:
            intra_links = [l.contents() for l in topic_obj.link_set(_class='intraTopic')]
        if with_refs:
            response['refs'] = [l.contents() for l in topic_obj.link_set(_class='refTopic')]
    if with_links:
        response['links'] = {}
        from_topic_set = set()  # duplicates can crop up for symmetric edges b/c of $or query
        link_topic_dict = {other_topic.slug: other_topic for other_topic in TopicSet({"$or": [{"slug": link['topic']} for link in intra_links]})}
        for link in intra_links:
            is_inverse = link['isInverse']
            if link['topic'] in from_topic_set:
                continue
            from_topic_set.add(link['topic'])
            link_type = library.get_topic_link_type(link['linkType'])
            if group_related and link_type.get('groupRelated', is_inverse, False):
                link_type = library.get_topic_link_type(TopicLinkType.related_type)
            del link['linkType']
            del link['class']
            link_type_slug = link_type.get('slug', is_inverse)
            if annotate_links:
                # add display information
                other_topic = link_topic_dict.get(link['topic'], None)
                if other_topic is None:
                    logger.warning("Topic slug {} doesn't exist. Linked to {}".format(link['topic'], topic))
                    continue
                link["title"] = {
                    "en": other_topic.get_primary_title('en'),
                    "he": other_topic.get_primary_title('he')
                }
                link['titleIsTransliteration'] = {
                    'en': other_topic.title_is_transliteration(link["title"]['en'], 'en'),
                    'he': other_topic.title_is_transliteration(link["title"]['he'], 'he')
                }
                if not other_topic.should_display():
                    link['shouldDisplay'] = False
                link['order'] = link.get('order', None) or {}
                link['order']['numSources'] = getattr(other_topic, 'numSources', 0)
            if link_type_slug in response['links']:
                response['links'][link_type_slug]['links'] += [link]
            else:
                response['links'][link_type_slug] = {
                    'links': [link],
                    'title': link_type.get('displayName', is_inverse),
                    'shouldDisplay': link_type.get('shouldDisplay', is_inverse, False)
                }
                if link_type.get('pluralDisplayName', is_inverse, False):
                    response['links'][link_type_slug]['pluralTitle'] = link_type.get('pluralDisplayName', is_inverse)
    if with_refs:
        # sort by relevance and group similar refs
        response['refs'].sort(key=cmp_to_key(sort_refs_by_relevance))
        subset_ref_map = defaultdict(list)
        new_refs = []
        for link in response['refs']:
            del link['class']
            del link['toTopic']
            temp_subset_refs = subset_ref_map.keys() & set(link.get('expandedRefs', []))
            for seg_ref in temp_subset_refs:
                for index in subset_ref_map[seg_ref]:
                    new_refs[index]['similarRefs'] += [link]
                    if link.get('dataSource', None):
                        data_source = library.get_topic_data_source(link['dataSource'])
                        new_refs[index]['dataSources'][link['dataSource']] = data_source.displayName
                        del link['dataSource']
            if len(temp_subset_refs) == 0:
                link['similarRefs'] = []
                link['dataSources'] = {}
                if link.get('dataSource', None):
                    data_source = library.get_topic_data_source(link['dataSource'])
                    link['dataSources'][link['dataSource']] = data_source.displayName
                    del link['dataSource']
                new_refs += [link]
                for seg_ref in link.get('expandedRefs', []):
                    subset_ref_map[seg_ref] += [len(new_refs) - 1]

        response['refs'] = new_refs
    return response


def get_all_topics(limit=1000):
    return TopicSet({}, limit=limit, sort=[('numSources', -1)]).array()


def get_topic_by_parasha(parasha:str) -> Topic:
    """
    Returns topic corresponding to `parasha`
    :param parasha: as spelled in `parshiot` collection
    :return Topic:
    """
    return Topic().load({"parasha": parasha})


def sort_refs_by_relevance(a, b):
    aord = a.get('order', {})
    bord = b.get('order', {})
    if not aord and not bord:
        return 0
    if bool(aord) != bool(bord):
        return len(bord) - len(aord)
    if aord.get('pr', 0) != bord.get('pr', 0):
        return bord.get('pr', 0) - aord.get('pr', 0)
    return (bord.get('numDatasource', 0) * bord.get('tfidf', 0)) - (aord.get('numDatasource', 0) * aord.get('tfidf', 0))


def generate_topic_links_from_sheets(topic=None):
    """
    Processes all public source sheets to create topic links.
    """
    from sefaria.system.database import db
    from sefaria.recommendation_engine import RecommendationEngine
    from tqdm import tqdm
    from statistics import mean, stdev

    if not topic:
        RefTopicLinkSet({"generatedBy": "sheet-topic-aggregator"}).delete()
        IntraTopicLinkSet({"generatedBy": "sheet-topic-aggregator"}).delete()
    all_topics = {}
    query = {"status": "public", "viaOwner": {"$exists": 0}, "assignment_id": {"$exists": 0}}
    if topic:
        query['topics.slug'] = topic
    projection = {"topics": 1, "includedRefs": 1, "owner": 1}
    # ignore sheets that are copies or were assignments
    sheet_list = db.sheets.find(query, projection)
    for sheet in tqdm(sheet_list, desc="aggregating sheet topics"):
        sheet_topics = sheet.get("topics", [])
        for topic_dict in sheet_topics:
            slug = topic_dict['slug']
            if slug not in all_topics:
                all_topics[slug] = {
                                "topic": slug,
                                "sources_dict": defaultdict(set),
                                "related_topics_dict": defaultdict(set)
                            }
            for tref in sheet.get("includedRefs", []):
                try:
                    oref = Ref(tref)
                    for sub_oref in oref.range_list():
                        all_topics[slug]["sources_dict"][sub_oref.normal()].add(sheet['owner'])
                except:
                    continue
            for related_topic_dict in sheet_topics:
                if slug != related_topic_dict['slug']:
                    all_topics[slug]["related_topics_dict"][related_topic_dict['slug']].add(sheet['owner'])

    already_created_related_links = {}
    related_links = []
    for slug, blob in tqdm(all_topics.items(), desc="creating sheet topic links"):
        if topic is not None and slug != topic:
            continue

        # filter related topics with less than 2 users who voted for it
        related_topics = [related_topic for related_topic in blob['related_topics_dict'].items() if len(related_topic[1]) >= 2]
        for related_topic, user_votes in related_topics:
            if related_topic == slug:
                continue
            key = (related_topic, slug) if related_topic > slug else (slug, related_topic)
            if already_created_related_links.get(key, False):
                continue
            already_created_related_links[key] = True
            related_links += [{
                'a': related_topic,
                'b': slug,
                'user_votes': len(user_votes)
            }]
        # filter sources with less than 3 users who added it
        sources = [source for source in blob['sources_dict'].items() if len(source[1]) >= 3]

        # transform data to more convenient format
        temp_sources = []
        for source in sources:
            temp_sources += [(Ref(source[0]), len(source[1]))]
        sources = temp_sources

        # cluster refs that are close to each other and break up clusters where counts differ by more than 2 standard deviations
        STD_DEV_CUTOFF = 2
        temp_sources = []
        if len(sources) == 0:
            continue
        refs, counts = zip(*sources)
        clustered = RecommendationEngine.cluster_close_refs(refs, counts, 2)
        for cluster in clustered:
            counts = [(x['ref'], x['data']) for x in cluster]
            curr_range_start = 0
            for icount, (_, temp_count) in enumerate(counts):
                temp_counts = [x[1] for x in counts[curr_range_start:icount]]
                if len(temp_counts) < 2:
                    # variance requires two data points
                    continue
                count_xbar = mean(temp_counts)
                count_std = max(1/STD_DEV_CUTOFF, stdev(temp_counts, count_xbar))
                if temp_count > (STD_DEV_CUTOFF*count_std + count_xbar) or temp_count < (count_xbar - STD_DEV_CUTOFF*count_std):
                    temp_range = counts[curr_range_start][0].to(counts[icount-1][0])
                    temp_sources += [(temp_range.normal(), [r.normal() for r in temp_range.range_list()], count_xbar)]
                    curr_range_start = icount
            temp_counts = [x[1] for x in counts[curr_range_start:]]
            count_xbar = mean(temp_counts)
            temp_range = counts[curr_range_start][0].to(counts[-1][0])
            temp_sources += [(temp_range.normal(), [r.normal() for r in temp_range.range_list()], count_xbar)]
        sources = temp_sources

        # create links
        if not topic:
            for source in sources:
                rtl = RefTopicLink({
                    "class": "refTopic",
                    "toTopic": slug,
                    "ref": source[0],
                    "expandedRefs": source[1],
                    "linkType": "about",
                    "is_sheet": False,
                    "dataSource": "sefaria-users",
                    "generatedBy": "sheet-topic-aggregator",
                    "order": {"user_votes": source[2]}
                })
                rtl.save()
    if not topic:
        tfidf_related_sheet_topics(related_links)


def tfidf_related_sheet_topics(related_links):
    import math
    from tqdm import tqdm
    from sefaria.system.database import db

    MIN_SCORE_THRESH = 0.1  # min tfidf score that will be saved in db

    docs = defaultdict(dict)
    for l in tqdm(related_links, desc='init'):
        docs[l['a']][l['b']] = {"dir": 'to', 'count': l['user_votes'], 'id': '{}|{}'.format(l['a'], l['b'])}
        docs[l['b']][l['a']] = {"dir": 'from', 'count': l['user_votes'], 'id': '{}|{}'.format(l['a'], l['b'])}

    # idf
    doc_topic_counts = defaultdict(int)
    doc_len = defaultdict(int)
    for slug, topic_counts in docs.items():
        for temp_slug, counts in topic_counts.items():
            doc_topic_counts[temp_slug] += 1
            doc_len[temp_slug] += counts['count']
    idf_dict = {slug: math.log2(len(docs)/count) for slug, count in doc_topic_counts.items()}

    # tf-idf
    id_score_map = defaultdict(dict)
    for slug, topic_counts in docs.items():
        for temp_slug, counts in topic_counts.items():
            id_score_map[counts['id']][counts['dir']] = {
                "tfidf": (counts['count'] * idf_dict[temp_slug]) / doc_len[slug],
            }

    # filter
    final_related_links = []
    for l in tqdm(related_links, desc='save'):
        score_dict = id_score_map['{}|{}'.format(l['a'], l['b'])]
        for dir, inner_score_dict in score_dict.items():
            if inner_score_dict['tfidf'] >= MIN_SCORE_THRESH:
                is_inverse = dir == 'from'
                final_related_links += [{
                    "class": "intraTopic",
                    'fromTopic': l['b'] if is_inverse else l['a'],
                    'toTopic': l['a'] if is_inverse else l['b'],
                    "linkType": "sheets-related-to",
                    "dataSource": "sefaria-users",
                    "generatedBy": "sheet-topic-aggregator",
                    "order": {"tfidf": inner_score_dict['tfidf']}
                }]

    # save
    db.topic_links.insert_many(final_related_links, ordered=False)


def tokenize_words_for_tfidf(text, stopwords):
    from sefaria.utils.hebrew import strip_cantillation

    try:
        text = TextChunk._strip_itags(text)
    except AttributeError:
        pass
    text = strip_cantillation(text, strip_vowels=True)
    text = re.sub(r'<[^>]+>', ' ', text)
    for match in re.finditer(r'\(.*?\)', text):
        if len(match.group().split()) <= 5:
            text = text.replace(match.group(), " ")
    text = re.sub(r'־', ' ', text)
    text = re.sub(r'\[[^\[\]]{1,7}\]', '',
                  text)  # remove kri but dont remove too much to avoid messing with brackets in talmud
    text = re.sub(r'[A-Za-z.,"?!״:׃]', '', text)
    # replace common hashem replacements with the tetragrammaton
    text = re.sub("(^|\s)([\u05de\u05e9\u05d5\u05db\u05dc\u05d1]?)(?:\u05d4['\u05f3]|\u05d9\u05d9)($|\s)",
                  "\\1\\2\u05d9\u05d4\u05d5\u05d4\\3", text)
    # replace common elokim replacement with elokim
    text = re.sub(
        "(^|\s)([\u05de\u05e9\u05d5\u05db\u05dc\u05d1]?)(?:\u05d0\u05dc\u05e7\u05d9\u05dd)($|\s)",
        "\\1\\2\u05d0\u05dc\u05d4\u05d9\u05dd\\3", text)
    words = []
    if len(text) != 0:
        # text = requests.post('https://prefix.dicta.org.il/api', data=json.dumps({'data': text})).text
        # text = re.sub(r'(?<=\s|"|\(|\[|-)[\u05d0-\u05ea]+\|', '', ' ' + text)  # remove prefixes
        text = re.sub('[^\u05d0-\u05ea"]', ' ', text)
        words = list(filter(lambda w: w not in stopwords, [re.sub('^\u05d5', '', w.replace('"', '')) for w in text.split()]))
    return words


def calculate_mean_tfidf():
    import math
    from sefaria.system.exceptions import InputError
    from tqdm import tqdm
    with open('data/hebrew_stopwords.txt', 'r') as fin:
        stopwords = set()
        for line in fin:
            stopwords.add(line.strip())
    ref_topic_links = RefTopicLinkSet({"is_sheet": False})
    ref_topic_map = defaultdict(list)
    ref_words_map = {}
    total = ref_topic_links.count()
    for l in tqdm(ref_topic_links, total=total, desc='process text'):
        ref_topic_map[l.toTopic] += [l.ref]
        if l.ref not in ref_words_map:
            try:
                oref = Ref(l.ref)
            except InputError:
                print(l.ref)
                continue

            ref_words_map[l.ref] = tokenize_words_for_tfidf(oref.text('he').as_string(), stopwords)

    # idf
    doc_word_counts = defaultdict(int)
    for topic, ref_list in tqdm(ref_topic_map.items(), desc='idf'):
        unique_words = set()
        for tref in ref_list:
            try:
                words = ref_words_map[tref]
            except KeyError:
                print("Dont have {}".format(tref))
                continue
            for w in words:
                if w not in unique_words:
                    doc_word_counts[w] += 1
                    unique_words.add(w)
    idf_dict = {}
    for w, count in doc_word_counts.items():
        idf_dict[w] = math.log2(len(ref_topic_map)/count)

    # tf-idf
    topic_tref_score_map = {}
    top_words_map = {}
    for topic, ref_list in ref_topic_map.items():
        total_tf = defaultdict(int)
        tref_tf = defaultdict(lambda: defaultdict(int))
        for tref in ref_list:
            words = ref_words_map.get(tref, [])
            for w in words:
                total_tf[w] += 1
                tref_tf[tref][w] += 1
        tfidf_dict = {}
        for w, tf in total_tf.items():
            tfidf_dict[w] = tf * idf_dict[w]
        for tref in ref_list:
            words = ref_words_map.get(tref, [])
            if len(words) == 0:
                topic_tref_score_map[(topic, tref)] = 0
                continue
            # calculate avg tfidf - tfidf for words that appear in this tref
            # so that tref can't influence score
            topic_tref_score_map[(topic, tref)] = sum((tfidf_dict[w] - tref_tf[tref].get(w, 0)*idf_dict[w]) for w in words)/len(words)
            # top_words_map[(topic, tref)] = [x[0] for x in sorted([(w, (tfidf_dict[w] - tref_tf[tref].get(w, 0)*idf_dict[w])) for w in words], key=lambda x: x[1], reverse=True)[:10]]
    return topic_tref_score_map, ref_topic_map


def calculate_pagerank_scores(ref_topic_map):
    from sefaria.system.exceptions import InputError
    from sefaria.pagesheetrank import pagerank_rank_ref_list
    from tqdm import tqdm
    pr_map = {}
    pr_seg_map = {}  # keys are (topic, seg_tref). used for sheet relevance
    for topic, ref_list in tqdm(ref_topic_map.items(), desc='calculate pr'):
        oref_list = []
        for tref in ref_list:
            try:
                oref_list += [Ref(tref)]
            except InputError:
                continue
        oref_pr_list = pagerank_rank_ref_list(oref_list)
        for oref, pr in oref_pr_list:
            pr_map[(topic, oref.normal())] = pr
            for seg_oref in oref.all_segment_refs():
                pr_seg_map[(topic, seg_oref.normal())] = pr
    return pr_map, pr_seg_map


def calculate_other_ref_scores(ref_topic_map):
    from sefaria.system.exceptions import InputError
    from tqdm import tqdm

    LANGS_CHECKED = ['en', 'he']
    num_datasource_map = {}
    langs_available = {}
    comp_date_map = {}
    order_id_map = {}
    for topic, ref_list in tqdm(ref_topic_map.items(), desc='calculate other ref scores'):
        seg_ref_counter = defaultdict(int)
        tref_range_lists = {}
        for tref in ref_list:
            try:
                oref = Ref(tref)
            except InputError:
                continue
            tref_range_lists[tref] = [seg_ref.normal() for seg_ref in oref.range_list()]
            try:
                tp = oref.index.best_time_period()
                year = int(tp.start) if tp else 3000
            except ValueError:
                year = 3000
            comp_date_map[(topic, tref)] = year
            order_id_map[(topic, tref)] = oref.order_id()
            langs_available[(topic, tref)] = [lang for lang in LANGS_CHECKED if oref.is_text_fully_available(lang)]
            for seg_ref in tref_range_lists[tref]:
                seg_ref_counter[seg_ref] += 1
        for tref in ref_list:
            range_list = tref_range_lists.get(tref, None)
            num_datasource_map[(topic, tref)] = 0 if range_list is None else max(seg_ref_counter[seg_ref] for seg_ref in range_list)
    return num_datasource_map, langs_available, comp_date_map, order_id_map


def update_ref_topic_link_orders():
    from tqdm import tqdm
    from sefaria.system.database import db
    from sefaria.system.exceptions import InputError
    from pymongo import UpdateOne

    topic_tref_score_map, ref_topic_map = calculate_mean_tfidf()
    num_datasource_map, langs_available, comp_date_map, order_id_map = calculate_other_ref_scores(ref_topic_map)
    pr_map, pr_seg_map = calculate_pagerank_scores(ref_topic_map)
    ref_topic_links = RefTopicLinkSet()
    total = ref_topic_links.count()
    sheet_cache = {}
    intra_topic_link_cache = {}

    def get_sheet_order(topic_slug, sheet_id):
        if sheet_id in sheet_cache:
            sheet = sheet_cache[sheet_id]
        else:
            sheet = db.sheets.find_one({"id": sheet_id}, {"views": 1, "includedRefs": 1, "dateCreated": 1, "options": 1, "title": 1, "topics": 1})
            includedRefs = []
            for tref in sheet['includedRefs']:
                try:
                    oref = Ref(tref)
                    includedRefs += [[sub_oref.normal() for sub_oref in oref.all_segment_refs()]]
                except InputError:
                    continue
                except AssertionError:
                    print("Assertion Error", tref)
                    continue
            sheet['includedRefs'] = includedRefs
            sheet_cache[sheet_id] = sheet

        # relevance based on average pagerank personalized to this topic
        total_pr = 0
        for ref_range in sheet['includedRefs']:
            if len(ref_range) == 0:
                continue
            total_pr += sum([pr_seg_map.get((topic_slug, ref), 0) for ref in ref_range]) / len(ref_range)
        avg_pr = 0 if len(sheet['includedRefs']) == 0 else total_pr / len(sheet['includedRefs'])

        # relevance based on other topics on this sheet
        other_topic_slug_set = {t['slug'] for t in sheet.get('topics', []) if t['slug'] != topic_slug}
        total_tfidf = 0
        for other_topic_slug in other_topic_slug_set:
            intra_topic_link = IntraTopicLink().load({'$or': [
                {'fromTopic': topic_slug, 'toTopic': other_topic_slug},
                {'fromTopic': other_topic_slug, 'toTopic': topic_slug}]})
            if intra_topic_link:
                is_inverse = intra_topic_link.toTopic == topic_slug
                tfidfDir = 'fromTfidf' if is_inverse else 'toTfidf'
                total_tfidf += getattr(intra_topic_link, 'order', {}).get(tfidfDir, 0)
        avg_tfidf = 1 if len(other_topic_slug_set) == 0 else (total_tfidf / len(other_topic_slug_set)) + 1

        relevance = 0 if avg_pr == 0 else 1000*avg_pr + avg_tfidf
        sheet_title = sheet.get('title', 'a')
        if not isinstance(sheet_title, str):
            title_lang = 'english'
        else:
            title_lang = 'english' if re.search(r'[a-zA-Z]', re.sub(r'<[^>]+>', '', sheet_title)) is not None else 'hebrew'
        return {
            'views': sheet.get('views', 0),
            'dateCreated': sheet['dateCreated'],
            'relevance': relevance,
            'language': sheet.get('options', {}).get('language', 'bilingual'),
            'titleLanguage': title_lang
        }

    updates = []
    for l in tqdm(ref_topic_links, total=total, desc='update link orders'):
        if l.is_sheet:
            setattr(l, 'order', get_sheet_order(l.toTopic, int(l.ref.replace("Sheet ", ""))))
        else:
            key = (l.toTopic, l.ref)
            try:
                order = getattr(l, 'order', {})
                order.update({
                    'tfidf': topic_tref_score_map[key],
                    'numDatasource': num_datasource_map[key],
                    'availableLangs': langs_available[key],
                    'comp_date': comp_date_map[key],
                    'order_id': order_id_map[key],
                    'pr': pr_map[key]
                })
                setattr(l, 'order', order)
            except KeyError:
                print("KeyError", key)
                continue
        updates += [{'order': l.order, '_id': l._id}]
    db.topic_links.bulk_write([
        UpdateOne({"_id": l['_id']}, {"$set": {"order": l['order']}}) for l in updates
    ])


def update_intra_topic_link_orders():
    """
    add relevance order to intra topic links in sidebar
    :return:
    """
    import math
    from tqdm import tqdm
    from sefaria.system.database import db
    from pymongo import UpdateOne

    uncats = {l.fromTopic for l in IntraTopicLinkSet({"linkType": "is-a", "toTopic": Topic.uncategorized_topic})}
    ts = TopicSet()
    topic_link_dict = {}
    for topic in tqdm(ts, total=ts.count(), desc="update intra orders"):
        if topic.slug in uncats:
            continue
        topic_links = IntraTopicLinkSet({"$or": [{"toTopic": topic.slug}, {"fromTopic": topic.slug}]})
        topic_links_by_slug = defaultdict(list)
        for link in topic_links:
            is_inverse = link.toTopic == topic.slug
            topic_links_by_slug[link.fromTopic if is_inverse else link.toTopic] += [{'link': link, 'dir': 'from' if is_inverse else 'to'}]
        topic_link_dict[topic.slug] = topic_links_by_slug

    # idf
    idf_dict = {}
    N = len(topic_link_dict)  # total num documents
    for topic_slug, topic_links in topic_link_dict.items():
        idf_dict[topic_slug] = 0 if len(topic_links) == 0 else math.log2(N/len(topic_links))

    update_dict = defaultdict(lambda: {'order': {}})
    for topic_slug, topic_links in topic_link_dict.items():
        for other_topic_slug, link_list in topic_links.items():
            other_topic_links = topic_link_dict.get(other_topic_slug, None)
            if other_topic_links is None:
                continue
            in_common = len(topic_links.keys() & other_topic_links.keys())
            for link_dict in link_list:
                new_order = getattr(link_dict['link'], 'order', {})
                update_dict[link_dict['link']._id]['order'].update(new_order)
                tfidf = in_common * idf_dict[other_topic_slug]
                update_dict[link_dict['link']._id]['order'][link_dict['dir'] + 'Tfidf'] = tfidf

    db.topic_links.bulk_write([
        UpdateOne({"_id": l[0]}, {"$set": l[1]}) for l in update_dict.items()
    ])



def add_num_sources_to_topics():
    from sefaria.system.database import db
    from pymongo import UpdateOne
    updates = [{"numSources": RefTopicLinkSet({"toTopic": t.slug}).count(), "_id": t._id} for t in TopicSet()]
    db.topics.bulk_write([
        UpdateOne({"_id": t['_id']}, {"$set": {"numSources": t['numSources']}}) for t in updates
    ])


def recalculate_secondary_topic_data():
    generate_topic_links_from_sheets()
    update_intra_topic_link_orders()
    update_ref_topic_link_orders()
    add_num_sources_to_topics()

