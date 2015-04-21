# -*- coding: utf-8 -*-

from sefaria.model import *
from sefaria.model.schema import *
from sefaria.summaries import update_summaries


import json
import argparse



def create_commentator_and_commentary_version(commentator_name, existing_book, lang, vtitle):
    existing_index = Index().load({'title':existing_book})
    if existing_index is None:
        raise ValueError('{} is not a name of an existing text!'.format(existing_book))

    commentator_index = Index().load({'title':commentator_name})
    if commentator_index is None:
        index_json = {
            "title":commentator_name,
            "titleVariants":[],
            "heTitleVariants":[],
            "categories":["Commentary"],
            "sectionNames":["",""],
            "maps":[]
        }
        commentator_index = Index(index_json)
        commentator_index.save()

    new_version = Version(
                {
                    "chapter": existing_index.nodes.create_skeleton(),
                    "versionTitle": vtitle,
                    "versionSource": '',
                    "language": lang,
                    "title": "{} on {}".format(commentator_name, existing_book)
                }
    ).save()

    update_summaries()




















""" The main function, runs when called from the CLI"""
if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument("commentator_name", help="commentator's name")
    parser.add_argument("existing_book", help="title of existing index record for the comemntary")
    parser.add_argument("language", help="version language", choices=['en', 'he'])
    parser.add_argument("version_title", help="version title for the new version")
    args = parser.parse_args()
    print args
    try:
        create_commentator_and_commentary_version(args.commentator_name, args.existing_book, args.language, args.version_title)
    except Exception as e:
        print "{} exiting.".format(e)