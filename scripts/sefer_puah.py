import django
django.setup()
from sefaria.model import *
from sefaria.model.schema import *
import csv
import json

data = {}
curr_vol = None
curr_chap = None
vols = set()
chaps = set()
secs = set()
with open("./Sefer Puah - alt toc.csv", "r") as f:
    reader = csv.reader(f)
    next(reader)
    for row in reader:
        ref, vol, chap, sec = row
        if vol.strip() != "":
            curr_vol = vol.strip()
        if chap.strip() != "":
            curr_chap = chap.strip()
        if sec.strip() != "":
            curr_sec = sec.strip()
        vols.add(curr_vol)
        chaps.add(curr_chap)
        secs.add(curr_sec)
        data[f"{curr_vol}.{curr_chap}.{curr_sec.strip()}"] = ref
        
        
vols = sorted(list(vols))
chaps = sorted(list(chaps))
secs = sorted(list(secs), key=lambda x: int(x.split(")")[0]))
# i = library.get_index("Sefer Puah")
root = SchemaNode()
root.add_title("Volumes", "en", primary=True)
root.add_title("He Volumes", "he", primary=True)
root.key = "Volumes"
data = {k: data[k] for k in sorted(data)}
for i, vol in enumerate(vols):
    new_node = SchemaNode()
    en_vol, he_vol = vol.split(" / ")
    new_node.add_title(en_vol, "en", primary=True)
    new_node.add_title(he_vol, "he", primary=True)
    new_node.key = en_vol
    new_node.validate()
    alt_struct_refs_by_vol = [k for k in data.keys() if k.startswith(vol)]
    print(alt_struct_refs_by_vol)
    for j, chap in enumerate(chaps):
        if chap in str(alt_struct_refs_by_vol):
            new_section_node = SchemaNode()
            en_chap, he_chap = chap.split(" / ")    
            new_section_node.add_title(en_chap, "en", primary=True)
            new_section_node.add_title(he_chap, "he", primary=True)
            new_section_node.key = en_chap
            new_section_node.validate()
            alt_struct_refs_by_chap = [k for k in data.keys() if k.startswith(f"{vol}.{chap}")]
            
            for k, sec in enumerate(secs):
                if sec in str(alt_struct_refs_by_chap):
                    ref = data[f"{vol}.{chap}.{sec}"]
                    en_sec, he_sec = sec.split(" / ")
                    new_subsection_node = ArrayMapNode()
                    new_subsection_node.add_title(en_sec, "en", primary=True)
                    new_subsection_node.add_title(he_sec, "he", primary=True)
                    new_subsection_node.key = en_sec
                    new_subsection_node.depth = 0
                    new_subsection_node.wholeRef = ref
                    new_subsection_node.validate()
                    new_section_node.append(new_subsection_node)
            new_node.append(new_section_node)
    root.append(new_node)

                

root.validate()
print(json.dumps({"Volumes": root.serialize()}))
print()
# i.nodes.children.append(root)
# i.save()
