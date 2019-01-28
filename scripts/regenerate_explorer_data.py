# -*- coding: utf-8 -*-
import argparse
import django
django.setup()
from sefaria.system.database import db
from sefaria.model import *
from sefaria.system.cache import django_cache
from sefaria.model.link import get_book_link_collection, get_link_counts



def redo_bare_links_api(cat1, cat2):
    cat1idxs = library.get_indexes_in_category(cat1)
    cat2idxs = library.get_indexes_in_category(cat2)
    for c1idx in cat1idxs:
        print "bare_link_api:, Book: {}, Category: {}".format(c1idx, cat2)
        django_cache(action="set", cache_prefix='bare_link_api')(get_book_link_collection)(book=c1idx, cat=cat2)
    for c2idx in cat2idxs:
        print "bare_link_api:, Book: {}, Category: {}".format(c2idx, cat1)
        django_cache(action="set", cache_prefix='bare_link_api')(get_book_link_collection)(book=c2idx, cat=cat1)


def redo_link_count_api(cat1, cat2):
    print "link_count_api:, Category1: {}, Category2: {}".format(cat1, cat2)
    django_cache(action="set", cache_prefix='link_count_api')(get_link_counts)(cat1=cat1, cat2=cat2)









""" The main function, runs when called from the CLI"""
if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument("--cat1", help="first category of text to calculate bare links")
    parser.add_argument("--cat2", help="second category of text to calculate bare links")
    args = parser.parse_args()
    redo_bare_links_api(args.cat1, args.cat2)
    redo_link_count_api(args.cat1, args.cat2)