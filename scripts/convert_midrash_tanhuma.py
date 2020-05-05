# -*- coding: utf-8 -*-
__author__ = 'stevenkaplan'
from sefaria.model import *
import csv
import sys
sys.path.append("./scripts")
from convert_to_complex_text import *
from sefaria.system.exceptions import InputError

en_he_parshiot = []
en_parshiot = []
with open("./data/tmp/parsha.csv") as parsha_file:
    parshiot = csv.reader(parsha_file)
    next(parshiot)
    order = 1
    for row in parshiot:
        (en, he, ref) = row
        if en == "Lech-Lecha":
            en = "Lech Lecha"
        he = he.decode('utf-8')
        en_he_parshiot.append((en, he))


book = SchemaNode()
book.add_title("Midrash Tanchuma", "en", primary=True)
book.add_title("מדרש תנחומא", "he", primary=True)
book.key = "midrash_tanhuma"

foreword = JaggedArrayNode()
foreword.add_title("Foreword", "en", primary=True)
foreword.add_title("פתח דבר", "he", primary=True)
foreword.key = "foreword"
foreword.depth = 1
foreword.sectionNames = ["Paragraph"]
foreword.addressTypes = ["Integer"]

intro = JaggedArrayNode()
intro.add_title("Introduction", "en", primary=True)
intro.add_title("הקדמה", "he", primary=True)
intro.key = "intro"
intro.depth = 1
intro.sectionNames = ["Paragraph"]
intro.addressTypes = ["Integer"]

book.append(foreword)
book.append(intro)

for count, parsha_tuple in enumerate(en_he_parshiot):
    if count == 23:
        break
    parsha = JaggedArrayNode()
    parsha.key = parsha_tuple[0]
    parsha.add_title(parsha_tuple[0], "en", primary=True)
    parsha.add_title(parsha_tuple[1], "he", primary=True)
    parsha.sectionNames = ["Paragraph"]
    parsha.depth = 1
    parsha.addressTypes = ["Integer"]
    book.append(parsha)
    en_parshiot.append(parsha_tuple[0])





book.validate()


mappings = []
torah = [12, 11, 10, 10, 11]
counter = 0
for torah_index, sefer in enumerate(torah):
    for sefer_index in range(sefer):
        orig = "Midrash Tanchuma.{}.{}".format(torah_index+1, sefer_index+1)
        new = "Midrash Tanchuma, {}".format(en_parshiot[counter])
        mappings.append((orig, new))
        counter += 1

#Go through each sefer and set the key of a dictionary to be like 1.2 = Noah
try:
    library.get_index("Complex Midrash Tanchuma").delete()
except InputError:
    pass

migrate_to_complex_structure("Midrash Tanchuma", book.serialize(), mappings)