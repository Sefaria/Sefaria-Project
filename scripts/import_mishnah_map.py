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

live = False

books = {}  # title: [ref1, ref2, ...]

chapterStart = None
chapterEnd = None
lastrow = None

versionTitle = "Wikisource Talmud Bavli"
matni_re = re.compile(ur"(^|\s+)((?:" + u"מת" + u"נ" + u"?" + u"י" + u"?" + ur"(?:'|" + u"׳" + u"|" + u"תין" + u")?)|" + ur"משנה" + ur")" + ur"(?:$|:|\s+)(.*)")
gemarah_re = re.compile(ur"(^|\s+)(" + u"גמ" + ur"(?:" + ur"\'" + u"|" + u"רא))" + ur"(?:$|:|\s+)(.*)")

with open(filename, 'rb') as csvfile:
    next(csvfile)
    for row in csv.reader(csvfile):

        # Add link
        mishnaRef = Ref("{} {}:{}-{}".format(row[0], row[1], row[2], row[3]))
        mishnahInTalmudRef = Ref("{} {}:{}-{}:{}".format(row[0], row[4], row[5], row[6], row[7]))
        print mishnaRef.normal() + " ... " + mishnahInTalmudRef.normal()

        if live:
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
        """
        10 Mishnah misses:

        Missing Matni:
            Berakhot 54a:1
            Beitzah 15b:1
            Beitzah 23b:22
            Nazir.30b.26
            Sotah.31a.26
            Makkot.5b:73
            Shevuot 19b:37
            Nedarim.66b.66

        Listed as Braita -
            Mishnah Pesachim 4:9 ... Pesachim 56a:2-6

        Mishnah at the end of Tamid -
            Tamid 33b:1

        -------
        10 Gemara misses:

        Pesachim Braita
            Pesachim 56a:7

        Mishnah with no Gemara:
            Rosh Hashanah 22a:41
            Nedarim 63b:19
            Bekhorot 13a:20
            Tamid 30b:35
            Tamid 33a:14
            Tamid 33a:31
            Tamid 33b:38

        ** Bad segmenting:
            Nedarim 25b:10

        ** Non-standard Gemara - "(גמ')"
            Sotah 49b:5
        
        """
        tc = mishnahInTalmudRef.starting_ref().text("he", versionTitle)
        if matni_re.match(tc.text):
            old = tc.text
            tc.text = matni_re.sub(ur'\1<big><bold>\2</bold></big>\3', tc.text)
            if live:
                tc.save()
            else:
                print u"(m1) Replacing:\n{}\nwith\n{}\n".format(old,tc.text)
        else:  # try the line earlier
            if not mishnahInTalmudRef.starting_ref().prev_segment_ref():
                continue
            tc = mishnahInTalmudRef.starting_ref().prev_segment_ref().text("he", versionTitle)
            if matni_re.match(tc.text):
                old = tc.text
                tc.text = matni_re.sub(ur'\1<big><bold>\2</bold></big>\3', tc.text)
                if live:
                    tc.save()
                else:
                    print u"(m2) Replacing:\n{}\nwith\n{}\n".format(old,tc.text)
            else:
                print u"(m0) Could not match {}".format(mishnahInTalmudRef.normal())

        # Try highlighting Gemara
        tc = mishnahInTalmudRef.ending_ref().next_segment_ref().text("he", versionTitle)
        if gemarah_re.match(tc.text):
            old = tc.text
            tc.text = gemarah_re.sub(ur'\1<big><bold>\2</bold></big>\3', tc.text)
            if live:
                tc.save()
            else:
                print u"(g1) Replacing:\n{}\nwith\n{}\n".format(old,tc.text)
        else:
            print u"(g0) Could not match 'gemara' in {}".format(mishnahInTalmudRef.ending_ref().next_segment_ref().normal())

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
if live:
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

