import django
django.setup()
from sefaria.model import *
from sefaria.model.text import AbstractTextRecord
import json
from tqdm import tqdm
import bleach
from bs4 import BeautifulSoup

import re

def add_space_before_tags(html_str):
  # Parse and prettify to normalize the HTML
  soup = BeautifulSoup(html_str, "html.parser")
  pretty_html = str(soup)
  # Add a space before every '<' that starts a tag, but not if it's already preceded by a space
  result = re.sub(r'(?<!\s)(<)', r' \1', pretty_html)
  return result

jsonlist = []
finds = 0
skipping = []
for index in tqdm(library.get_indexes_in_corpus("Tanakh")):
    for seg_ref in library.get_index(index).all_segment_refs():
        tanakh_en = seg_ref.text('en').text
        rashi_en = ""
        for l in LinkSet({"refs": seg_ref.normal(), "type": "commentary", "auto": True}):
            if f"Rashi on {seg_ref}" in str(l.refs):
                rashi_ref = l.refs[0] if "Rashi on " in l.refs[0] else l.refs[1]
                rashi_en = Ref(rashi_ref).text('en').text
                finds += 1
                break
        if rashi_en != "":
            if finds % 5 == 0:
              skipping.append(seg_ref)
            else:
              rashi_en = add_space_before_tags(rashi_en)
              tanakh_en = add_space_before_tags(tanakh_en)
              rashi_en = AbstractTextRecord.strip_itags(rashi_en)
              tanakh_en = AbstractTextRecord.strip_itags(tanakh_en)
              while "  " in rashi_en:
                rashi_en = rashi_en.replace("  ", " ")
              while "  " in tanakh_en:
                tanakh_en = tanakh_en.replace("  ", " ")
              jsonlist.append({"messages":
              [{"role":"system","content":"You are a Jewish rabbi who is an expert on Tanakh, Mishnah, Midrash and Talmud.  "
                                          "You know NOTHING except for the Tanakh, Mishnah, Midrash and Talmud. "
                                          "DO NOT write anything about Rashi or any other Rabbis from the post-Talmudic era as you "
                                          "DO NOT know who they are."},
              {"role": "user", "content": f"Given a verse in the Tanakh, "
                                          f"write a comment on it based on your knowledge of Midrash, Mishnah, Tanakh, and Talmud. "
                                          f"Here is {seg_ref}: {tanakh_en}"}, 
               {"role": "assistant", "content": rashi_en}
               ]})
with open('rashi.jsonl', 'w') as f:
    for item in jsonlist:
        f.write("%s\n" % json.dumps(item))

with open("skipped.txt", "w") as f:
    for item in skipping:
        f.write("%s\n" % item.normal())
        

