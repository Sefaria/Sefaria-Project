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
        for link in intra_links:
            is_inverse = link['toTopic'] == topic
            other_topic_slug = link['fromTopic'] if is_inverse else link['toTopic']
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
