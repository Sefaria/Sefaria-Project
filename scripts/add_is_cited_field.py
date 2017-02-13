# encoding = utf-8

import re
from sefaria.model import *

index_list = []
categories = ["Tanakh", "Tosefta", "Talmud"]
for category in categories:
    index_list.extend(library.get_indexes_in_category(category, full_records=True))

direct_indexes = ["Tur", "Zohar", "Tikkunei Zohar", "Zohar Chadash", "Shulchan Arukh, Choshen Mishpat",
                  "Shulchan Arukh, Even HaEzer", "Shulchan Arukh, Orach Chayim", "Shulchan Arukh, Yoreh De'ah"]
for i in direct_indexes:
    index_list.append(library.get_index(i))

bad_midrashim = ["Legends of the Jews", "Otzar Midrashim", "Sifra"]
midrashim = filter(lambda x: None if x.title in bad_midrashim else True,
                   library.get_indexes_in_category("Midrash", full_records=True))
index_list.extend(midrashim)

for i in library.get_indexes_in_category("Torah"):
    index_list.extend(library.get_dependant_indices(i, full_records=True))

mishneh_torah = library.get_indexes_in_category("Mishneh Torah", full_records=True)
index_list.extend(filter(lambda x: re.search("^Mishneh", x.title), mishneh_torah))

for i in index_list:
    i.is_cited = True
    i.save()
