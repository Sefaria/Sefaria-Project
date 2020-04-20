# encoding = utf-8

import re
from sefaria.model import *

index_list = []
categories = ["Tanakh", "Tosefta", "Talmud", "Mishnah"]
for category in categories:
    index_list.extend(library.get_indexes_in_category(category, full_records=True))

direct_indexes = ["Tur", "Zohar", "Tikkunei Zohar", "Zohar Chadash", "Shulchan Arukh, Choshen Mishpat",
                  "Shulchan Arukh, Even HaEzer", "Shulchan Arukh, Orach Chayim", "Shulchan Arukh, Yoreh De'ah"]
for i in direct_indexes:
    index_list.append(library.get_index(i))

bad_midrashim = ["Legends of the Jews", "Otzar Midrashim", "Sifra"]
midrashim = [x for x in library.get_indexes_in_category("Midrash", full_records=True) if None if x.title in bad_midrashim else True]
index_list.extend(midrashim)

for i in library.get_indexes_in_category("Torah"):
    commentaries = library.get_dependant_indices(i, full_records=True)
    commentaries = [x for x in commentaries if None if x.title == 'Shney Luchot HaBrit' else True]
    index_list.extend(commentaries)


mishneh_torah = library.get_indexes_in_category("Mishneh Torah", full_records=True)
index_list.extend([x for x in mishneh_torah if re.search("^Mishneh", x.title)])

for i in index_list:
    print("adding {}".format(i.title))
    i.is_cited = True
    i.save()
