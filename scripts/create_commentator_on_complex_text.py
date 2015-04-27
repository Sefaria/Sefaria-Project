# -*- coding: utf-8 -*-

import argparse


""" The main function, runs when called from the CLI"""
if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument("commentator_name", help="commentator's name")
    parser.add_argument("existing_book", help="title of existing index record for the comemntary")
    parser.add_argument("language", help="version language", choices=['en', 'he'])
    parser.add_argument("version_title", help="version title for the new version")
    parser.add_argument("version_source", help="version source for the new version")
    args = parser.parse_args()
    print args
    try:
        from sefaria.helper.text import create_commentator_and_commentary_version
        from sefaria.system import cache as scache
        create_commentator_and_commentary_version(args.commentator_name, args.existing_book, args.language, args.version_title,
                                                  args.version_source)
        scache.reset_texts_cache()
    except Exception as e:
        print "{} exiting.".format(e)