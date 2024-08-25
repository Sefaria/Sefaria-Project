import django
django.setup()
from sefaria.model import *

REVISED_FUNC_NAME = "get_aggregated_urls_for_authors_indexes2"


if __name__ == '__main__':
    author_topics = TopicSet({"subclass": "author"}).array()
    output_old = []
    output_new = []
    for author in author_topics:
        # if author.slug != "isaac-abarbanel":
        #     continue
        output_old += author.get_aggregated_urls_for_authors_indexes()
        output_new += getattr(author, REVISED_FUNC_NAME, None)()
    print(output_new == output_old)