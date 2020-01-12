# NOTE not in dependencies.py. to install run `pip install langdetect`
from langdetect import detect
import bleach
import unicodecsv as csv
from sefaria.model import *
from functools import reduce

non_english = []
versions = VersionSet()
for v in versions:
    try:
        if v.language == 'en':
            contents = v.contents()['chapter']
            if type(contents) is dict:
                print(v.title, v.versionTitle, 'dict')
                continue
            if len(contents) > 0:
                while type(contents) is list:
                    initial = [] if type(contents[0]) is list else ""
                    contents = reduce(lambda a, b: a+b, contents, initial)
                if len(contents) > 0:
                    trimmed = contents[:contents.find(" ", 1000)]
                    trimmed = bleach.clean(trimmed, tags=[], strip=True)
                    detected = detect(trimmed)
                    if detected != 'en':
                        temp_dict = {"Title": v.title, "Version Title": v.versionTitle, "Possible Language": detected}
                        print(temp_dict)
                        non_english += [temp_dict]
    except Exception as e:
        print("Skipping", v.title, v.versionTitle)
        print(e)
        continue

with open("non_english_versions.csv", "wb") as fout:
    writer = csv.DictWriter(fout, ["Title", "Version Title", "Possible Language"])
    writer.writeheader()
    writer.writerows(non_english)
