# NOTE not in dependencies.py. to install run `pip install langdetect`
from langdetect import detect
import bleach
import unicodecsv as csv
from sefaria.model import *

non_english = []
versions = VersionSet()
for v in versions:
    try:
        if v.language == u'en':
            contents = v.contents()['chapter']
            if type(contents) is dict:
                print v.title, v.versionTitle, 'dict'
                continue
            if len(contents) > 0:
                while type(contents) is list:
                    initial = [] if type(contents[0]) is list else u""
                    contents = reduce(lambda a, b: a+b, contents, initial)
                if len(contents) > 0:
                    trimmed = contents[:contents.find(u" ", 1000)]
                    trimmed = bleach.clean(trimmed, tags=[], strip=True)
                    detected = detect(trimmed)
                    if detected != 'en':
                        temp_dict = {u"Title": v.title, u"Version Title": v.versionTitle, u"Possible Language": detected}
                        print temp_dict
                        non_english += [temp_dict]
    except Exception as e:
        print "Skipping", v.title, v.versionTitle
        print e
        continue

with open("non_english_versions.csv", "wb") as fout:
    writer = csv.DictWriter(fout, [u"Title", u"Version Title", u"Possible Language"])
    writer.writeheader()
    writer.writerows(non_english)
