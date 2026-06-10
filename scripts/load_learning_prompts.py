# -*- coding: utf-8 -*-
"""
Import descriptions from a CSV
Each record has fields "Topic Slug","Ref","Title for source", "Learning Prompt", and "Intro" 
Load RefTopicLink objects according to the combined key of "Topic Slug" and "Ref"
Set the other three fields using the method RefTopicLink.set_description(self, lang, title, prompt, primacy=0)
Save the RefTopicLink

(Initial draft from these instructions by GPT3)
"""

import os
import csv
import django
django.setup()
from sefaria.model import *

SOURCE_SLUG = "learning-team"

def set_topic_datasource():
    tds_json = {
        "slug": SOURCE_SLUG,
        "displayName": {
            "en": "Curation of the Sefaria Learning Team",
            "he": "איסוף ועריכה של צוות החינוך בספריא"
        }
    }
    tds = TopicDataSource().load({"slug": SOURCE_SLUG})
    if tds is None:
        TopicDataSource(tds_json).save()


def import_descriptions(filename, lang):
    high_primacy = 100
    default_primacy = 50
    with open(filename, 'r') as csvfile:
        reader = csv.DictReader(csvfile)
        for row in reader:
            topic_slug = row['Topic Slug'].strip()
            try:
                ref = Ref(row['Ref']).normal()
            except:
                if row['Ref']:
                    print(f"Bad Ref: {row['Ref']}")
                continue
            title = row['Title']
            prompt = row['Prompt']
            if row['Intro'] == "Y" or row['Intro'] == "y":
                primacy = high_primacy
            else:
                primacy = default_primacy
            if not topic_slug or not ref or not title or not prompt:
                print("Skipping row with missing data: {}".format(row))
                continue
            print(f'{topic_slug} {ref}')
            rtl = RefTopicLink().load({"toTopic": topic_slug, "ref": ref})
            if not rtl:
                d = {
                    "toTopic": topic_slug,
                    "linkType": "about",
                    "dataSource": SOURCE_SLUG,
                    "class": "refTopic",
                    "ref": ref,
                    "order": {
                        "curatedPrimacy": {
                            "en": primacy if lang == "en" else 0,
                            "he": primacy if lang == "he" else 0
                        }
                    }
                }
                rtl = RefTopicLink(d)
            else:
                if not rtl.order.get("curatedPrimacy"):
                    rtl.order["curatedPrimacy"] = {"en": 0, "he": 0}
                rtl.order["curatedPrimacy"][lang] = primacy
            rtl.set_description(lang, title, prompt)
            try:
                rtl.save()
            except AssertionError as e:
                print(e)


if __name__ == "__main__":
    set_topic_datasource()
    en_file = os.getenv("EN")
    if en_file:
        import_descriptions(en_file, "en")
    he_file = os.getenv("HE")
    if he_file:
        import_descriptions(he_file, "he")

    '''
    export EN='/Users/levisrael/Downloads/Learning Prompts for Spring 2023 - English - Sheet1.csv'
    export HE='/Users/levisrael/Downloads/Learning Prompts for Spring 2023 - Hebrew - Sheet1.csv'
    '''