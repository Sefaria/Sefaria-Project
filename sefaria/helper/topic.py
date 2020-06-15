import re
from tqdm import tqdm
from pymongo import UpdateOne, InsertOne
from typing import Optional, Union
from collections import defaultdict
from functools import cmp_to_key
from sefaria.model import *
from sefaria.system.exceptions import InputError
from sefaria.model.topic import TopicLinkHelper
from sefaria.system.database import db
import logging

logger = logging.getLogger(__name__)


def get_topic(topic, with_links, annotate_links, with_refs, group_related):
    topic_obj = Topic.init(topic)
    response = topic_obj.contents()
    response['primaryTitle'] = {
        'en': topic_obj.get_primary_title('en'),
        'he': topic_obj.get_primary_title('he')
    }
    response['primaryTitleIsTransliteration'] = {
        'en': topic_obj.title_is_transliteration(response['primaryTitle']['en'], 'en'),
        'he': topic_obj.title_is_transliteration(response['primaryTitle']['he'], 'he')
    }
    if not response.get("description_published", False) and "description" in response:
        del response["description"]
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
        link_dups_by_type = defaultdict(set)  # duplicates can crop up when group_related is true
        if len(intra_links) > 0:
            link_topic_dict = {other_topic.slug: other_topic for other_topic in TopicSet({"$or": [{"slug": link['topic']} for link in intra_links]})}
        else:
            link_topic_dict = {}
        for link in intra_links:
            is_inverse = link['isInverse']
            link_type = library.get_topic_link_type(link['linkType'])
            if group_related and link_type.get('groupRelated', is_inverse, False):
                link_type = library.get_topic_link_type(TopicLinkType.related_type)
            link_type_slug = link_type.get('slug', is_inverse)
            if link['topic'] in link_dups_by_type[link_type_slug]:
                continue
            link_dups_by_type[link_type_slug].add(link['topic'])

            del link['linkType']
            del link['class']
            if annotate_links:
                link = annotate_topic_link(link, link_topic_dict)
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
            del link['topic']
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


def annotate_topic_link(link: dict, link_topic_dict: dict) -> Union[dict, None]:
    # add display information
    topic = link_topic_dict.get(link['topic'], None)
    if topic is None:
        logger.warning(f"Topic slug {link['topic']} doesn't exist")
        return None
    link["title"] = {
        "en": topic.get_primary_title('en'),
        "he": topic.get_primary_title('he')
    }
    link['titleIsTransliteration'] = {
        'en': topic.title_is_transliteration(link["title"]['en'], 'en'),
        'he': topic.title_is_transliteration(link["title"]['he'], 'he')
    }
    if getattr(topic, "description_published", False):
        link['description'] = getattr(topic, 'description', {})
    else:
        link['description'] = {}
    if not topic.should_display():
        link['shouldDisplay'] = False
    link['order'] = link.get('order', None) or {}
    link['order']['numSources'] = getattr(topic, 'numSources', 0)
    return link


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


def get_random_topic(good_to_promote=True) -> Optional[Topic]:
    query = {"good_to_promote": True} if good_to_promote else {}
    random_topic_dict = list(db.topics.aggregate([
        {"$match": query},
        {"$sample": {"size": 1}}
    ]))
    if len(random_topic_dict) == 0:
        return None

    return Topic(random_topic_dict[0])


def get_random_topic_source(topic:Topic) -> Optional[Ref]:
    random_source_dict = list(db.topic_links.aggregate([
        {"$match": {"toTopic": topic.slug, 'linkType': 'about', 'class': 'refTopic', 'is_sheet': False, 'order.pr': {'$gt': 0}}},
        {"$sample": {"size": 1}}
    ]))
    if len(random_source_dict) == 0:
        return None
    try:
        oref = Ref(random_source_dict[0]['ref'])
    except InputError:
        return None

    return oref


def get_bulk_topics(topic_list: list) -> TopicSet:
    return TopicSet({'$or': [{'slug': slug} for slug in topic_list]})


def recommend_topics(refs: list) -> list:
    """Returns a list of topics recommended for the list of string refs"""

    seg_refs = []
    for tref in refs:
        try:
           oref = Ref(tref)
        except InputError:
            continue
        seg_refs += [r.normal() for r in oref.all_segment_refs()]
    topic_count = defaultdict(int)
    ref_links = RefTopicLinkSet({"expandedRefs": {"$in": seg_refs}})
    for link in ref_links:
        topic_count[link.toTopic] += 1

    recommend_topics = []
    for slug in topic_count.keys():
        topic = Topic.init(slug)
        recommend_topics.append({
            "slug": slug,
            "titles": {
                "en": topic.get_primary_title(lang="en"),
                "he": topic.get_primary_title(lang="he")
            },
            "count": topic_count[slug]
        })

    return sorted(recommend_topics, key=lambda x: x["count"], reverse=True)


def get_topics_for_ref(tref, annotate=False):
    serialized = [l.contents() for l in Ref(tref).topiclinkset()]
    if annotate:
        if len(serialized) > 0:
            link_topic_dict = {topic.slug: topic for topic in TopicSet({"$or": [{"slug": link['topic']} for link in serialized]})}
        else:
            link_topic_dict = {}
        serialized = [annotate_topic_link(link, link_topic_dict) for link in serialized]
    for link in serialized:
        link['anchorRef'] = link['ref']
        link['anchorRefExpanded'] = link['expandedRefs']
        del link['ref']
        del link['expandedRefs']
        if link.get('dataSource', None):
            data_source_slug = link['dataSource']
            data_source = library.get_topic_data_source(data_source_slug)
            link['dataSource'] = data_source.displayName
            link['dataSource']['slug'] = data_source_slug
    return serialized


"""
    SECONDARY TOPIC DATA GENERATION
"""


def generate_all_topic_links_from_sheets(topic=None):
    """
    Processes all public source sheets to create topic links.
    """
    from sefaria.recommendation_engine import RecommendationEngine
    from statistics import mean, stdev
    import math

    OWNER_THRESH = 3
    TFIDF_CUTOFF = 0.15
    STD_DEV_CUTOFF = 2

    all_related_topics = defaultdict(lambda: defaultdict(set))
    all_related_refs = defaultdict(lambda: defaultdict(lambda: defaultdict(float)))
    topic_ref_counts = defaultdict(lambda: defaultdict(int))
    # ignore sheets that are copies or were assignments
    query = {"status": "public", "viaOwner": {"$exists": 0}, "assignment_id": {"$exists": 0}}
    if topic:
        query['topics.slug'] = topic
    projection = {"topics": 1, "includedRefs": 1, "owner": 1}
    sheet_list = db.sheets.find(query, projection)
    for sheet in tqdm(sheet_list, desc="aggregating sheet topics"):
        sheet_topics = sheet.get("topics", [])
        for topic_dict in sheet_topics:
            slug = topic_dict['slug']
            for tref in sheet.get("includedRefs", []):
                try:
                    oref = Ref(tref)
                    for sub_oref in oref.range_list():
                        value = all_related_refs[sub_oref.normal()][slug].get(sheet['owner'], 0)
                        all_related_refs[sub_oref.normal()][slug][sheet['owner']] = max(1/len(sheet_topics), value)
                        topic_ref_counts[slug][sub_oref.normal()] += 1
                except:
                    continue
            for related_topic_dict in sheet_topics:
                if slug != related_topic_dict['slug']:
                    all_related_topics[slug][related_topic_dict['slug']].add(sheet['owner'])

    already_created_related_links = {}
    related_links = []
    source_links = []
    for slug, related_topics_to_slug in tqdm(all_related_topics.items(), desc="creating sheet related topic links"):
        if topic is not None and slug != topic:
            continue

        # filter related topics with less than 2 users who voted for it
        related_topics = [related_topic for related_topic in related_topics_to_slug.items() if len(related_topic[1]) >= 2]
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
    topic_idf_dict = {slug: math.log2(len(all_related_refs) / len(ref_dict)) for slug, ref_dict in topic_ref_counts.items()}
    raw_topic_ref_links = defaultdict(list)
    for tref, related_topics_to_tref in tqdm(all_related_refs.items(), desc="creating sheet related ref links"):
        # filter sources with less than 3 users who added it and tfidf of at least 0.15
        numerator_list = []
        owner_counts = []
        for slug, owner_map in related_topics_to_tref.items():
            numerator = sum(owner_map.values())
            owner_counts += [len(owner_map)]
            numerator_list += [numerator]
        denominator = sum(numerator_list)
        topic_scores = [(slug, (numerator / denominator) * topic_idf_dict[slug], owners) for slug, numerator, owners in
                  zip(related_topics_to_tref.keys(), numerator_list, owner_counts)]
        # transform data to more convenient format
        oref = Ref(tref)
        for slug, _, owners in filter(lambda x: x[1] >= TFIDF_CUTOFF and x[2] >= OWNER_THRESH, topic_scores):
            raw_topic_ref_links[slug] += [(oref, owners)]

    for slug, sources in tqdm(raw_topic_ref_links.items()):
        # cluster refs that are close to each other and break up clusters where counts differ by more than 2 standard deviations
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
                source_links += [{
                    "class": "refTopic",
                    "toTopic": slug,
                    "ref": source[0],
                    "expandedRefs": source[1],
                    "linkType": "about",
                    "is_sheet": False,
                    "dataSource": "sefaria-users",
                    "generatedBy": "sheet-topic-aggregator",
                    "order": {"user_votes": source[2]}
                }]

    if not topic:
        related_links = calculate_tfidf_related_sheet_links(related_links)
        sheet_links = generate_sheet_topic_links()

        # convert to objects
        source_links = [RefTopicLink(l) for l in source_links]
        related_links = [IntraTopicLink(l) for l in related_links]
        sheet_links = [RefTopicLink(l) for l in sheet_links]
        return source_links, related_links, sheet_links


def generate_sheet_topic_links():
    projection = {"topics": 1, "id": 1, "status": 1}
    sheet_list = db.sheets.find({"status": "public"}, projection)
    sheet_links = []
    for sheet in tqdm(sheet_list, desc="getting sheet topic links"):
        if sheet.get('id', None) is None:
            continue
        sheet_topics = sheet.get("topics", [])
        for topic_dict in sheet_topics:
            slug = topic_dict['slug']
            sheet_links += [{
                "class": "refTopic",
                "toTopic": slug,
                "ref": f"Sheet {sheet['id']}",
                "expandedRefs": [f"Sheet {sheet['id']}"],
                "linkType": "about",
                "is_sheet": True,
                "dataSource": "sefaria-users",
                "generatedBy": "sheet-topic-aggregator"
            }]
    return sheet_links


def calculate_tfidf_related_sheet_links(related_links):
    import math

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
    return final_related_links


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


def calculate_mean_tfidf(ref_topic_links):
    import math
    with open('data/hebrew_stopwords.txt', 'r') as fin:
        stopwords = set()
        for line in fin:
            stopwords.add(line.strip())

    ref_topic_map = defaultdict(list)
    ref_words_map = {}
    for l in tqdm(ref_topic_links, total=len(ref_topic_links), desc='process text'):
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
    from sefaria.pagesheetrank import pagerank_rank_ref_list
    pr_map = {}
    pr_seg_map = {}  # keys are (topic, seg_tref). used for sheet relevance
    for topic, ref_list in tqdm(ref_topic_map.items(), desc='calculate pr'):
        oref_list = []
        for tref in ref_list:
            try:
                oref_list += [Ref(tref)]
            except InputError:
                continue
        oref_pr_list = pagerank_rank_ref_list(oref_list, normalize=True)
        for oref, pr in oref_pr_list:
            pr_map[(topic, oref.normal())] = pr
            for seg_oref in oref.all_segment_refs():
                pr_seg_map[(topic, seg_oref.normal())] = pr
    return pr_map, pr_seg_map


def calculate_other_ref_scores(ref_topic_map):
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


def update_ref_topic_link_orders(sheet_source_links, sheet_topic_links):
    other_ref_topic_links = list(RefTopicLinkSet({"is_sheet": False, "generatedBy": {"$ne": TopicLinkHelper.generated_by_sheets}}))
    ref_topic_links = other_ref_topic_links + sheet_source_links

    topic_tref_score_map, ref_topic_map = calculate_mean_tfidf(ref_topic_links)
    num_datasource_map, langs_available, comp_date_map, order_id_map = calculate_other_ref_scores(ref_topic_map)
    pr_map, pr_seg_map = calculate_pagerank_scores(ref_topic_map)
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
            total_pr += sum([pr_seg_map.get((topic_slug, ref), 1e-5) for ref in ref_range]) / len(ref_range)  # make default pr epsilon so that relevance can tell difference between sheets that have sources on topic and those that dont
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

        relevance = 0 if avg_pr == 0 else avg_pr + avg_tfidf  # TODO: test this equation again
        sheet_title = sheet.get('title', 'a')
        if not isinstance(sheet_title, str):
            title_lang = 'english'
        else:
            title_lang = 'english' if re.search(r'[a-zA-Z]', re.sub(r'<[^>]+>', '', sheet_title)) is not None else 'hebrew'
        return {
            'views': sheet.get('views', 0),
            'dateCreated': sheet['dateCreated'],
            'relevance': relevance,
            'avg_ref_pr': avg_pr,
            'avg_topic_tfidf': avg_tfidf,
            'language': sheet.get('options', {}).get('language', 'bilingual'),
            'titleLanguage': title_lang
        }

    all_ref_topic_links_updated = []
    all_ref_topic_links = sheet_topic_links + ref_topic_links
    for l in tqdm(all_ref_topic_links, desc='update link orders'):
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
        all_ref_topic_links_updated += [l]

    return all_ref_topic_links_updated


def update_intra_topic_link_orders(sheet_related_links):
    """
    add relevance order to intra topic links in sidebar
    :return:
    """
    import math
    from itertools import chain

    uncats = Topic.get_uncategorized_slug_set()
    topic_link_dict = defaultdict(lambda: defaultdict(lambda: []))
    other_related_links = IntraTopicLinkSet({"generatedBy": {"$ne": TopicLinkHelper.generated_by_sheets}})
    for link in tqdm(chain(other_related_links, sheet_related_links), desc="update intra orders"):
        if link.fromTopic in uncats or link.toTopic in uncats:
            continue
        topic_link_dict[link.fromTopic][link.toTopic] += [{'link': link, 'dir': 'to'}]
        topic_link_dict[link.toTopic][link.fromTopic] += [{'link': link, 'dir': 'from'}]

    # idf
    idf_dict = {}
    N = len(topic_link_dict)  # total num documents
    for topic_slug, topic_links in topic_link_dict.items():
        idf_dict[topic_slug] = 0 if len(topic_links) == 0 else math.log2(N/len(topic_links))

    def link_id(temp_link):
        return f"{temp_link.fromTopic}|{temp_link.toTopic}|{temp_link.linkType}"

    updated_related_link_dict = {}
    for topic_slug, topic_links in topic_link_dict.items():
        for other_topic_slug, link_list in topic_links.items():
            other_topic_links = topic_link_dict.get(other_topic_slug, None)
            if other_topic_links is None:
                continue
            in_common = len(topic_links.keys() & other_topic_links.keys())
            for link_dict in link_list:
                link = link_dict['link']
                temp_order = getattr(link, 'order', {})
                tfidf = in_common * idf_dict[other_topic_slug]
                temp_order[f"{link_dict['dir']}Tfidf"] = tfidf
                lid = link_id(link_dict['link'])
                if lid in updated_related_link_dict:
                    curr_order = getattr(updated_related_link_dict[lid], 'order', {})
                    temp_order.update(curr_order)
                else:
                    updated_related_link_dict[lid] = link
                updated_related_link_dict[lid].order = temp_order

    return list(updated_related_link_dict.values())


def get_top_topic(sheet):
    """
    Chooses the "top" topic of a sheet out of all the topics the sheet was tagged with
    based on the relevance parameter of the topics in regard to the sheet
    :param sheet: Sheet() obj
    :return: Topic() obj
    """
    # get all topics on the sheet (learn the candidates)
    topics = sheet.get("topics", [])  # mongo query on sheet

    def topic_score(t):
        rtl = RefTopicLink().load({"toTopic": t["slug"], "ref": "Sheet {}".format(sheet.get("id"))})
        if rtl is None:
            return t["slug"], 0
        avg_pr = rtl.contents().get("order", {}).get("avg_ref_pr", 0)
        norm_abg_pr = 0.5 if avg_pr == 0 else 1000*avg_pr
        avg_tfidf = rtl.contents().get("order", {}).get("avg_topic_tfidf", 0)
        score = norm_abg_pr + avg_tfidf
        return t["slug"], score

    if len(topics) == 1:
        max_topic_slug = topics[0]
    elif len(topics) > 1:
        topic_dict = defaultdict(lambda: [(0, 0), 0])
        for t in topics:
            topic_dict[t.get("slug")][1] += 1
            topic_dict[t.get("slug")][0] = topic_score(t)
        scores = dict([(k, v[0][1] * v[1]) for k, v in topic_dict.items()])
        max_topic_slug = max(scores, key=scores.get)
    else:
        return None
    top_topic = Topic.init(max_topic_slug)
    return top_topic


def add_num_sources_to_topics():
    updates = [{"numSources": RefTopicLinkSet({"toTopic": t.slug}).count(), "_id": t._id} for t in TopicSet()]
    db.topics.bulk_write([
        UpdateOne({"_id": t['_id']}, {"$set": {"numSources": t['numSources']}}) for t in updates
    ])


def recalculate_secondary_topic_data():
    sheet_source_links, sheet_related_links, sheet_topic_links = generate_all_topic_links_from_sheets()
    related_links = update_intra_topic_link_orders(sheet_related_links)
    all_ref_links = update_ref_topic_link_orders(sheet_source_links, sheet_topic_links)

    # now that we've gathered all the new links, delete old ones and insert new ones
    RefTopicLinkSet({"generatedBy": TopicLinkHelper.generated_by_sheets}).delete()
    IntraTopicLinkSet({"generatedBy": TopicLinkHelper.generated_by_sheets}).delete()
    print(f"Num Ref Links {len(all_ref_links)}")
    print(f"Num Intra Links {len(related_links)}")
    print(f"Num to Update {len(list(filter(lambda x: getattr(x, '_id', False), all_ref_links + related_links)))}")
    print(f"Num to Insert {len(list(filter(lambda x: not getattr(x, '_id', False), all_ref_links + related_links)))}")

    db.topic_links.bulk_write([
        UpdateOne({"_id": l._id}, {"$set": {"order": l.order}})
        if getattr(l, "_id", False) else
        InsertOne(l.contents(for_db=True))
        for l in (all_ref_links + related_links)
    ])
    add_num_sources_to_topics()
