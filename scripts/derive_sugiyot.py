# encoding=utf-8
import django
django.setup()

import csv
from optparse import OptionParser
from sefaria.model import *


class SugyaDeriver(object):
    sugya_symbol = '§'

    def __init__(self, title):
        self.title = title
        self.index = library.get_index(title)
        self.sugyah_start_refs = self.get_sugyah_start_refs()
        self.mishnah_range_pairs = self.get_mishnah_pairs()
        self.mishnah_range_refs = [d["talref"] for d in self.mishnah_range_pairs]
        self.perek_starts = self.get_perek_starts()

        self.all_ranges = self.get_all_ranges()  # [{"ref":ref, "type":"Sugya" or "Mishnah"}]
        self.sugya_range_refs = [d["ref"] for d in self.all_ranges if d["type"] == "Sugya"]

    def get_sugyah_start_refs(self):
        segs = [s for s in self.index.all_segment_refs()]
        return [ref for ref in segs if self.sugya_symbol in ref.text("en").text]

    def get_mishnah_pairs(self):
        ds = []

        ls = LinkSet({"type": 'mishnah in talmud', "refs": {"$regex": "^" + self.title}})
        for l in ls:
            talref, mref = [Ref(r) for r in l.refs]
            assert isinstance(talref, Ref)
            assert isinstance(mref, Ref)

            if not talref.is_talmud():
                talref, mref = mref, talref

            ds += [{"_order": talref.order_id(), "talref": talref, "mref": mref}]
        return sorted(ds, key=lambda d: d["_order"])

    def get_perek_starts(self):
        # return dictionary of perek-starting mishnah ranges
        current_perek = 0
        res = {}
        for d in self.mishnah_range_pairs:
            if d["mref"].sections[0] != current_perek:
                res[d["talref"].normal()] = 1
                current_perek = d["mref"].sections[0]
        return res

    def is_perek_start(self, mishnah_ref):
        return self.perek_starts.get(mishnah_ref.normal())

    def get_all_ranges(self):
        """
        Returns list of {ranged ref, type}
        """
        results = []

        sug_indx = msh_indx = 0
        len_sugs = len(self.sugyah_start_refs)
        len_mshs = len(self.mishnah_range_refs)

        text_remains = True
        hit_last_msh = False
        current_start = None

        while text_remains:
            next_sug = self.sugyah_start_refs[sug_indx]
            next_msh = self.mishnah_range_refs[msh_indx]

            # Skip sugyot in the middle of mishnayot
            if next_msh.contains(next_sug) or next_msh.next_segment_ref() == next_sug:
                sug_indx += 1
                if sug_indx >= len_sugs:
                    text_remains = False
                continue

            # what comes first, the next sugyah or the next mishnah?
            msh_is_next = next_msh.starting_ref().precedes(next_sug) and not hit_last_msh

            if msh_is_next:
                # Finish current range the segment before
                if current_start:
                    if self.is_perek_start(next_msh):
                        # Skip the hadran at end of perek
                        current_range = current_start.to(next_msh.prev_segment_ref().prev_segment_ref())
                    else:
                        current_range = current_start.to(next_msh.prev_segment_ref())
                    results += [{"ref": current_range, "type": "Sugya"}]

                # add mishnah to list
                results += [{"ref": next_msh, "type": "Mishnah"}]
                if msh_indx + 1 < len_mshs:
                    msh_indx += 1

                    # Check for edge case, where perek ends with a Mishnah (Nedarim 63b-64a)
                    msh_after = self.mishnah_range_refs[msh_indx]
                    if self.is_perek_start(msh_after) and next_msh.ending_ref().distance(msh_after.starting_ref(), 2) == 2:
                        next_msh = msh_after
                        results += [{"ref": next_msh, "type": "Mishnah"}]
                        if msh_indx + 1 < len_mshs:
                            msh_indx += 1
                        else:
                            hit_last_msh = True
                else:
                    hit_last_msh = True

                # start next sugyah range at the next segment
                current_start = next_msh.next_segment_ref()

            else: # sugya next
                assert current_start

                # Finish current range the segment before
                results += [{"ref": current_start.to(next_sug.prev_segment_ref()), "type": "Sugya"}]

                # start next sugyah range there
                current_start = next_sug
                sug_indx += 1

                # Special case last sugyah (assuming we don't end of a Mishnah - isn't there one in kodshim?)
                if sug_indx >= len_sugs:
                    results += [{"ref": current_start.to(current_start.last_segment_ref().prev_segment_ref()), "type": "Sugya"}]
                    text_remains = False

        return results



if __name__ == '__main__':
    parser = OptionParser()
    parser.add_option("-t", "--tractate", dest="tractate", help="Name of tractate to parse. Input 'all' to parse everything")

    options, user_args = parser.parse_args()

    if options.tractate:
        mesechtot = [options.tractate]
    else:
        mesechtot = ["Beitzah", "Chagigah", "Gittin", "Ketubot", "Kiddushin",
                     "Megillah", "Moed Katan", "Nazir", "Nedarim", "Rosh Hashanah", "Sotah", "Sukkah", "Taanit",
                     "Yevamot", "Yoma", "Bava Kamma", "Bava Metzia", "Bava Batra", "Sanhedrin"]

    for m in mesechtot:
        print(m)
        mesechet = SugyaDeriver(m)

        with open('../data/sugyot/{}.csv'.format(m), 'w') as csvfile:
            fieldnames = ["ref", "type"]
            writer = csv.DictWriter(csvfile, fieldnames=fieldnames, extrasaction='ignore')

            writer.writeheader()
            for d in mesechet.all_ranges:
                writer.writerow(d)
