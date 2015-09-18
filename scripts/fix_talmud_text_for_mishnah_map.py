# -*- coding: utf-8 -*-

from sefaria.model import *
import sefaria.tracker as tracker
from sefaria.system.exceptions import DuplicateRecordError
from sefaria.helper.splice import Splicer

import unicodecsv as csv
import re

live = True
writeMishnahMapChanges = True

filename = '../data/Mishnah Map.csv'
versionTitle = "Wikisource Talmud Bavli"
matni_re = re.compile(ur"(^|\s+)((?:" + u"מת" + u"נ" + u"?" + u"י" + u"?" + ur"(?:'|" + u"׳" + u"|" + u"תין" + u")?)|" + ur"משנה" + ur")" + ur"(?:$|:|\s+)(.*)")
gemarah_re = re.compile(ur"(^|\s+)(" + u"גמ" + ur"(?:" + ur"\'" + u"|" + u"רא))" + ur"(?:$|:|\s+)(.*)")
standard_mishnah_start = u"מתני׳"
standard_gemara_start = u"גמ׳"
m_count = 0
g_count = 0

mishnah_map = []
# Read in the old Mishnah Map
with open(filename, 'rb') as csvfile:
    next(csvfile)
    for row in csv.reader(csvfile):
        d = {
            "line": row,
            "orig_ref": Ref("{} {}:{}-{}:{}".format(row[0], row[4], row[5], row[6], row[7])),
            "new_ref": None
        }
        mishnah_map.append(d)


def review_map(splicer):
    for row in mishnah_map:
        if row["new_ref"] and splicer._needs_rewrite(row["new_ref"]):
            print "* Rewriting new_ref {} ...".format(row["new_ref"])
            row["new_ref"] = splicer._rewrite(row["new_ref"])
            print "...to {}".format(row["new_ref"])
        elif splicer._needs_rewrite(row["orig_ref"]):
            print "* Rewriting orig_ref {} ...".format(row["orig_ref"])
            row["new_ref"] = splicer._rewrite(row["orig_ref"])
            print "...to {}".format(row["new_ref"])

missing_matni = ["Berakhot 54a:1",
    "Beitzah 15b:1",
    "Beitzah 23b:22",
    "Nazir.30b.26",
    "Sotah.31a.26",
    "Makkot.5b:73",
    "Shevuot 19b:37",
    "Nedarim.66b.66",
    "Kiddushin 2a:1",
     "Tamid 33b:1"]
for r in missing_matni:
    tc = TextChunk(Ref(r), "he", versionTitle)
    tc.text = standard_mishnah_start + u" " + tc.text
    if live:
        tc.save()
    else:
        print u"Changing text to {}".format(tc.text)

#These will need some manual work afterwards
to_split = ["Nedarim.25b.9",
    "Sukkah 20b:29", # Hadrans in parens, joined at end of other line:
    "Sukkah 29b:5",
    "Chagigah 11b:6", # Joined at end of other line:
    "Chagigah 20b:13",
    "Zevachim 15b:17",
]
for r in to_split:
    s = Splicer().insert_blank_segment_after(Ref(r))
    review_map(s)
    if live:
        s.execute()
    else:
        print u"Adding blank segment after {}".format(r)

to_merge = ["Zevachim.66a.23", # merge into previous 22
    "Zevachim.83a.37", # merge into previous 36
    "Bava_Batra.176b.6",
    "Bekhorot 61a:47",
    "Arakhin 34a:30",
    "Keritot 28b:37"]
for r in to_merge:
    s = Splicer().splice_this_into_prev(Ref(r))
    review_map(s)
    if live:
        s.execute()
    else:
        print u"Merging {} into previous".format(r)

for mishnah in mishnah_map:
    ref = mishnah["new_ref"] or mishnah["orig_ref"]
    ref = ref.starting_ref()
    tc = ref.text("he", versionTitle)
    if matni_re.match(tc.text):
        if not matni_re.match(tc.text).group(3):
            print u"(ma) Bare Mishnah word"
            m_count += 1
            try:
                s = Splicer().splice_this_into_next(ref)
                review_map(s)
                if live:
                    s.execute()
                else:
                    print u"Merging bare Mishnah at {} into next".format(ref.normal())
            except Exception as e:
                print "(mf) Failed to splice {} into next: {}".format(ref.normal(),e)
    else:
        print u"(m0) Did not match mishnah {}".format(ref.normal())

    ref = mishnah["new_ref"] or mishnah["orig_ref"]
    ref = ref.ending_ref().next_segment_ref()
    tc = ref.text("he", versionTitle)
    if gemarah_re.match(tc.text):
        if not gemarah_re.match(tc.text).group(3):
            print u"(ga) Bare Gemara word"
            g_count += 1
            try:
                s = Splicer().splice_this_into_next(ref)
                review_map(s)
                if live:
                    s.execute()
                else:
                    print u"Merging bare Gemara at {} into next".format(ref.normal())
            except Exception as e:
                print "(gf) Failed to splice {} into next: {}".format(ref.normal(),e)
    else:
        print u"(g0) Did not match 'Gemara' in {}".format(ref.normal())

print "Mishnah count: {}".format(m_count)
print "Gemara count: {}".format(g_count)

# Write out the new Mishnah Map
if writeMishnahMapChanges:
    with open(filename, "rb") as csvfile:
        next(csvfile)
        csvfile.truncate()
        cwriter = csv.writer(csvfile)
        for row in mishnah_map:
            if row["new_ref"] and row["new_ref"] != row["orig_ref"]:
                row["line"][5] = row["new_ref"].sections[1]
                row["line"][7] = row["new_ref"].toSections[1]
            cwriter.writerow(row["line"])
    cwriter.flush()


"""
13 non standard Hadrans (code is catching all of them, but they should be checked)

Hadrans in parens, joined at end of other line:
✓? Sukkah 20b:29
✓? Sukkah 29b:5

In parens on it's own line:
✓ Sukkah 42b:12

Joined at end of other line:
✓? Chagigah 11b:6
✓? Chagigah 20b:13
✓? Zevachim 15b:17

This has the Hadran joined to the previous line, and then a non-standard extra line introducing chapter two.  And opportunity to move the hadran down, and get rid of the nonstandard line.
Cleaned up manually
✓ Bava_Batra.17a.48-49

These ones have the weird perek intro, but the hadran sits alone on the previous line
✓? Zevachim 66a:22
✓? Zevachim 83a:36

Slika on last line:
✓ Bava Batra 176b:6
✓ Bekhorot 61a:47
✓ Arakhin 34a:30
✓ Keritot 28b:37
"""

"""
10 Mishnah misses:

Missing Matni:
✓    Berakhot 54a:1
✓    Beitzah 15b:1
✓    Beitzah 23b:22
✓    Nazir.30b.26
✓    Sotah.31a.26
✓    Makkot.5b:73
✓    Shevuot 19b:37
✓    Nedarim.66b.66

Listed as Braita -
    Mishnah Pesachim 4:9 ... Pesachim 56a:2-6

Mishnah at the end of Tamid -
    Tamid 33b:1

"""

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
✓?    Nedarim 25b:10

** Non-standard Gemara - "(גמ')"
✓    Sotah 49b:5

"""
