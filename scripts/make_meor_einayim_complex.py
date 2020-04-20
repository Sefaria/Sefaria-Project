# -*- coding: utf-8 -*-

__author__ = 'stevenkaplan'
from sefaria.model import *
from sefaria.helper.schema import *
if __name__ == "__main__":
    orig_info = [
        {
            "to" : "Me'or Einayim 1",
            "from" : "Me'or Einayim, Bereshit"
        },
        {
            "to" : "Me'or Einayim 2",
            "from" : "Me'or Einayim, Noah"
        },
        {
            "to" : "Me'or Einayim 3",
            "from" : "Me'or Einayim, Lekh Leha"
        },
        {
            "to" : "Me'or Einayim 4",
            "from" : "Me'or Einayim, Vayera"
        },
        {
            "to" : "Me'or Einayim 5",
            "from" : "Me'or Einayim, Hayyey Sarah"
        },
        {
            "to" : "Me'or Einayim 6",
            "from" : "Me'or Einayim, Toldot"
        },
        {
            "to" : "Me'or Einayim 7",
            "from" : "Me'or Einayim, Vayetze"
        },
        {
            "to" : "Me'or Einayim 8",
            "from" : "Me'or Einayim, Vayishlah"
        },
        {
            "to" : "Me'or Einayim 9",
            "from" : "Me'or Einayim, Vayeshev"
        },
        {
            "to" : "Me'or Einayim 10",
            "from" : "Me'or Einayim, Mikkets"
        },
        {
            "to" : "Me'or Einayim 11",
            "from" : "Me'or Einayim, Vayigash"
        },
        {
            "to" : "Me'or Einayim 12",
            "from" : "Me'or Einayim, Shemot"
        },
        {
            "to" : "Me'or Einayim 13",
            "from" : "Me'or Einayim, Vaera"
        },
        {
            "to" : "Me'or Einayim 14",
            "from" : "Me'or Einayim, Bo"
        },
        {
            "to" : "Me'or Einayim 15",
            "from" : "Me'or Einayim, Beshallah"
        },
        {
            "to" : "Me'or Einayim 16",
            "from" : "Me'or Einayim, Yitro"
        },
        {
            "to" : "Me'or Einayim 17",
            "from" : "Me'or Einayim, Mishpatim"
        },
        {
            "to" : "Me'or Einayim 18",
            "from" : "Me'or Einayim, Terumah"
        },
        {
            "to" : "Me'or Einayim 19",
            "from" : "Me'or Einayim, Tetzaveh"
        },
        {
            "to" : "Me'or Einayim 20",
            "from" : "Me'or Einayim, Ki Tissa"
        },
        {
            "to" : "Me'or Einayim 21",
            "from" : "Me'or Einayim, Vayakhel"
        },
        {
            "to" : "Me'or Einayim 22",
            "from" : "Me'or Einayim, Pekudei"
        },
        {
            "to" : "Me'or Einayim 23",
            "from" : "Me'or Einayim, Vayikra"
        },
        {
            "to" : "Me'or Einayim 24",
            "from" : "Me'or Einayim, Tzav"
        },
        {
            "to" : "Me'or Einayim 25",
            "from" : "Me'or Einayim, Shmini"
        },
        {
            "to" : "Me'or Einayim 26",
            "from" : "Me'or Einayim, Metzora"
        },
        {
            "to" : "Me'or Einayim 27",
            "from" : "Me'or Einayim, Aharei"
        },
        {
            "to" : "Me'or Einayim 28",
            "from" : "Me'or Einayim, Kedoshim"
        },
        {
            "to" : "Me'or Einayim 29",
            "from" : "Me'or Einayim, Emor"
        },
        {
            "to" : "Me'or Einayim 30",
            "from" : "Me'or Einayim, Behukotai"
        },
        {
            "to" : "Me'or Einayim 31",
            "from" : "Me'or Einayim, Bemidbar"
        },
        {
            "to" : "Me'or Einayim 32",
            "from" : "Me'or Einayim, Nasso"
        },
        {
            "to" : "Me'or Einayim 33",
            "from" : "Me'or Einayim, Beha'alotkha"
        },
        {
            "to" : "Me'or Einayim 34",
            "from" : "Me'or Einayim, Shlah"
        },
        {
            "to" : "Me'or Einayim 35",
            "from" : "Me'or Einayim, Hukkat"
        },
        {
            "to" : "Me'or Einayim 36",
            "from" : "Me'or Einayim, Pinhas"
        },
        {
            "to" : "Me'or Einayim 37",
            "from" : "Me'or Einayim, Mattot"
        },
        {
            "to" : "Me'or Einayim 38",
            "from" : "Me'or Einayim, Devarim"
        },
        {
            "to" : "Me'or Einayim 39",
            "from" : "Me'or Einayim, Vaethanan"
        },
        {
            "to" : "Me'or Einayim 40",
            "from" : "Me'or Einayim, Re'eh"
        },
        {
            "to" : "Me'or Einayim 41",
            "from" : "Me'or Einayim, Ki Tetze"
        },
        {
            "to" : "Me'or Einayim 42",
            "from" : "Me'or Einayim, Ki Tavo"
        },
        {
            "to" : "Me'or Einayim 43",
            "from" : "Me'or Einayim, Nitzavim"
        },
        {
            "to" : "Me'or Einayim 44",
            "from" : "Me'or Einayim, Vayelekh"
        },
        {
            "to" : "Me'or Einayim 45",
            "from" : "Me'or Einayim, Ha'azinu"
        }
        ]
    new_map = {}
    parshiot = []
    for dict in orig_info:
        new_map[dict['to']] = dict['from']
        parshiot.append(dict['from'].replace("Me'or Einayim, ", ""))

    root = SchemaNode()
    struct = library.get_index("Me'or Einayim").schema['sectionNames'][1:]
    root.add_primary_titles("Me'or Einayim", "מאור עיניים")
    for parsha in parshiot:
        node = JaggedArrayNode()
        term = Term().load({"name": parsha})
        assert term, parsha
        titles = term.titles
        he_title = titles[1]['text'] if titles[1]['lang'] == 'he' else titles[0]['text']
        node.add_primary_titles(parsha, he_title)
        node.add_shared_term(parsha)
        node.add_structure(struct)
        root.append(node)
    root.validate()
    migrate_to_complex_structure("Me'or Einayim", root.serialize(), new_map)