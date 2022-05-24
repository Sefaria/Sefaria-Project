import django

django.setup()

import re
import csv
from sefaria.model import *


# This function generates a CSV given a list of dicts
def generate_csv(dict_list, headers, file_name):
    with open(f'{file_name}.csv', 'w+') as file:
        c = csv.DictWriter(file, fieldnames=headers)
        c.writeheader()
        c.writerows(dict_list)

    print(f"File writing of {file_name} complete")


def find_all_footnote_errors():
    from sefaria.tracker import modify_bulk_text
    corrected_text = {}
    csv_list = []

    def correct_text(s, en_tref, he_tref, v):
        nonlocal corrected_text
        nonlocal csv_list
        # Can't assume you can replace each instance
        # word, a/b/c/d/ supertag
        # phrase, letter at start of phrase, -letter at end.... In the beginning <sup>a</sup><i class="footnote">footnote footnote</i> G-d created <sup>-a</sup>
        # end is lingering, the dash a.
        # TODO - fix regex, corrected text should only be filled in when a change
        s_modified = re.sub(r"(<sup>)-[a-z]", r"<sup class='endFootnote'>\1", s)
        if "<sup>" in s:
            csv_list.append({'ref': en_tref, 'txt': s})
        if s_modified != s:
            print(en_tref)
            print(s_modified)
        corrected_text[en_tref] = s

    tanakh_indices = library.get_indexes_in_corpus("Tanakh", full_records=True)
    for index in tanakh_indices:
        corrected_text = {}
        version = Version().load({"title": index.title,
                                  "versionTitle": "Tanakh: The Holy Scriptures, published by JPS"})
        print(f"Walking through {index.title}")
        version.walk_thru_contents(correct_text)
        # modify_bulk_text(1, version, corrected_text) # checking - pull up every <sup> and eyeball
    generate_csv(csv_list, ['ref', 'txt'], 'example_search.csv')


find_all_footnote_errors()
