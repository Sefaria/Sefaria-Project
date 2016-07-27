import json

from sefaria.model import *
from sefaria.summaries import *
from sefaria.local_settings import SEFARIA_DATA_PATH

toc = library.get_toc()
flat_toc = flatten_toc(toc)

bookworm   = []
commentary = []

for title in flat_toc:
    i = library.get_index(title)
    if i.categories[0] == "Tanach":
        cat = i.categories[1]
    elif i.categories[0] == "Talmud":
        cat = "Talmud " + i.categories[1]
    elif i.categories[0] == "Commentary2":
        cat = "Commentary"
    elif i.categories[0] == "Other" and i.categories[1] == "Maharsha":
        cat = "Commentary"
    elif i.categories[0] == "Other":
        cat = i.categories[0]
    else:
        cat = i.categories[0]

    item = {"title": title, "category": cat}
    if cat == "Commentary":
        commentary.append(item)
    else:
        bookworm.append(item)

bookworm += commentary

with open(SEFARIA_DATA_PATH + "misc/bookworm_list.json", "w") as f:
    f.write(json.dumps(bookworm, indent=4))