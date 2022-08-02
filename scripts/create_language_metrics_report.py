import django
django.setup()

from sefaria.system.database import db
import csv

distinctLanguages = db.texts.distinct("actualLanguage")
with open("language_metrics_report.csv", "a") as fout:
    fout.truncate(0)
    writer = csv.writer(fout)
    writer.writerow(["Language (ISO Code)", "Text Count", "Text List"])

    for lang in distinctLanguages:
        texts = db.texts.aggregate([{"$match": {"actualLanguage":lang}},
        {"$lookup": {
                "from": "index",
                "localField": "title",
                "foreignField": "title",
                "as": "titles"
            }}])
        text_list = [text["title"] for text in texts]
        writer.writerow([lang, len(text_list), "; ".join(text_list)])
        