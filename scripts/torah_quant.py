# -*- coding: utf-8 -*-
import csv

from sefaria.model import *
from sefaria.utils.hebrew import gematria
from sefaria.settings import STATICFILES_DIRS

torah = IndexSet({"categories": "Torah"})
parshiot = []
chapters = []

for book in torah:
    parshiot_in_book = ["Parashat " + p["sharedTitle"] for p in book.alt_structs["Parasha"]["nodes"]]
    parshiot = parshiot + parshiot_in_book

    r = Ref(book.title)
    chapters_in_book = [c.normal() for c in r.subrefs(r.index.schema["lengths"][0])]
    chapters = chapters + chapters_in_book


def export_stats_by_ref(refs, filename):
    with open("%s/files/%s" % (STATICFILES_DIRS[0], filename), 'wb') as csvfile:
        writer = csv.writer(csvfile)
        writer.writerow([
                            "ref",
                            "letters",
                            "words",
                            "verses",
                            "gematria",
                            "gematriaHex",
                            "gematria18Hex",
                         ])

        for ref in refs:
            print(ref)
            oRef = Ref(ref)
            text = oRef.text(lang="he", vtitle="Tanach with Text Only")
            writer.writerow([
                                ref,
                                len(text.as_string().replace(" ", "")),
                                text.word_count(),
                                text.verse_count(),
                                gematria(text.as_string()),
                                "{0:#0{1}x}".format(gematria(text.as_string()),8).replace("0x", "#"),
                                "{0:#0{1}x}".format(gematria(text.as_string()) * 18,8).replace("0x", "#"),

                            ])

export_stats_by_ref(chapters, "torah_quant_by_chapter.csv")
export_stats_by_ref(parshiot, "torah_quant_by_parasha.csv")
