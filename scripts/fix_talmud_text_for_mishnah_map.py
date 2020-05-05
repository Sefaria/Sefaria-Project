# -*- coding: utf-8 -*-
import unicodecsv as csv
import re
from itertools import groupby

from sefaria.model import *
from sefaria.helper.splice import SegmentSplicer



live = True
writeMishnahMapChanges = True

filename = '../data/Mishnah Map.csv'
versionTitle = "Wikisource Talmud Bavli"
matni_re = re.compile(r"(^|\s+)((?:" + "מת" + "נ" + "?" + "י" + "?" + r"(?:'|" + "׳" + "|" + "תין" + ")?)|" + r"משנה" + r")" + r"(?:$|:|\s+)(.*)")
gemarah_re = re.compile(r"(^|\s+)(" + "גמ" + r"(?:" + r"\'" + "|" + "רא))" + r"(?:$|:|\s+)(.*)")
standard_mishnah_start = "מתני׳"
standard_gemara_start = "גמ׳"
m_count = 0
g_count = 0
refresh_count = 0

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
        if row["new_ref"]:
            if splicer._needs_rewrite(row["new_ref"]):
                print("* Rewriting new_ref {} ...".format(row["new_ref"]))
                row["new_ref"] = splicer._rewrite(row["new_ref"])
                print("...to {}".format(row["new_ref"]))
        elif splicer._needs_rewrite(row["orig_ref"]):
            print("* Rewriting orig_ref {} ...".format(row["orig_ref"]))
            row["new_ref"] = splicer._rewrite(row["orig_ref"])
            print("...to {}".format(row["new_ref"]))

missing_matni = ["Berakhot 54a:1",
    "Beitzah 15b:1",
    "Beitzah 23b:22",
    "Nazir.30b.26",
    "Sotah.31a.26",
    "Makkot.5b:73",
    "Shevuot 19b:37",
    "Nedarim.66b.66",
    "Kiddushin 2a:1",
     "Berakhot 2a:1",
     "Beitzah 2a:1",
     "Tamid 33b:1"]
for r in missing_matni:
    tc = TextChunk(Ref(r), "he", versionTitle)
    tc.text = standard_mishnah_start + " " + tc.text
    if live:
        tc.save()
    else:
        print("Changing text to {}".format(tc.text))

#These will need some manual work afterwards
to_split = ["Nedarim.25b.9",
    "Sukkah 20b:29", # Hadrans in parens, joined at end of other line:
    "Sukkah 29b:5",
    "Chagigah 11b:6", # Joined at end of other line:
    "Chagigah 20b:13",
    "Zevachim 15b:17",
]
for r in to_split:
    s = SegmentSplicer().insert_blank_segment_after(Ref(r))
    #s._save_text_only = True
    s._rebuild_toc = False
    s._refresh_states = True
    if live:
        s.execute()
    else:
        print("Adding blank segment after {}".format(r))
    review_map(s)

to_merge = ["Zevachim.66a.23", # merge into previous 22
    "Zevachim.83a.37", # merge into previous 36
    "Bava_Batra.176b.6",  # Slika on last line (and next 3)
    "Bekhorot 61a:47",
    "Arakhin 34a:30",
    "Keritot 28b:37"]
for r in to_merge:
    s = SegmentSplicer().splice_this_into_prev(Ref(r))
    #s._save_text_only = True
    s._rebuild_toc = False
    s._refresh_states = True
    if live:
        s.execute()
    else:
        print("Merging {} into previous".format(r))
    review_map(s)


Ref.clear_cache()

booklists = []
for k, g in groupby(mishnah_map, lambda d: d["orig_ref"].index.title):
    booklist = []
    for mishnah in g:
        ref = mishnah["new_ref"] if mishnah["new_ref"] else mishnah["orig_ref"]
        booklist.append({
            "ref": ref.starting_ref(),
            "type": "Mishnah"
        })
        booklist.append({
            "ref": ref.ending_ref().next_segment_ref(),
            "type": "Gemara"
        })
    booklists.append(booklist)


for booklist in booklists:
    needs_refresh = False
    next_list = []
    splc = None

    while len(booklist) or len(next_list):
        try:
            # Process first element in booklist
            change_made = False
            current = booklist.pop(0)
            if current["type"] == "Mishnah":
                tc = current["ref"].text("he", versionTitle)
                if matni_re.match(tc.text):
                    if not matni_re.match(tc.text).group(3):
                        print("(ma) Bare Mishnah word")
                        m_count += 1
                        try:
                            splc = SegmentSplicer().splice_this_into_next(current["ref"]).bulk_mode()
                            if live:
                                splc.execute()
                            else:
                                print("Merging bare Mishnah at {} into next".format(current["ref"].normal()))
                            change_made = True
                            needs_refresh = True
                            review_map(splc)
                        except Exception as e:
                            print("(mf) Failed to splice {} into next: {}".format(current["ref"].normal(),e))
                else:
                    print("(m0) Did not match mishnah {}".format(current["ref"].normal()))
            elif current["type"] == "Gemara":
                tc = current["ref"].text("he", versionTitle)
                if gemarah_re.match(tc.text):
                    if not gemarah_re.match(tc.text).group(3):
                        print("(ga) Bare Gemara word")
                        g_count += 1
                        try:
                            splc = SegmentSplicer().splice_this_into_next(current["ref"]).bulk_mode()
                            if live:
                                splc.execute()
                            else:
                                print("Merging bare Gemara at {} into next".format(current["ref"].normal()))
                            review_map(splc)
                            change_made = True
                            needs_refresh = True
                        except Exception as e:
                            print("(gf) Failed to splice {} into next: {}".format(current["ref"].normal(), e))
                else:
                    print("(g0) Did not match 'Gemara' in {}".format(current["ref"].normal()))
            else:
                print("Unexpect type: {}".format(current["type"]))
                exit()

            # Adjust any later elements
            # Any element that needs adjustment, pop from booklist and put in next_list
            if change_made:
                for i, item in enumerate(booklist):
                    if splc._needs_rewrite(item["ref"]):
                        print("* Rewriting ref {} ...".format(item["ref"]))
                        item["ref"] = splc._rewrite(item["ref"])
                        print("...to {}".format(item["ref"]))
                        next_list.append(item)
                        booklist[i] = None
                booklist = [n for n in booklist if n is not None]

        except IndexError:
            # once booklist is done, refresh counts, move next_list to booklist, start again
            if splc:
                refresh_count += 1
                if live:
                    splc.refresh_states()
                    Ref.clear_cache()
            needs_refresh = False
            booklist = next_list
            next_list = []
    if splc and needs_refresh:
        refresh_count += 1
        if live:
            splc.refresh_states()
            Ref.clear_cache()

print("Mishnah count: {}".format(m_count))
print("Gemara count: {}".format(g_count))
print("Refresh count: {}".format(refresh_count))

# Write out the new Mishnah Map
if writeMishnahMapChanges:
    with open(filename, "wb") as csvfile:
        cwriter = csv.writer(csvfile)
        cwriter.writerow(['Book','Mishnah Chapter','Start Mishnah','End Mishnah','Start Daf','Start Line','End Daf','End Line'])
        for row in mishnah_map:
            if row["new_ref"] and row["new_ref"] != row["orig_ref"]:
                row["line"][5] = row["new_ref"].sections[1]
                row["line"][7] = row["new_ref"].toSections[1]
            cwriter.writerow(row["line"])


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
