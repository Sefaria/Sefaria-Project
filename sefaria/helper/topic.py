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

