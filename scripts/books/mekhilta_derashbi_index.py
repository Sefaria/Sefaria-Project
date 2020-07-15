# -*- coding: utf-8 -*-

import sys
import urllib.request, urllib.parse, urllib.error
import urllib.request, urllib.error, urllib.parse
from urllib.error import URLError, HTTPError
import json

sys.path.append("C:\\Users\\Izzy\\git\\Sefaria-Project")
from sefaria.model import *

apikey = ''
server = 'dev.sefaria.org'

def post_texts_api(text_obj, ref):
    url = 'http://' + server + '/api/v2/raw/index/{}'.format(ref)
    json_text = json.dumps(text_obj)
    values = {
        'json': json_text,
        'apikey': apikey
    }
    data = urllib.parse.urlencode(values)
    req = urllib.request.Request(url, data)
    try:
        response = urllib.request.urlopen(req)
        print(response.read())
    except HTTPError as e:
        print('Error code: ', e.code)
        print(e.read())

root = SchemaNode()
root.add_title("Mekhilta DeRabbi Shimon Bar Yochai", "en", primary=True)
root.add_title("Mekhilta DeRabbi Shimon", "en", primary=False)
root.add_title("Mekhilta DeRashbi", "en", primary=False)
root.add_title("מכילתא דרבי שמעון בר יוחאי", "he", primary=True)
root.add_title("מכילתא דרבי שמעון ", "he", primary=False)
root.add_title("מכילתא דרשב\"י", "he", primary=False)
root.key = "Mekhilta DeRabbi Shimon Bar Yochai"

# Main Body of the text
main_body = JaggedArrayNode()
main_body.depth = 2
main_body.sectionNames = ["Chapter", "Verse"]
main_body.addressTypes = ["Integer", "Integer"]
main_body.default=True
main_body.key = "default"

# Additions
additions = JaggedArrayNode()
additions.add_title("הוספה", "he", primary=True)
additions.add_title("Additions", "en", primary=True)
additions.depth = 2
additions.sectionNames = ["Chapter", "Verse"]
additions.addressTypes = ["Integer", "Integer"]
additions.key = "Additions"

root.append(main_body)
root.append(additions)

root.validate()

indx = {
    "title": "Mekhilta DeRabbi Shimon Bar Yochai",
    "categories": ["Midrash", "Halachic Midrash"],
    "schema": root.serialize()
}

# Index(indx).save()
post_texts_api(indx, "Mekhilta%20DeRabbi%20Shimon%20Bar%20Yochai")

# Footnote Index
footnote_index = {
    "title": "Footnotes",
    "categories": ["Commentary"]
}

post_texts_api(footnote_index, "Footnotes")
