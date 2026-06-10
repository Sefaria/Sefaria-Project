# -*- coding: utf-8 -*-
import argparse
import django
django.setup()
from sefaria.system.database import db
from sefaria.model import *
from sefaria.system.cache import django_cache
from sefaria.model.link import get_book_link_collection, get_link_counts
from sefaria.settings import USE_VARNISH
if USE_VARNISH:
    from sefaria.system.varnish.common import purge_url
    from sefaria.settings import FRONT_END_URL


def regenerate_version_status_tree():
    for lang in [None, "he", "en"]:
        django_cache(action="set", cache_type="persistent", cache_prefix='version_status_tree_api', decorate_data_with_key=True)(library.simplify_toc)(lang=lang if lang else "")
    if USE_VARNISH:
        for lang in ["he", "en"]:
            purge_url(f"{FRONT_END_URL}/api/texts/version-status/tree/{lang}")
        purge_url(f"{FRONT_END_URL}/api/texts/version-status/tree/")


def regenerate_bare_links_api(cat1, cat2):
    cat1idxs = library.get_indexes_in_corpus(cat1) or library.get_indexes_in_category(cat1)
    cat2idxs = library.get_indexes_in_corpus(cat2) or library.get_indexes_in_category(cat2)
    for c1idx in cat1idxs:
        print("bare_link_api:, Book: {}, Category: {}".format(c1idx, cat2))
        django_cache(action="set", cache_type="persistent", cache_prefix='bare_link_api', decorate_data_with_key=True)(get_book_link_collection)(book=c1idx, cat=cat2)
        if USE_VARNISH:
            purge_url(f"{FRONT_END_URL}/api/links/bare/{c1idx}/{cat2}")
    for c2idx in cat2idxs:
        print("bare_link_api:, Book: {}, Category: {}".format(c2idx, cat1))
        django_cache(action="set", cache_type="persistent", cache_prefix='bare_link_api', decorate_data_with_key=True)(get_book_link_collection)(book=c2idx, cat=cat1)
        if USE_VARNISH:
            purge_url(f"{FRONT_END_URL}/api/links/bare/{c2idx}/{cat1}")


def regenerate_link_count_api(cat1, cat2):
    print("link_count_api:, Category1: {}, Category2: {}".format(cat1, cat2))
    django_cache(action="set", cache_type="persistent", cache_prefix='link_count_api', decorate_data_with_key=True)(get_link_counts)(cat1=cat1, cat2=cat2)
    if USE_VARNISH:
        purge_url(f"{FRONT_END_URL}/api/counts/links/{cat1}/{cat2}")


def regenerate_all_used():
    print("Regenerating all pairs currently used in Link Explorer")
    used_pairs = (
        ("Tanakh", "Bavli"),
        ("Bavli", "Mishneh Torah"),
        ("Bavli", "Shulchan Arukh"),
        ("Mishneh Torah", "Shulchan Arukh"),
        ("Tanakh", "Midrash Rabbah"),
        ("Tanakh", "Mishneh Torah"),
        ("Tanakh", "Shulchan Arukh"),
    )
    for pair in used_pairs:
        regenerate_bare_links_api(pair[0], pair[1])
        regenerate_link_count_api(pair[0], pair[1])

    regenerate_version_status_tree()


""" The main function, runs when called from the CLI"""
if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument("--cat1", help="first category of text to calculate bare links")
    parser.add_argument("--cat2", help="second category of text to calculate bare links")
    parser.add_argument("--vertree", action='store_true', help="regenerate version status trees")
    parser.add_argument("--all", action='store_true', help="run for all categories currently used in the link explorer")
    args = parser.parse_args()
    print(args)
    if args.all:
        regenerate_all_used()
    else:
        if args.cat1 and args.cat2:
            regenerate_bare_links_api(args.cat1, args.cat2)
            regenerate_link_count_api(args.cat1, args.cat2)
        if args.vertree:
            regenerate_version_status_tree()

