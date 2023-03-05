"""
Import descriptions from a CSV
Each record has fields "Topic Slug","Ref","Title for source", "Learning Prompt", and "Intro" 
Load RefTopicLink objects according to the combined key of "Topic Slug" and "Ref"
Set the other three fields using the method RefTopicLink.set_description(self, lang, title, prompt, primacy=0)
Save the RefTopicLink

(Initial draft from these instructions by GPT3)
"""

# -*- coding: utf-8 -*-
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
    with open(filename, 'r') as csvfile:
        reader = csv.DictReader(csvfile)
        for row in reader:
            topic_slug = row['Topic Slug']
            ref = Ref(row['Ref']).normal()
            title = row['Title for source']
            prompt = row['Learning Prompt']
            intro = 100 if row['Intro'] == "Y" or row['Intro'] == "y" else 80
            if not topic_slug or not ref or not title or not prompt or not intro:
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
                            "en": intro if lang == "en" else 0,
                            "he": intro if lang == "he" else 0
                        }
                    }
                }
                rtl = RefTopicLink(d)
            else:
                if not rtl.order.get("curatedPrimacy"):
                    rtl.order["curatedPrimacy"] = {"en": 0, "he": 0}
                rtl.order["curatedPrimacy"][lang] = intro
            rtl.set_description(lang, title, prompt)
            rtl.save()

if __name__ == "__main__":
    set_topic_datasource()
    import_descriptions("/Users/levisrael/Desktop/prompts.csv", "en")