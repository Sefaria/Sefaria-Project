import django
django.setup()
import re
import sys

from sefaria.system.database import db
from sefaria.helper.text import merge_text_versions

i = 1
test_run = False
while(i < len(sys.argv)):
    if sys.argv[i] == "--test":
        test_run=True
    i+=1

# clean existing titles
toCleanAndMerge = db.texts.find({"versionTitle": {"$regex": r"\[[a-z]{2}\].+$"}})
for item in toCleanAndMerge:
    cleanedTitle = re.search(r"^(.+?\[[a-z]{2}\]).+$", item["versionTitle"]).group(1)
    existingObject = db.texts.find_one({"versionTitle": cleanedTitle, "title": item["title"], "language": item["language"]})
    if existingObject:
        if test_run:
            print("merge text versions: " + cleanedTitle + " and " + item["versionTitle"])
        else:
            merge_text_versions(cleanedTitle, item["versionTitle"], item["title"], item["language"])
    else:
        if test_run:
            print("update title " + item["versionTitle"] + " with " + cleanedTitle)
        else:
            db.texts.find_one_and_update({"_id": item["_id"] }, {"$set": {"versionTitle": cleanedTitle}})

# update actualLanguage
cursor = db.texts.find({"versionTitle": {"$regex": "\[[a-z]{2}\]$"}})
for item in cursor:
    language = re.search(r"\[([a-z]{2})\]$", item["versionTitle"])
    if language:
        if test_run:
            print("Update realLaanguage of " + item["versionTitle"])
        else:
            db.texts.find_one_and_update({"_id": item["_id"] }, {"$set": {"actualLanguage": language.group(1)}})

enOrHe = db.texts.find({"versionTitle": {"$regex": r"^((?!\[[a-z]{2}\]).)*$"}})
for item in enOrHe:
    if item["language"] not in ["en", "he"]:
        print("unexpected value " + item["language"])
    if test_run:
        print("Setting language to " + item["language"])
    else:
        db.texts.find_one_and_update({"_id": item["_id"] }, {"$set": {"actualLanguage": item["language"]}})