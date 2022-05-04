import django
django.setup()
import re

from sefaria.system.database import db

#TODO: clean existing titles

cursor = db.texts.find({"versionTitle": {"$regex": "\[[a-z]{2}\]$"}})
for item in cursor:
    language = re.search("\[([a-z]{2})\]$", item["versionTitle"])
    if language:
        db.texts.find_one_and_update({"_id": item["_id"] }, {"realLanguage": language.group(1)})
