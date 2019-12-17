import re
from collections import defaultdict
from sefaria.model import *
import logging
logger = logging.getLogger(__name__)


def get_topics(topic, with_links, annotate_links, with_refs):
    topic_obj = Topic().load({"slug": topic})
    response = topic_obj.contents()
    response['primaryTitle'] = {
        'en': topic_obj.get_primary_title('en'),
        'he': topic_obj.get_primary_title('he')
    }
    intra_link_query = {"$or": [{"fromTopic": topic}, {"toTopic": topic}]}
    if with_links and with_refs:
        # can load faster by querying `topic_links` query just once
        all_links = TopicLinkSetHelper.find(intra_link_query)
        intra_links = [l.contents() for l in all_links if isinstance(l, IntraTopicLink)]
        response['refs'] = [l.contents() for l in all_links if isinstance(l, RefTopicLink)]
    else:
        if with_links:
            intra_links = [l.contents() for l in IntraTopicLinkSet(intra_link_query)]
        if with_refs:
            response['refs'] = [l.contents() for l in RefTopicLinkSet({"toTopic": topic})]
    if with_links:
        response['links'] = {}
        from_topic_set = set()  # duplicates can crop up for symmetric edges b/c of $or query
        for link in intra_links:
            is_inverse = link['toTopic'] == topic
            other_topic_slug = link['fromTopic'] if is_inverse else link['toTopic']
            if other_topic_slug in from_topic_set:
                continue
            from_topic_set.add(other_topic_slug)
            del link['toTopic']
            del link['class']
            link['fromTopic'] = other_topic_slug
            link_type = library.get_link_type(link['linkType'])
            link['linkType'] = link_type.inverseSlug if is_inverse else link_type.slug
            link['isInverse'] = is_inverse
            if annotate_links:
                # add display information
                other_topic = Topic().load({"slug": other_topic_slug})
                if other_topic is None:
                    logger.warning("Topic slug {} doesn't exist. Linked to {}".format(other_topic_slug, topic))
                    continue
                link["fromTopicTitle"] = {
                    "en": other_topic.get_primary_title('en'),
                    "he": other_topic.get_primary_title('he')
                }
            if link['linkType'] in response['links']:
                response['links'][link['linkType']]['links'] += [link]
            else:
                response['links'][link['linkType']] = {
                    'links': [link],
                    'title': link_type.inverseDisplayName if is_inverse else link_type.displayName,
                    'shouldDisplay': getattr(link_type, 'shouldDisplay', True)
                }
    return response


def generate_topic_links_from_sheets():
    """
    Processes all public source sheets to create topic links.
    """
    from sefaria.system.database import db
    from sefaria.recommendation_engine import RecommendationEngine
    from tqdm import tqdm

    RefTopicLinkSet({"generatedBy": "sheet-topic-aggregator"}).delete()
    all_topics = {}
    results = []
    query = {"status": "public", "viaOwner": {"$exists": 0}, "assignment_id": {"$exists": 0}}
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
                                "related_topics_dict": defaultdict(int)
                            }
            for tref in sheet.get("includedRefs", []):
                try:
                    oref = Ref(tref)
                    for sub_oref in oref.range_list():
                        all_topics[slug]["sources_dict"][sub_oref.normal()].add(sheet['owner'])
                except:
                    continue
            # for related_topic_dict in sheet_topics:
            #     if slug != related_topic_dict['slug']:
            #         all_topics[slug]["related_topics_dict"][related_topic_dict['slug']] += 1

    for slug, blob in tqdm(all_topics.items(), desc="creating sheet topic links"):
        # related_topics_dict = blob['related_topics_dict']

        # filter sources with less than 3 users who added it
        sources = [source for source in blob['sources_dict'].items() if len(source[1]) >= 3]

        # transform data to more convenient format
        temp_sources = []
        for source in sources:
            temp_sources += [(Ref(source[0]), len(source[1]))]
        sources = temp_sources

        # cluster refs that are close to each other
        temp_sources = []
        if len(sources) == 0:
            continue
        refs, counts = zip(*sources)
        clustered = RecommendationEngine.cluster_close_refs(refs, counts, 2)
        for cluster in clustered:
            ranged_ref = cluster[0]['ref'].to(cluster[-1]['ref'])
            counts = [x['data'] for x in cluster]
            avg_count = sum(counts) / len(cluster)
            max_count = max(counts)
            if max_count >= 4:
                temp_sources += [(ranged_ref.normal(), [r.normal() for r in ranged_ref.range_list()], avg_count)]
            # else:
            #     print("Rejected!", max_count, slug, ranged_ref.normal())
        sources = temp_sources

        # create links
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
                "magnitude": source[2]
            })
            rtl.save()
        # related_topics = sorted(iter(related_topics_dict.items()), key=lambda k_v1: k_v1[1], reverse=True)
        # related_topics = [topic for topic in related_topics if topic[0] in topics]


def calculate_mean_tfidf():
    import math
    from sefaria.system.exceptions import InputError
    from sefaria.utils.hebrew import strip_cantillation
    from tqdm import tqdm
    
    def preprocess_word(w):
        return re.sub(r'^\u05d5', '', w.replace('"', ''))
    
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
            try:
                text = TextChunk._strip_itags(oref.text('he').as_string())
            except AttributeError:
                print("Attrib", l.ref)
                continue
            text = strip_cantillation(text, strip_vowels=True)
            text = re.sub('<[^>]+>', ' ', text)
            text = re.sub(r'[־\-()]', ' ', text)
            words = []
            if len(text) != 0:
                # text = requests.post('https://prefix.dicta.org.il/api', data=json.dumps({'data': text})).text
                # text = re.sub(r'(?<=\s|"|\(|\[|-)[\u05d0-\u05ea]+\|', '', ' ' + text)  # remove prefixes
                text = re.sub(r'[^\u05d0-\u05ea"]', ' ', text)
                words = list(filter(lambda w: w not in stopwords, [preprocess_word(w) for w in text.split()]))
            ref_words_map[l.ref] = words

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
    for topic, ref_list in ref_topic_map.items():
        tfidf_dict = defaultdict(int)
        for tref in ref_list:
            words = ref_words_map.get(tref, [])
            for w in words:
                tfidf_dict[w] += 1
        for w, tf in tfidf_dict.items():
            tfidf_dict[w] = tf * idf_dict[w]
        for tref in ref_list:
            words = ref_words_map.get(tref, [])
            if len(words) == 0:
                continue
            topic_tref_score_map[(topic, tref)] = sum(tfidf_dict[w] for w in words)/len(words)

    return topic_tref_score_map, ref_topic_map


def calculate_other_ref_scores(ref_topic_map):
    from sefaria.system.exceptions import InputError
    from tqdm import tqdm
    
    LANGS_CHECKED = ['en', 'he']
    num_datasource_map = {}
    langs_available = {}
    ref_order_map = {}
    for topic, ref_list in tqdm(ref_topic_map.items(), desc='calculate other ref scores'):
        seg_ref_counter = defaultdict(int)
        tref_range_lists = {}
        for tref in ref_list:
            try:
                oref = Ref(tref)
            except InputError:
                continue
            tref_range_lists[tref] = [seg_ref.normal() for seg_ref in oref.range_list()]
            ref_order_map[(topic, tref)] = oref.order_id()
            langs_available[(topic, tref)] = [lang for lang in LANGS_CHECKED if oref.is_text_fully_available(lang)]
            for seg_ref in tref_range_lists[tref]:
                seg_ref_counter[seg_ref] += 1
        for tref in ref_list:
            range_list = tref_range_lists.get(tref, None)
            num_datasource_map[(topic, tref)] = 0 if range_list is None else max(seg_ref_counter[seg_ref] for seg_ref in range_list)
    return num_datasource_map, langs_available, ref_order_map


def update_link_orders():
    from tqdm import tqdm
    from sefaria.system.database import db
    topic_tref_score_map, ref_topic_map = calculate_mean_tfidf()
    num_datasource_map, langs_available, ref_order_map = calculate_other_ref_scores(ref_topic_map)
    ref_topic_links = RefTopicLinkSet()
    total = ref_topic_links.count()
    for l in tqdm(ref_topic_links, total=total, desc='update link orders'):
        if l.is_sheet:
            sheet = db.sheets.find_one({"id": int(l.ref.replace("Sheet ", ""))}, {"views": 1})
            setattr(l, 'order', {'views': sheet.get('views', 0)})
        else:
            key = (l.toTopic, l.ref)
            try:
                setattr(l, 'order', {
                    'tfidf': topic_tref_score_map[key],
                    'numDatasource': num_datasource_map[key],
                    'availableLangs': langs_available[key],
                    'ref': ref_order_map[key]
                })
            except KeyError:
                print("Key Error", key)
                continue
        l.save()

