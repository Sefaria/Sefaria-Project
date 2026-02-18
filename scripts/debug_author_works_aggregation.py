#!/usr/bin/env python3
import json
import sys

import django

django.setup()

from sefaria.model.topic import AuthorTopic  # noqa: E402


def main():
    slug = sys.argv[1] if len(sys.argv) > 1 else "jonathan-sacks"
    topic = AuthorTopic.init(slug)
    if topic is None:
        print(f"AuthorTopic not found for slug: {slug}")
        sys.exit(1)

    results = topic.get_aggregated_urls_for_authors_indexes()
    print(json.dumps(results, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
