import os
import sys

import pymongo
from config import *

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


connection = pymongo.Connection()
db = connection[SEFARIA_DB]


for i in db.index.find():

    cat = i["categories"][0]

    if cat == "Tanach":
        i["sectionNames"] = ["Chapter", "Verse"]

    elif cat == "Mishna":
        i["sectionNames"] = ["Chapter", "Mishna"]

    elif cat == "Talmud":
        i["sectionNames"] = ["Daf", "Line"]

    elif cat == "Midrash":
        i["sectionNames"] = ["Chapter", "Paragraph"]

    i["maps"] = []

    db.index.save(i)
