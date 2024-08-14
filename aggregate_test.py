import django
django.setup()
from sefaria.model import *

REVISED_FUNC_NAME = "aggregate_authors_indexes_by_category2"


if __name__ == '__main__':
    author_topics = TopicSet({"subclass": "author"}).array()
    output_old = []
    output_new = []
    for author in author_topics:
        output_old += author.aggregate_authors_indexes_by_category()
        output_new += getattr(author, REVISED_FUNC_NAME, None)()
    print(output_new == output_old)