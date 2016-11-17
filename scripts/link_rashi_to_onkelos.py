# -*- coding: utf-8 -*-

from sefaria.model import *
from sefaria.utils.hebrew import strip_nikkud
import sefaria.tracker as tracker

patterns = [
    u"כתרגומו",
    u"ותרגומו",
    u"וזהו שתרגם אונקלוס",
    u"לכך מתרגם"
]

books = [
    "Genesis", "Exodus", "Leviticus", "Numbers", "Deuteronomy"
]
total = 0
for book in books:
    rashi_book = "Rashi on " + book
    onkelos_book = "Onkelos " + book
    i = library.get_index(rashi_book)
    assert isinstance(i, CommentaryIndex)
    all_rashis = i.all_segment_refs()

    # Loop through all of the Rashis
    for rashi_ref in all_rashis:
        rashi = strip_nikkud(TextChunk(rashi_ref, "he", "On Your Way").text)

        # If it matches the pattern
        if any([pat in rashi for pat in patterns]):
            onkelos_ref = Ref(rashi_ref.section_ref().normal().replace(rashi_book, onkelos_book))

            d = {
                "refs": [rashi_ref.normal(), onkelos_ref.normal()],
                "type": "reference",
                "auto": True,
                "generated_by": "Rashi - Onkelos Linker"
            }
            tracker.add(28, Link, d)
            # print rashi
            print u"{} {}".format(rashi_ref.normal(), onkelos_ref.normal())
            total += 1

print "\nLinks: {}".format(total)
