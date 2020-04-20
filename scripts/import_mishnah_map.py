# -*- coding: utf-8 -*-

from sefaria.model import *
import sefaria.tracker as tracker
from sefaria.system.exceptions import DuplicateRecordError

import unicodecsv as csv
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

live = True

perek_refs = {}  # title: [ref1, ref2, ...]
perek_names = {} # title: [name, name, name ...]

chapterStart = None
chapterEnd = None
lastrow = None

versionTitle = "Wikisource Talmud Bavli"
matni_re = re.compile(r"(^|\s+)((?:" + "מת" + "נ" + "?" + "י" + "?" + r"(?:'|" + "׳" + "|" + "תין" + ")?)|" + r"משנה" + r")" + r'(?:$|:|\s+)(([\u05d0-\u05f4"]*)(.*))')
gemarah_re = re.compile(r"(^|\s+)(" + "גמ" + r"(?:" + r"\'" + "|" + "רא))" + r"(?:$|:|\s+)(.*)")
hadran_re = re.compile(r'^(.*\s*)\(?(\u05d4\u05d3\u05e8\u05df \u05e2\u05dc\u05da\s+(.*?):?\s*(?:' + r'וסליקא לה' + r'.*?' + r')?)\)?\s*$')

standard_mishnah_start = "מתני׳"
standard_gemara_start = "גמ׳"


def parse_and_bold_hadran(hadran_ref):
    tc = hadran_ref.text("he", versionTitle)
    match = hadran_re.match(tc.text)
    if match:
        perek_names[lastrow[0]] = perek_names.get(lastrow[0], []) + [match.group(3)]
        old = tc.text
        tc.text = hadran_re.sub(r'\1<br/><br/><big><strong>\2</strong></big><br/><br/>', tc.text)
        if live:
            tc.save()
        else:
            print("(h1) Replacing:\n{}\nwith\n{}\n".format(old, tc.text))
        return True
    else:
        print("(h0) Missed Hadran on {} - '{}'".format(hadran_ref.normal(), tc.text))
        return False




with open(filename, 'rb') as csvfile:
    next(csvfile)
    for row in csv.reader(csvfile):

        is_new_perek = not lastrow or row[1] != lastrow[1]
        is_new_mesechet = not lastrow or row[0] != lastrow[0]

        # Add link
        mishnaRef = Ref("{} {}:{}-{}".format(row[0], row[1], row[2], row[3]))
        mishnahInTalmudRef = Ref("{} {}:{}-{}:{}".format(row[0], row[4], row[5], row[6], row[7]))
        print(mishnaRef.normal() + " ... " + mishnahInTalmudRef.normal())

        if live:
            try:
                tracker.add(28, Link, {
                    "refs": [mishnaRef.normal(), mishnahInTalmudRef.normal()],
                    "auto": True,
                    "generated_by": "mishnah_map",
                    "type": "mishnah in talmud"
                })
            except DuplicateRecordError as e:
                print(e)

        # Try highlighting hadran.  Note that the last hadran gets highlighted outside of the loop
        """
        13 non standard Hadrans (code is catching all of them, but they should be checked)

        Hadrans in parens, joined at end of other line:
        Sukkah 20b:29
        Sukkah 29b:5

        In parens on it's own line:
        Sukkah 42b:12

        Joined at end of other line:
        Chagigah 11b:6
        Chagigah 20b:13
        Zevachim 15b:17

        This has the Hadran joined to the previous line, and then a non-standard extra line introducing chapter two.  And opportunity to move the hadran down, and get rid of the nonstandard line.
        Bava_Batra.17a.48-49

        These ones have the weird perek intro, but the hadran sits alone on the previous line
        Zevachim 66a:22
        Zevachim 83a:36

        Slika on last line:
        Bava Batra 176b:6
        Bekhorot 61a:47
        Arakhin 34a:30
        Keritot 28b:37
        """
        if is_new_perek and lastrow:
            if not is_new_mesechet:
                hadran_ref = Ref("{} {}:{}".format(row[0], row[4], row[5])).prev_segment_ref()
            else:
                hadran_ref = Ref("{}".format(lastrow[0])).last_segment_ref()
            if not parse_and_bold_hadran(hadran_ref):
                parse_and_bold_hadran(hadran_ref.prev_segment_ref())


        # Try highlighting Mishnah
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

        """
        tc = mishnahInTalmudRef.starting_ref().text("he", versionTitle)
        if matni_re.match(tc.text):
            if not matni_re.match(tc.text).group(3):
                print("(ma) Bare Mishnah word")
            old = tc.text
            if is_new_perek:
                print("(mp) Perek Start line: {}".format(tc.text))
                tc.text = matni_re.sub(r'\1' + standard_mishnah_start + r' <big><strong>\4</strong></big>\5', tc.text)
            else:
                tc.text = matni_re.sub(r'\1<big><strong>' + standard_mishnah_start + r'</strong></big> \3', tc.text)
            if live:
                tc.save()
            else:
                print("(m1) Replacing:\n{}\nwith\n{}\n".format(old, tc.text))
        else:  # try the line earlier
            if not mishnahInTalmudRef.starting_ref().prev_segment_ref():
                print("(m0) No Mishnah word starting Mesechet: {}".format(mishnahInTalmudRef.starting_ref().normal()))
                continue
            tc = mishnahInTalmudRef.starting_ref().prev_segment_ref().text("he", versionTitle)
            if matni_re.match(tc.text):
                old = tc.text
                tc.text = matni_re.sub(r'\1' + standard_mishnah_start + r' <big><strong>\4</strong></big>\5', tc.text)
                if live:
                    tc.save()
                else:
                    print("(m2) Replacing:\n{}\nwith\n{}\n".format(old, tc.text))
            else:
                print("(m0) Could not match {}".format(mishnahInTalmudRef.normal()))

        # Try highlighting Gemara
        """
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
            Fixed by hand
            Sotah 49b:5

        """
        tc = mishnahInTalmudRef.ending_ref().next_segment_ref().text("he", versionTitle)
        if gemarah_re.match(tc.text):
            if not gemarah_re.match(tc.text).group(3):
                print("(ga) Bare Gemara word")
            old = tc.text
            tc.text = gemarah_re.sub(r'\1<big><strong>' + standard_gemara_start + r'</strong></big> \3', tc.text)
            if live:
                tc.save()
            else:
                print("(g1) Replacing:\n{}\nwith\n{}\n".format(old, tc.text))
        else:
            print("(g0) Could not match 'gemara' in {}".format(mishnahInTalmudRef.ending_ref().next_segment_ref().normal()))

        # Compile Perek Data

        if not lastrow or is_new_perek:
            if lastrow:
                chapter_range = chapterStart.to(hadran_ref)
                perek_refs[lastrow[0]].append(chapter_range.normal())
            chapterStart = Ref("{} {}:{}".format(row[0], row[4], row[5]))

        if not lastrow or is_new_mesechet:
            perek_refs[row[0]] = []

        lastrow = row


# Get perek data for the last chapter
hadran_ref = Ref("{}".format(lastrow[0])).last_segment_ref()
chapter_range = chapterStart.to(hadran_ref)
perek_refs[lastrow[0]].append(chapter_range.normal())
parse_and_bold_hadran(hadran_ref)


# process book records to alt structures
if live:
    for bookname, chapters in perek_refs.items():
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


#  Write perek names to csv
with open("../data/perek_names.csv", "w") as f:
    writer = csv.writer(f)
    for bookname, chapters in perek_names.items():
        for i, n in enumerate(chapters):
            writer.writerow([bookname, i + 1, n])
