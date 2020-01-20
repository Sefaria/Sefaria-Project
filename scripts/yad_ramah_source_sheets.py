import django
django.setup()
from sefaria.model import *
from sefaria.system.database import db
import csv
if __name__ == "__main__":
    f = open("./data/yad_ramah.csv")
    actual_sources = {}
    csv_reader = csv.reader(f)
    for row in csv_reader:
        id, old, new = row
        id = int(id)
        if id not in list(actual_sources.keys()):
            actual_sources[id] = {}
        actual_sources[id][old] = new
    sheets = db.sheets.find()

    for sheet in sheets:
        if "id" not in list(sheet.keys()):
            id = -1
        else:
            id = sheet["id"]
        if "id" not in list(sheet.keys()) or id not in list(actual_sources.keys()):
            continue
        print(id)
        sources = sheet.get("sources", [])
        for source_n, source in enumerate(sources):
            if "ref" in list(source.keys()) and source["ref"].startswith("Yad Ramah on Bava Batra"):
                orig_source_ref = source["ref"]
                assert actual_sources[id][orig_source_ref]
                sheet["sources"][source_n]["ref"] = actual_sources[id][orig_source_ref]
                sheet["sources"][source_n]["heRef"] = Ref(actual_sources[id][orig_source_ref]).he_normal()
                print("NEW:")
                print(sheet["sources"][source_n]["ref"])
                print(sheet["sources"][source_n]["heRef"])
                db.sheets.save(sheet)
