import django
django.setup()
from sefaria.model import *
from tqdm import tqdm
from sefaria.system.exceptions import DuplicateRecordError, InputError
import regex as re
import json

# This script runs over the collections related to Topics:
# and validates that the data is logical with the model and consistent
# based on the validation functions that are placed in the model methods themselves


def topicLinkType_validation():
    for tlt in tqdm(TopicLinkTypeSet({})):
        try:
            tlt.save()
        except AssertionError as e:
            print(e)


def refTopicLink_validation():
    for rtl in tqdm(RefTopicLinkSet({})):
        try:
            rtl.save()
        except AssertionError as e:
            print(e)
        except DuplicateRecordError as e:
            print(e)
            rtl.delete()
            print("deleted link from {} to {} was deleted".format(rtl.ref, rtl.Totopic))
        except InputError as e:
            print(e)


def intraTopicLink_validation():
    missing_topics = set()
    deleted_data = []
    for itl in tqdm(IntraTopicLinkSet({})):
        try:
            itl.save()
        except AssertionError as e:
            print(e)
            match = re.search("fromTopic '(.*?)' does not exist", e.args[0])
            if match:
                missing_topics.add(match.group(1))
        except DuplicateRecordError as e:
            deleted_data.append(itl.contents())
            itl.delete()

    print(missing_topics)
    with open('./deleted_duplicate_links.txt', 'w') as outfile:
        json.dump(deleted_data, outfile)


if __name__ == "__main__":
    topicLinkType_validation()
    refTopicLink_validation()
    intraTopicLink_validation()
