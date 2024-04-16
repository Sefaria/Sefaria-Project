import re
from tqdm import tqdm
from pymongo import UpdateOne, InsertOne
from typing import Optional, Union
from collections import defaultdict
from functools import cmp_to_key
from sefaria.model import *
from sefaria.model.place import process_topic_place_change
from sefaria.system.exceptions import InputError
from sefaria.model.topic import TopicLinkHelper
from sefaria.system.database import db
from sefaria.system.cache import django_cache

import structlog
from sefaria import tracker
from sefaria.helper.descriptions import create_era_link
logger = structlog.get_logger(__name__)

def get_topic(v2, topic, with_html=True, with_links=True, annotate_links=True, with_refs=True, group_related=True, annotate_time_period=False, ref_link_type_filters=None, with_indexes=True):
    topic_obj = Topic.init(topic)
    if topic_obj is None:
        return {}
    response = topic_obj.contents(annotate_time_period=annotate_time_period, with_html=with_html)
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
        ref_links = [l.contents() for l in all_links if isinstance(l, RefTopicLink) and (len(ref_link_type_filters) == 0 or l.linkType in ref_link_type_filters)]
    else:
        if with_links:
            intra_links = [l.contents() for l in topic_obj.link_set(_class='intraTopic')]
        if with_refs:
            query_kwargs = {"linkType": {"$in": list(ref_link_type_filters)}} if len(ref_link_type_filters) > 0 else None
            ref_links = [l.contents() for l in topic_obj.link_set(_class='refTopic', query_kwargs=query_kwargs)]
    if with_links:
        response['links'] = group_links_by_type('intraTopic', intra_links, annotate_links, group_related)
    if with_refs:
        ref_links = sort_and_group_similar_refs(ref_links)
        if v2:
            ref_links = group_links_by_type('refTopic', ref_links, False, False)
        response['refs'] = ref_links
    if with_indexes and isinstance(topic_obj, AuthorTopic):
        response['indexes'] = topic_obj.get_aggregated_urls_for_authors_indexes()

    if getattr(topic_obj, 'isAmbiguous', False):
        possibility_links = topic_obj.link_set(_class="intraTopic", query_kwargs={"linkType": TopicLinkType.possibility_type})
        possibilities = []
        for link in possibility_links:
            possible_topic = Topic.init(link.topic)
            if possible_topic is None:
                continue
            possibilities += [possible_topic.contents(annotate_time_period=annotate_time_period)]
        response['possibilities'] = possibilities
    return response


def group_links_by_type(link_class, links, annotate_links, group_related):
    link_dups_by_type = defaultdict(set)  # duplicates can crop up when group_related is true
    grouped_links = {}
    agg_field = 'links' if link_class == 'intraTopic' else 'refs'

    if link_class == 'intraTopic' and len(links) > 0 and annotate_links:
        link_topic_dict = {other_topic.slug: other_topic for other_topic in TopicSet({"$or": [{"slug": link['topic']} for link in links]})}
    else:
        link_topic_dict = {}
    for link in links:
        is_inverse = link.get('isInverse', False)
        link_type = library.get_topic_link_type(link['linkType'])
        if group_related and link_type.get('groupRelated', is_inverse, False):
            link_type = library.get_topic_link_type(TopicLinkType.related_type)
        link_type_slug = link_type.get('slug', is_inverse)

        if link_class == 'intraTopic':
            if link['topic'] in link_dups_by_type[link_type_slug]:
                continue
            link_dups_by_type[link_type_slug].add(link['topic'])
            if annotate_links:
                link = annotate_topic_link(link, link_topic_dict)
                if link is None:
                    continue

        del link['linkType']
        del link['class']

        if link_type_slug in grouped_links:
            grouped_links[link_type_slug][agg_field] += [link]
        else:
            grouped_links[link_type_slug] = {
                agg_field: [link],
                'title': link_type.get('displayName', is_inverse),
                'shouldDisplay': link_type.get('shouldDisplay', is_inverse, False)
            }
            if link_type.get('pluralDisplayName', is_inverse, False):
                grouped_links[link_type_slug]['pluralTitle'] = link_type.get('pluralDisplayName', is_inverse)
    return grouped_links

def merge_props_for_similar_refs(curr_link, new_link):
    # when grouping similar refs, make sure the source to display has the maximum curatedPrimacy of all the similar refs,
    # as well as datasource and descriptions of all the similar refs
    data_source = new_link.get('dataSource', None)
    if data_source:
        curr_link = update_refs(curr_link, new_link)
        curr_link = update_data_source_in_link(curr_link, new_link, data_source)

    if not curr_link['is_sheet']:
        curr_link = update_descriptions_in_link(curr_link, new_link)
        curr_link = update_curated_primacy(curr_link, new_link)
    return curr_link

def update_data_source_in_link(curr_link, new_link, data_source):
    data_source_obj = library.get_topic_data_source(data_source)
    curr_link['dataSources'][data_source] = data_source_obj.displayName
    del new_link['dataSource']
    return curr_link

def update_refs(curr_link, new_link):
    # use whichever ref covers a smaller range
    if len(curr_link['expandedRefs']) > len(new_link['expandedRefs']):
        curr_link['ref'] = new_link['ref']
        curr_link['expandedRefs'] = new_link['expandedRefs']
    return curr_link

def update_descriptions_in_link(curr_link, new_link):
    # merge new link descriptions into current link
    new_description = new_link.get('descriptions', {})
    if new_description:
        curr_link_description = curr_link.get('descriptions', {})
        for lang in ['en', 'he']:
            if lang not in curr_link_description and lang in new_description:
                curr_link_description[lang] = new_description[lang]
        curr_link['descriptions'] = curr_link_description
    return curr_link

def update_curated_primacy(curr_link, new_link):
    # make sure curr_link has the maximum curated primacy value of itself and new_link
    new_curated_primacy = new_link.get('order', {}).get('curatedPrimacy', {})
    if new_curated_primacy:
        if 'order' not in curr_link:
            curr_link['order'] = new_link['order']
            return
        curr_curated_primacy = curr_link['order'].get('curatedPrimacy', {})
        for lang in ['en', 'he']:
            # front-end sorting considers 0 to be default for curatedPrimacy
            curr_curated_primacy[lang] = max(curr_curated_primacy.get(lang, 0), new_curated_primacy.get(lang, 0))
        curr_link['order']['curatedPrimacy'] = curr_curated_primacy
    return curr_link

def is_learning_team(dataSource):
    return dataSource == 'learning-team' or dataSource == 'learning-team-editing-tool'

def iterate_and_merge(new_ref_links, new_link, subset_ref_map, temp_subset_refs):
    # temp_subset_refs contains the refs within link's expandedRefs that overlap with other refs
    # subset_ref_map + new_ref_links contain mappings to get from the temp_subset_refs to the actual link objects
    for seg_ref in temp_subset_refs:
        for index in subset_ref_map[seg_ref]:
            new_ref_links[index]['similarRefs'] += [new_link]
            curr_link_learning_team = any([is_learning_team(dataSource) for dataSource in new_ref_links[index]['dataSources']])
            if not curr_link_learning_team:  # if learning team, ignore source with overlapping refs
                new_ref_links[index] = merge_props_for_similar_refs(new_ref_links[index], new_link)
    return new_ref_links

def sort_and_group_similar_refs(ref_links):
    ref_links.sort(key=cmp_to_key(sort_refs_by_relevance))
    subset_ref_map = defaultdict(list)
    new_ref_links = []
    for link in ref_links:
        del link['topic']
        temp_subset_refs = subset_ref_map.keys() & set(link.get('expandedRefs', []))
        new_data_source = link.get("dataSource", None)
        should_merge = len(temp_subset_refs) > 0 and not is_learning_team(new_data_source) # learning team links should be handled separately from one another and not merged
        if should_merge:
            new_ref_links = iterate_and_merge(new_ref_links, link, subset_ref_map, temp_subset_refs)
        else:
            link['similarRefs'] = []
            link['dataSources'] = {}
            if link.get('dataSource', None):
                data_source = library.get_topic_data_source(link['dataSource'])
                link['dataSources'][link['dataSource']] = data_source.displayName
                del link['dataSource']
            new_ref_links += [link]
            for seg_ref in link.get('expandedRefs', []):
                subset_ref_map[seg_ref] += [len(new_ref_links) - 1]
    return new_ref_links


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


@django_cache(timeout=24 * 60 * 60)
def get_all_topics(limit=1000, displayableOnly=True):
    query = {"shouldDisplay": {"$ne": False}, "numSources": {"$gt": 0}} if displayableOnly else {}
    return TopicSet(query, limit=limit, sort=[('numSources', -1)]).array()


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
    if aord.get("curatedPrimacy") or bord.get("curatedPrimacy"):
        return len(bord.get("curatedPrimacy", {})) - len(aord.get("curatedPrimacy", {}))
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

def ref_topic_link_prep(link):
    link['anchorRef'] = link['ref']
    link['anchorRefExpanded'] = link['expandedRefs']
    del link['ref']
    del link['expandedRefs']
    if link.get('dataSource', None):
        data_source_slug = link['dataSource']
        data_source = library.get_topic_data_source(data_source_slug)
        link['dataSource'] = data_source.displayName
        link['dataSource']['slug'] = data_source_slug
    return link

def get_topics_for_ref(tref, annotate=False):
    serialized = [l.contents() for l in Ref(tref).topiclinkset()]
    if annotate:
        if len(serialized) > 0:
            link_topic_dict = {topic.slug: topic for topic in TopicSet({"$or": [{"slug": link['topic']} for link in serialized]})}
        else:
            link_topic_dict = {}
        serialized = list(filter(None, (annotate_topic_link(link, link_topic_dict) for link in serialized)))
    for link in serialized:
        ref_topic_link_prep(link)

    serialized.sort(key=cmp_to_key(sort_refs_by_relevance))
    return serialized


@django_cache(timeout=24 * 60 * 60, cache_prefix="get_topics_for_book")
def get_topics_for_book(title: str, annotate=False, n=18) -> list:
    all_topics = get_topics_for_ref(title, annotate=annotate)

    topic_counts = defaultdict(int)
    topic_data   = {}
    for topic in all_topics:
        if topic["topic"].startswith("parashat-"):
            continue # parasha topics aren't useful here
        topic_counts[topic["topic"]] += topic["order"].get("user_votes", 1)
        topic_data[topic["topic"]] = {"slug": topic["topic"], "title": topic["title"]}

    topic_order = sorted(topic_counts.items(), key=lambda x: x[1], reverse=True)

    return [topic_data[topic[0]] for topic in topic_order][:n]


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
    projection = {"topics": 1, "expandedRefs": 1, "owner": 1}
    sheet_list = db.sheets.find(query, projection)
    for sheet in tqdm(sheet_list, desc="aggregating sheet topics"):
        sheet_topics = sheet.get("topics", [])
        for topic_dict in sheet_topics:
            slug = topic_dict['slug']
            for tref in sheet.get("expandedRefs", []):
                value = all_related_refs[tref][slug].get(sheet['owner'], 0)
                all_related_refs[tref][slug][sheet['owner']] = max(1/len(sheet_topics), value)
                topic_ref_counts[slug][tref] += 1
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
        oref = get_ref_safely(tref)
        if oref is None:
            continue
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
    sheet_list = db.sheets.find({"status": "public", "assignment_id": {"$exists": 0}}, projection)
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
        text = TextChunk.strip_itags(text)
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
            oref = get_ref_safely(l.ref)
            if oref is None:
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
    from statistics import mean
    pr_map = {}
    pr_seg_map = {}  # keys are (topic, seg_tref). used for sheet relevance
    for topic, ref_list in tqdm(ref_topic_map.items(), desc='calculate pr'):
        oref_list = []
        for tref in ref_list:
            oref = get_ref_safely(tref)
            if oref is None:
                continue
            oref_list += [oref]
        seg_ref_map = {r.normal(): [rr.normal() for rr in r.all_segment_refs()] for r in oref_list}
        oref_pr_list = pagerank_rank_ref_list(oref_list, normalize=True, seg_ref_map=seg_ref_map)
        for oref, pr in oref_pr_list:
            pr_map[(topic, oref.normal())] = pr
            for seg_tref in seg_ref_map[oref.normal()]:
                pr_seg_map[(topic, seg_tref)] = pr
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
            oref = get_ref_safely(tref)
            if oref is None:
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
            num_datasource_map[(topic, tref)] = 0 if (range_list is None or len(range_list) == 0) else max(seg_ref_counter[seg_ref] for seg_ref in range_list)
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
                    oref = get_ref_safely(tref)
                    if oref is None:
                        continue
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
                    'pr': pr_map[key],
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
        max_topic_slug = topics[0].get("slug")
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
    updates = [{"numSources": RefTopicLinkSet({"toTopic": t.slug, "linkType": {"$ne": "mention"}}).count(), "_id": t._id} for t in TopicSet()]
    db.topics.bulk_write([
        UpdateOne({"_id": t['_id']}, {"$set": {"numSources": t['numSources']}}) for t in updates
    ])


def make_titles_unique():
    ts = TopicSet()
    for t in ts:
        unique = {tuple(tit.values()): tit for tit in t.titles}
        if len(unique) != len(t.titles):
            t.titles = list(unique.values())
            t.save()

def get_ref_safely(tref):
    try:
        oref = Ref(tref)
        return oref
    except InputError:
        print("Input Error", tref)
    except IndexError:
        print("IndexError", tref)
    except AssertionError:
        print("AssertionError", tref)
    return None

def calculate_popular_writings_for_authors(top_n, min_pr):
    RefTopicLinkSet({"generatedBy": "calculate_popular_writings_for_authors"}).delete()
    rds = RefDataSet()
    by_author = defaultdict(list)
    for rd in tqdm(rds, total=rds.count()):
        try:
            tref = rd.ref.replace('&amp;', '&')  # TODO this is a stopgap to prevent certain refs from failing
            oref = Ref(tref)
        except InputError as e:
            continue
        if getattr(oref.index, 'authors', None) is None: continue
        for author in oref.index.authors:
            by_author[author] += [rd.contents()]
    for author, rd_list in by_author.items():
        rd_list = list(filter(lambda x: x['pagesheetrank'] > min_pr, rd_list))
        if len(rd_list) == 0: continue
        top_rd_indexes = sorted(range(len(rd_list)), key=lambda i: rd_list[i]['pagesheetrank'])[-top_n:]
        top_rds = [rd_list[i] for i in top_rd_indexes]
        for rd in top_rds:
            RefTopicLink({
                "toTopic": author,
                "ref": rd['ref'],
                "linkType": "popular-writing-of",
                "dataSource": "sefaria",
                "generatedBy": "calculate_popular_writings_for_authors",
                "order": {"custom_order": rd['pagesheetrank']}
            }).save()


def recalculate_secondary_topic_data():
    # run before everything else because this creates new links
    calculate_popular_writings_for_authors(100, 300)

    sheet_source_links, sheet_related_links, sheet_topic_links = generate_all_topic_links_from_sheets()
    related_links = update_intra_topic_link_orders(sheet_related_links)
    all_ref_links = update_ref_topic_link_orders(sheet_source_links, sheet_topic_links)

    # now that we've gathered all the new links, delete old ones and insert new ones
    RefTopicLinkSet({"generatedBy": TopicLinkHelper.generated_by_sheets}).delete()
    RefTopicLinkSet({"is_sheet": True}).delete()
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
    make_titles_unique()


def set_all_slugs_to_primary_title():
    # reset all slugs to their primary titles, if they have drifted away
    # no-op if slug already corresponds to primary title
    for t in TopicSet():
        t.set_slug_to_primary_title()

def get_path_for_topic_slug(slug):
    path = []
    while slug in library.get_topic_toc_category_mapping().keys():
        if library.get_topic_toc_category_mapping()[slug] == slug:
            break  # this case occurs when we are at a top level node which has a child with the same name
        path.append(slug)
        slug = library.get_topic_toc_category_mapping()[slug]  # get parent's slug
    path.append(slug)
    return path

def get_node_in_library_topic_toc(path):
    curr_level_in_library_topic_toc = {"children": library.get_topic_toc(), "slug": ""}
    while len(path) > 0:
        curr_node_slug = path.pop()
        for x in curr_level_in_library_topic_toc.get("children", []):
            if x["slug"] == curr_node_slug:
                curr_level_in_library_topic_toc = x
                break

    return curr_level_in_library_topic_toc

def topic_change_category(topic_obj, new_category, old_category="", rebuild=False):
    """
        This changes a topic's category in the topic TOC.  The IntraTopicLink to the topic's parent category
        will be updated to its new parent category.  This function also handles special casing for topics that have
        IntraTopicLinks to themselves and for topics are moved to or from the Main Menu of the TOC.  In cases where
        the Main Menu is involved, the topic_obj's isTopLevelDisplay field is modified.

        :param topic_obj: (model.Topic) the Topic object
        :param new_category: (String) slug of the new Topic category
        :param old_category: (String, optional) slug of old Topic category
        :param rebuild: (bool, optional) whether the topic TOC should be rebuilt
        :return: (model.Topic) the new topic object on success, or None in the case where old_category == new_category
        """
    assert new_category != topic_obj.slug, f"{new_category} should not be the same as {topic_obj.slug}"
    orig_link = IntraTopicLink().load({"linkType": "displays-under", "fromTopic": topic_obj.slug, "toTopic": {"$ne": topic_obj.slug}})
    if old_category == "":
        old_category = orig_link.toTopic if orig_link else Topic.ROOT
        if old_category == new_category:
            logger.warning("To change the category of a topic, new and old categories should not be equal.")
            return None

    link_to_itself = IntraTopicLink().load({"fromTopic": topic_obj.slug, "toTopic": topic_obj.slug, "linkType": "displays-under"})
    had_children_before_changing_category = IntraTopicLink().load({"linkType": "displays-under", "toTopic": topic_obj.slug, "fromTopic": {"$ne": topic_obj.slug}}) is not None
    new_link_dict = {"fromTopic": topic_obj.slug, "toTopic": new_category, "linkType": "displays-under",
                     "dataSource": "sefaria"}

    if old_category != Topic.ROOT and new_category != Topic.ROOT:
        orig_link.load_from_dict(new_link_dict).save()
    elif new_category != Topic.ROOT:
        # old_category is Topic.ROOT, so we are moving down the tree from the Topic.ROOT
        IntraTopicLink(new_link_dict).save()
        topic_obj.isTopLevelDisplay = False
        topic_obj.save()
        if old_category == Topic.ROOT and not had_children_before_changing_category and link_to_itself:
            # suppose a topic had been put at the Topic.ROOT and a self-link was created because the topic had sources.
            # if it now were moved out of the Topic.ROOT, it no longer needs the link to itself
            link_to_itself.delete()
    elif new_category == Topic.ROOT:
        if orig_link:
            # top of the tree doesn't need an IntraTopicLink to its previous parent
            orig_link.delete()

        topic_obj.isTopLevelDisplay = True
        topic_obj.save()

        if getattr(topic_obj, "numSources", 0) > 0 and not had_children_before_changing_category and not link_to_itself:
            # if topic has sources and we dont create an IntraTopicLink to itself, the sources wont be accessible
            # from the topic TOC
            IntraTopicLink({"fromTopic": topic_obj.slug, "toTopic": topic_obj.slug,
                            "dataSource": "sefaria", "linkType": "displays-under"}).save()

    if rebuild:
        rebuild_topic_toc(topic_obj, category_changed=True)
    return topic_obj

def update_topic_titles(topic, title="", heTitle="", **kwargs):
    new_primary = {"en": title, "he": heTitle}
    for lang in ['en', 'he']:   # first remove all titles and add new primary and then alt titles
        for title in topic.get_titles(lang):
            topic.remove_title(title, lang)
        topic.add_title(new_primary[lang], lang, True, False)
        if 'altTitles' in kwargs:
            for title in kwargs['altTitles'][lang]:
                topic.add_title(title, lang)
    return topic


def update_authors_place_and_time(topic, dataSource='learning-team-editing-tool', **kwargs):
    # update place info added to author, then update year and era info
    if not hasattr(topic, 'properties'):
        topic.properties = {}
    process_topic_place_change(topic, **kwargs)
    return update_author_era(topic, dataSource=dataSource, **kwargs)

def update_properties(topic_obj, dataSource, k, v):
    if v == '':
        topic_obj.properties.pop(k, None)
    else:
        topic_obj.properties[k] = {'value': v, 'dataSource': dataSource}

def update_author_era(topic_obj, dataSource='learning-team-editing-tool', **kwargs):
    for k in ["birthYear", "deathYear"]:
        if k in kwargs.keys():   # only change property value if key exists, otherwise it indicates no change
            year = kwargs[k]
            update_properties(topic_obj, dataSource, k, year)

    if 'era' in kwargs.keys():    # only change property value if key is in data, otherwise it indicates no change
        prev_era = topic_obj.properties.get('era', {}).get('value')
        era = kwargs['era']
        update_properties(topic_obj, dataSource, 'era', era)
        if era != '':
            create_era_link(topic_obj, prev_era_to_delete=prev_era)
    return topic_obj


def update_topic(topic, **kwargs):
    """
    Can update topic object's title, hebrew title, category, description, and categoryDescription fields
    :param topic: (Topic) The topic to update
    :param **kwargs can be title, heTitle, category, description, categoryDescription, and rebuild_toc where `title`, `heTitle`,
         and `category` are strings. `description` and `categoryDescription` are dictionaries where the fields are `en` and `he`.
         The `category` parameter should be the slug of the new category. `rebuild_topic_toc` is a boolean and is assumed to be True
    :return: (model.Topic) The modified topic
    """
    old_category = ""
    orig_slug = topic.slug
    update_topic_titles(topic, **kwargs)
    if kwargs.get('category') == 'authors':
        topic = update_authors_place_and_time(topic, **kwargs)

    if 'category' in kwargs and kwargs['category'] != kwargs.get('origCategory', kwargs['category']):
        orig_link = IntraTopicLink().load({"linkType": "displays-under", "fromTopic": topic.slug, "toTopic": {"$ne": topic.slug}})
        old_category = orig_link.toTopic if orig_link else Topic.ROOT
        if old_category != kwargs['category']:
            topic = topic_change_category(topic, kwargs["category"], old_category=old_category)  # can change topic and intratopiclinks

    if kwargs.get('manual', False):
        topic.data_source = "sefaria"  # any topic edited manually should display automatically in the TOC and this flag ensures this
        topic.description_published = True

    if "description" in kwargs or "categoryDescription" in kwargs:
        topic.change_description(kwargs.get("description", None), kwargs.get("categoryDescription", None))

    if "image" in kwargs:
        image_dict = kwargs["image"]
        if image_dict["image_uri"] != "":
            topic.image = kwargs["image"]
        elif hasattr(topic, 'image'):
            # we don't want captions without image_uris, so if the image_uri is blank, get rid of the caption too
            del topic.image

    topic.save()

    if kwargs.get('rebuild_topic_toc', True):
        rebuild_topic_toc(topic, orig_slug=orig_slug, category_changed=(old_category != kwargs.get('category', "")))
    return topic


def rebuild_topic_toc(topic_obj, orig_slug="", category_changed=False):
    if category_changed:
        library.get_topic_toc(rebuild=True)
    else:
        # if just title or description changed, don't rebuild entire topic toc, rather edit library._topic_toc directly
        path = get_path_for_topic_slug(orig_slug)
        old_node = get_node_in_library_topic_toc(path)
        if orig_slug != topic_obj.slug:
            return f"Slug {orig_slug} not found in library._topic_toc."
        old_node.update({"en": topic_obj.get_primary_title(), "slug": topic_obj.slug, "description": topic_obj.description})
        old_node["he"] = topic_obj.get_primary_title('he')
        if hasattr(topic_obj, "categoryDescription"):
            old_node["categoryDescription"] = topic_obj.categoryDescription
    library.get_topic_toc_json(rebuild=True)
    library.get_topic_toc_category_mapping(rebuild=True)

def _calculate_approved_review_state(current, requested, was_ai_generated):
    "Calculates the review state of a description of topic link. Review state of a description can only 'increase'"
    if not was_ai_generated:
        return None
    state_to_num = {
        None: -1,
        "not reviewed": 0,
        "edited": 1,
        "reviewed": 2
    }
    if state_to_num[requested] > state_to_num[current]:
        return requested
    else:
        return current

def _description_was_ai_generated(description: dict) -> bool:
    return bool(description.get('ai_title', ''))

def _get_merged_descriptions(current_descriptions, requested_descriptions):
    from sefaria.utils.util import deep_update
    for lang, requested_description_in_lang in requested_descriptions.items():
        current_description_in_lang = current_descriptions.get(lang, {})
        current_review_state = current_description_in_lang.get("review_state")
        requested_review_state = requested_description_in_lang.get("review_state")
        merged_review_state = _calculate_approved_review_state(current_review_state, requested_review_state, _description_was_ai_generated(current_description_in_lang))
        if merged_review_state:
            requested_description_in_lang['review_state'] = merged_review_state
        else:
            requested_description_in_lang.pop('review_state', None)
    return deep_update(current_descriptions, requested_descriptions)


def edit_topic_source(slug, orig_tref, new_tref="", creating_new_link=True,
                      interface_lang='en', linkType='about', description=None):
    """
    API helper function used by SourceEditor for editing sources associated with topics which are stored as RefTopicLink
    Slug, orig_tref, and linkType define the original RefTopicLink if one existed.
    :param slug: (str) String of topic whose source we are editing
    :param orig_tref (str) String representation of original reference of source.
    :param new_tref: (str) String representation of new reference of source.
    :param linkType: (str) 'about' is used for most topics, except for 'authors' case
    :param description: (dict) Dictionary of title and prompt corresponding to `interface_lang`
    """
    description = description or {}
    topic_obj = Topic.init(slug)
    if topic_obj is None:
        return {"error": "Topic does not exist."}
    ref_topic_dict = {"toTopic": slug, "linkType": linkType, "ref": orig_tref}
    link = RefTopicLink().load(ref_topic_dict)
    link_already_existed = link is not None
    if not link_already_existed:
        link = RefTopicLink(ref_topic_dict)

    if not hasattr(link, 'order'):
        link.order = {}
    if 'availableLangs' not in link.order:
        link.order['availableLangs'] = []
    if interface_lang not in link.order['availableLangs']:
        link.order['availableLangs'] += [interface_lang]
    link.dataSource = 'learning-team'
    link.ref = new_tref

    current_descriptions = getattr(link, 'descriptions', {})
    link.descriptions = _get_merged_descriptions(current_descriptions, {interface_lang: description})

    if hasattr(link, 'generatedBy') and getattr(link, 'generatedBy', "") == TopicLinkHelper.generated_by_sheets:
        del link.generatedBy  # prevent link from getting deleted when topic cronjob runs

    if not creating_new_link and link is None:
        return {"error": f"Can't edit link because link does not currently exist."}
    elif creating_new_link:
        if not link_already_existed:
            num_sources = getattr(topic_obj, "numSources", 0)
            topic_obj.numSources = num_sources + 1
            topic_obj.save()
        if interface_lang not in link.order.get('curatedPrimacy', {}) and linkType == 'about':
            # this will evaluate to false when (1) creating a new link though the link already exists and has a curated primacy
            # or (2) topic is an author (which means linkType is not 'about') as curated primacy is irrelevant to authors
            # this code sets the new source at the top of the topic page, because otherwise it can be hard to find.
            # curated primacy's default value for all links is 0 so set it to 1 + num of links in this language
            num_curr_links = len(RefTopicLinkSet({"toTopic": slug, "linkType": linkType, 'order.availableLangs': interface_lang})) + 1
            if 'curatedPrimacy' not in link.order:
                link.order['curatedPrimacy'] = {}
            link.order['curatedPrimacy'][interface_lang] = num_curr_links

    link.save()
    # process link for client-side, especially relevant in TopicSearch.jsx
    ref_topic_dict = ref_topic_link_prep(link.contents())
    return annotate_topic_link(ref_topic_dict, {slug: topic_obj})

def update_order_of_topic_sources(topic, sources, uid, lang='en'):
    """
    Used by ReorderEditor.  Reorders sources of topics.
    :param topic: (str) Slug of topic
    :param sources: (List) A list of topic sources with ref and order fields.  The first source in the list will have
    its order field modified so that it appears first on the relevant Topic Page
    :param uid: (int) UID of user modifying categories and/or books
    :param lang: (str) 'en' or 'he'
    """

    if AuthorTopic.init(topic):
        return {"error": "Author topic sources can't be reordered as they have a customized order."}
    if Topic.init(topic) is None:
        return {"error": f"Topic {topic} doesn't exist."}
    results = []
    ref_to_link = {}

    # first validate data
    for s in sources:
        try:
             ref = Ref(s['ref']).normal()
        except InputError as e:
            return {"error": f"Invalid ref {s['ref']}"}
        link = RefTopicLink().load({"toTopic": topic, "linkType": "about", "ref": ref})
        if link is None:
            return {"error": f"Link between {topic} and {s['ref']} doesn't exist."}
        order = getattr(link, 'order', {})
        if lang not in order.get('availableLangs', []) :
            return {"error": f"Link between {topic} and {s['ref']} does not exist in '{lang}'."}
        ref_to_link[s['ref']] = link

    # now update curatedPrimacy data
    for display_order, s in enumerate(sources[::-1]):
        link = ref_to_link[s['ref']]
        order = getattr(link, 'order', {})
        curatedPrimacy = order.get('curatedPrimacy', {})
        curatedPrimacy[lang] = display_order
        order['curatedPrimacy'] = curatedPrimacy
        link.order = order
        link.save()
        results.append(link.contents())
    return {"sources": results}


def delete_ref_topic_link(tref, to_topic, link_type, lang):
    """
    :param type: (str) Can be 'ref' or 'intra'
    :param tref: (str) tref of source
    :param to_topic: (str) Slug of topic
    :param lang: (str) 'he' or 'en'
    """
    if Topic.init(to_topic) is None:
        return {"error": f"Topic {to_topic} doesn't exist."}

    topic_link = {"toTopic": to_topic, "linkType": link_type, 'ref': tref}
    link = RefTopicLink().load(topic_link)
    if link is None:
        return {"error": f"Link between {tref} and {to_topic} doesn't exist."}

    if lang in link.order.get('availableLangs', []):
        link.order['availableLangs'].remove(lang)
    if lang in link.order.get('curatedPrimacy', []):
        link.order['curatedPrimacy'].pop(lang)

    if len(link.order.get('availableLangs', [])) > 0:
        link.save()
        return {"status": "ok"}
    else:   # deleted in both hebrew and english so delete link object
        if link.can_delete():
            link.delete()
            return {"status": "ok"}
        else:
            return {"error": f"Cannot delete link between {tref} and {to_topic}."}


def add_image_to_topic(topic_slug, image_uri, en_caption, he_caption):
    """
    A function to add an image to a Topic in the database. Helper for data migration.
    This function queries the desired Topic, adds the image data, and then saves.
    :param topic_slug String: A valid slug for a Topic
    :param image_uri String: The URI of the image stored in the GCP images bucket, in the topics subdirectory.
                             NOTE: Incorrectly stored, or external images, will not pass validation for save
    :param en_caption String: The English caption for a Topic image
    :param he_caption String: The Hebrew caption for a Topic image
    """
    topic = Topic.init(topic_slug)
    topic.image = {"image_uri": image_uri,
                   "image_caption": {
                       "en": en_caption,
                       "he": he_caption
                   }}
    topic.save()