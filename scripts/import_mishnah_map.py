# -*- coding: utf-8 -*-

from sefaria.model import *
import sefaria.tracker as tracker
from sefaria.system.exceptions import DuplicateRecordError

import csv
import re

filename = '../data/Mishnah Map.csv'

# 0 Book
# 1 Mishnah Chapter
# 2 Start Mishnah
# 3 End Mishnah
# 4 Start Daf
# 5 Start Line
# 6 End Daf
# 7 End Line

books = {}  # title: [ref1, ref2, ...]

chapterStart = None
chapterEnd = None
lastrow = None

versionTitle = "Wikisource Talmud Bavli"
matni_re = re.compile(ur"(^|\s+)(" + u"מתנ" + u"י" + u"?" + ur"(?:'|" + u"׳" + u"|" + u"תין" + u"))" + ur"(?:$|\s+)(.*)")
gemarah_re = re.compile(ur"(^|\s+)(" + u"גמ" + ur"(" + ur"\'" + u"|" + u"רא))" + ur"(?:$|\s+)(.*)")

with open(filename, 'rb') as csvfile:
    next(csvfile)
    for row in csv.reader(csvfile):

        # Add link
        mishnaRef = Ref("{} {}:{}-{}".format(row[0], row[1], row[2], row[3]))
        mishnahInTalmudRef = Ref("{} {}:{}-{}:{}".format(row[0], row[4], row[5], row[6], row[7]))
        print mishnaRef.normal() + " ... " + mishnahInTalmudRef.normal()

        try:
            tracker.add(28, Link, {
                "refs": [mishnaRef.normal(), mishnahInTalmudRef.normal()],
                "auto": True,
                "generated_by": "mishnah_map",
                "type": "Mishnah in Talmud"
            })
        except DuplicateRecordError as e:
            print e

        # Try highlighting Mishnah and Gemara
        tc = mishnahInTalmudRef.starting_ref().text("he", versionTitle)


        # Compile Perek Data
        if not lastrow or row[1] != lastrow[1]:
            if lastrow:
                if row[0] != lastrow[0]: # Get range to last line in book
                    o = chapterStart._core_dict()
                    o["sections"] = o["toSections"] = [i + 1 for i in StateNode(lastrow[0]).ja("he").last_index(2)]
                    books[lastrow[0]].append(chapterStart.to(Ref(_obj=o)).normal())
                else:
                    endline = int(row[5]) - 1
                    if endline == 0: # Get range to last line of previous page
                        firstLinePage = Ref("{} {}".format(row[0], row[6]))
                        chapterEnd = firstLinePage.prev_section_ref()
                        chapterEnd.toSections += [chapterEnd.get_state_ja().sub_array_length([chapterEnd.toSections[0] - 1])]
                    else:
                        chapterEnd = Ref("{} {}:{}".format(row[0], row[6], endline))
                    chapterRange = chapterStart.to(chapterEnd)
                    books[lastrow[0]].append(chapterRange.normal())
            chapterStart = Ref("{} {}:{}".format(row[0], row[4], row[5]))

        if not lastrow or row[0] != lastrow[0]:
            books[row[0]] = []

        lastrow = row

#process book records
for bookname, chapters in books.iteritems():
    i = get_index(bookname)

    a = ArrayMapNode()
    a.refs = chapters
    a.wholeRef = Ref(chapters[0]).to(Ref(chapters[-1])).normal()
    a.sectionNames = ["Chapter"]
    a.depth = 1
    a.addressTypes = ["Integer"]
    a.title_group = i.nodes.title_group

    i.set_alt_structure("Chapters", a)

    i.save()

