import django
django.setup()
from sefaria.model import *
from sefaria.model.text import AbstractTextRecord
import json
from tqdm import tqdm
import bleach
from bs4 import BeautifulSoup

jsonlist = []
for index in tqdm(library.get_indexes_in_corpus("Tanakh")):
    if index in ["Song of Songs"]:
        continue
    for seg_ref in library.get_index(index).all_segment_refs():
        tanakh_en = seg_ref.text('en').text
        rashi_en = ""
        for l in LinkSet({"refs": seg_ref.normal(), "type": "commentary", "auto": True}):
            if f"Rashi on {seg_ref}" in str(l.refs):
                rashi_ref = l.refs[0] if "Rashi on " in l.refs[0] else l.refs[1]
                rashi_en = Ref(rashi_ref).text('en').text
                break
        if rashi_en != "":
            rashi_en = AbstractTextRecord.strip_itags(rashi_en)
            tanakh_en = AbstractTextRecord.strip_itags(tanakh_en)
            jsonlist.append({"messages":
            [{"role":"system","content":"You are an Jewish rabbi who is an expert on Tanakh, Mishnah, Midrash and Talmud.  "
                                        "You live just after the Talmud was finished being edited.  "
                                        "You know NOTHING about Judaism except for the Tanakh, Mishanh, Midrash and Talmud. "
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
