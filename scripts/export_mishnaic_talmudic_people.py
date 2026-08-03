"""
Export a CSV of every person topic that is-a `mishnaic-people` or `talmudic-people`
(per IntraTopicLinks with linkType `is-a`).

Columns: slug, en, he, alt titles (comma separated), related people (comma separated)

The "related people" column only includes topics connected via an IntraTopicLink
(any linkType other than `is-a`) that are themselves mishnaic-people or talmudic-people.

Usage:
    ./run scripts/export_mishnaic_talmudic_people.py -o data/private/mishnaic_talmudic_people.csv
"""
import django
django.setup()
import argparse
import csv
from sefaria.model import *

PEOPLE_CATEGORIES = ('mishnaic-people', 'talmudic-people')


def get_person_slugs():
    slugs = set()
    for category in PEOPLE_CATEGORIES:
        for link in IntraTopicLinkSet({'linkType': 'is-a', 'toTopic': category}):
            slugs.add(link.fromTopic)
    return slugs


def get_related_people_by_slug(person_slugs):
    related = {slug: set() for slug in person_slugs}
    links = IntraTopicLinkSet({
        'linkType': {'$ne': 'is-a'},
        '$or': [
            {'fromTopic': {'$in': list(person_slugs)}},
            {'toTopic': {'$in': list(person_slugs)}},
        ],
    })
    for link in links:
        from_slug, to_slug = link.fromTopic, link.toTopic
        if from_slug in person_slugs and to_slug in person_slugs:
            related[from_slug].add(to_slug)
            related[to_slug].add(from_slug)
    return related


def make_csv(out_file):
    person_slugs = get_person_slugs()
    related_by_slug = get_related_people_by_slug(person_slugs)

    topics_by_slug = {}
    for slug in person_slugs:
        topic = Topic.init(slug)
        if topic is not None:
            topics_by_slug[slug] = topic

    rows = []
    for slug in sorted(topics_by_slug.keys()):
        topic = topics_by_slug[slug]
        alt_titles = topic.title_group.secondary_titles('en') + topic.title_group.secondary_titles('he')
        related_names = sorted(
            topics_by_slug[related_slug].get_primary_title('en')
            for related_slug in related_by_slug[slug]
            if related_slug in topics_by_slug
        )
        rows.append({
            'slug': slug,
            'en': topic.get_primary_title('en'),
            'he': topic.get_primary_title('he'),
            'alt titles': ', '.join(alt_titles),
            'related people': ', '.join(related_names),
        })

    with open(out_file, 'w', newline='', encoding='utf-8') as fout:
        writer = csv.DictWriter(fout, fieldnames=['slug', 'en', 'he', 'alt titles', 'related people'])
        writer.writeheader()
        writer.writerows(rows)

    print(f"Wrote {len(rows)} rows to {out_file}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument('-o', '--outfile', required=True, help='Path to output CSV file')
    args = parser.parse_args()
    make_csv(args.outfile)
