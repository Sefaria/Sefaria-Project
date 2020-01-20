__author__ = 'stevenkaplan'
from sefaria.model import *
from sefaria.model.schema import AddressTalmud
import os
def print_out_refs(daf, line, segment, prev_daf, prev_line, prev_segment):
    second = "{} {}:{}:{}".format(title, AddressTalmud.toStr("en", daf+1), line+1, segment+1)
    first = "{} {}:{}:{}".format(title, AddressTalmud.toStr("en", prev_daf+1), prev_line+1, prev_segment+1)
    print("First: {}".format(first))
    print("Second: {}\n".format(second))


def delete_same_line_cases(same_line_cases):
    for each_case in same_line_cases:
        ref_to_delete = Ref(each_case)
        print("Deleting {}'s text...".format(each_case))
        section_ref = ref_to_delete.section_ref()
        tc = TextChunk(section_ref, lang='he', vtitle="Vilna Edition")
        pos_in_text_arr = ref_to_delete.sections[2] - 1
        old_text = tc.text
        tc.text = tc.text[0:pos_in_text_arr] + tc.text[pos_in_text_arr+1:]
        assert len(old_text) - 1 == len(tc.text)
        tc.save(force_save=True)


def get_already_checked_indexes(file):
    indexes = set()
    for line in file:
        line = line.replace("\n", "")
        indexes.add(line)
    return indexes

if __name__ == "__main__":
    titles = library.get_indexes_in_category("Tosafot", include_dependant=True)
    diff_line_cases = 0
    same_line_cases = []
    for title in titles:
        text = TextChunk(Ref(title), lang='he').text
        prev = ""
        for daf in range(len(text)):
            for line in range(len(text[daf])):
                for segment in range(len(text[daf][line])):
                    curr = text[daf][line][segment]

                    if prev == curr and (prev_daf != daf or prev_line != line):
                        print_out_refs(daf, line, segment, prev_daf, prev_line, prev_segment)
                        diff_line_cases += 1
                    elif prev == curr:
                        same_line_cases.append("{} {}:{}:{}".format(title, AddressTalmud.toStr("en", daf+1), line+1, segment+1))

                    prev = curr
                    prev_segment = segment
                    prev_line = line
                    prev_daf = daf

    delete_same_line_cases(same_line_cases)