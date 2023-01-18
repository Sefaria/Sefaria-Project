# -*- coding: utf-8 -*-

import django

django.setup()

import csv
import re
from sefaria.model import *
from sefaria.model.schema import AddressTalmud


# The goal of this script is to identify broken links in the connections between
# the mishnah and talmud refs as found in the German text.
def clean_text(german_text):
    german_text = str(german_text)
    german_text = TextChunk.strip_itags(german_text)
    text_array = re.sub(r"\[|\]|\{|\}|<small>|<\/small>", "", german_text)
    return text_array


# This function generates a CSV given a list of dicts
def generate_csv(dict_list, headers, file_name):
    with open(f'{file_name}.csv', 'w+') as file:
        c = csv.DictWriter(file, fieldnames=headers)
        c.writeheader()
        c.writerows(dict_list)

    print(f"File writing of {file_name} complete")


def get_ref_from_link(mishnah_talmud_link):
    mishnah_ref, talmud_ref = mishnah_talmud_link.refs if "Mishnah" in mishnah_talmud_link.refs[0] else reversed(
        mishnah_talmud_link.refs)
    return Ref(mishnah_ref), Ref(talmud_ref)


def remove_quotes(text):
    res = re.sub(r"(<i>.*?<\/i>)", '', text)
    return res


def get_german_text(talmud_ref):
    german_text = talmud_ref.text('en', vtitle='Talmud Bavli. German trans. by Lazarus Goldschmidt, 1929 [de]')
    german_text = german_text.text
    german_text = clean_text(german_text)
    german_text = remove_quotes(german_text)
    return german_text


def check_uppercase_percentage(talmud_ref):
    german_text = get_german_text(talmud_ref)
    if german_text:
        percent_uppercase = (sum(1 for c in german_text if c.isupper()) / len(german_text)) * 100
    else:
        percent_uppercase = -1  # Not applicable
    return percent_uppercase, german_text


def generate_data_append_to_list(data_list, talmud_ref, mishnah_ref, checking):
    percent_uppercase, german_text = check_uppercase_percentage(talmud_ref)
    mishnah_tref = "N.A" if isinstance(mishnah_ref, str) else mishnah_ref.normal()
    cur_link_data = {'mishnah_tref': mishnah_tref,
                     'talmud_tref': talmud_ref.normal(),
                     'german_text': german_text}

    if checking == 'false-positive':
        if 50 >= percent_uppercase > 0:
            cur_link_data['issue'] = 'False positive'
            data_list.append(cur_link_data)

    elif checking == 'false-negative':
        if percent_uppercase >= 50 and len(cur_link_data['german_text']) > 50:
            cur_link_data['issue'] = 'False negative'
            data_list.append(cur_link_data)

    return cur_link_data


def get_list_link_talmud_segments():
    ls = LinkSet({"type": "mishnah in talmud"})
    linkset_list_mishnah_in_talmud_segments = []
    for link in ls:
        mishnah_ref, talmud_ref = get_ref_from_link(link)
        if talmud_ref.is_range():
            for ref in talmud_ref.range_list():
                linkset_list_mishnah_in_talmud_segments.append(ref.normal())
        else:
            linkset_list_mishnah_in_talmud_segments.append(talmud_ref.normal())
    return set(linkset_list_mishnah_in_talmud_segments)


# Phase One: Report on all lowercase heavy Talmud pieces
def phase_one():
    ls = LinkSet({"type": "mishnah in talmud"})
    data_list = []
    for link in ls:
        mishnah_ref, talmud_ref = get_ref_from_link(link)
        if talmud_ref.is_range():
            for ref in talmud_ref.range_list():
                generate_data_append_to_list(data_list, ref, mishnah_ref, checking='false-positive')
        else:
            generate_data_append_to_list(data_list, talmud_ref, mishnah_ref, checking='false-positive')

    # CSV
    csv_list = []
    for each in data_list:
        if 'issue' in each:
            csv_list.append(each)

    return csv_list


# Cross check against all of Talmud
def phase_two(csv_list):
    linkset_segments = get_list_link_talmud_segments()

    # action - check if tref is in mishnah map. If it is, ignore.
    # Else, check if text of segment is maj. all caps. If it is, flag as false negative.
    def action(segment_str, tref, he_tref, version):
        if tref not in linkset_segments:
            generate_data_append_to_list(csv_list, Ref(tref), 'replace with mishnah ref', checking='false-negative')

    bavli_indices = library.get_indexes_in_category("Bavli", full_records=True)

    count = 0
    for index in bavli_indices:
        german_talmud = Version().load(
            {"title": index.title, "versionTitle": 'Talmud Bavli. German trans. by Lazarus Goldschmidt, 1929 [de]'})
        if german_talmud:
            german_talmud.walk_thru_contents(action)
            count += 1

    return csv_list


def convert_to_daf(daf_index):
    addr = AddressTalmud(0)
    return addr.toStr('en', daf_index)


def generate_map_from_links():
    ls = LinkSet({"type": "mishnah in talmud"})
    csv_list = []
    for link in ls:
        cur_row = {}
        mishnah_ref, talmud_ref = get_ref_from_link(link)
        cur_row['Book'] = mishnah_ref.index.title
        cur_row['Mishnah Chapter'] = mishnah_ref.sections[0]
        cur_row['Start Mishnah'] = mishnah_ref.sections[1]
        cur_row['End Mishnah'] = mishnah_ref.toSections[1]
        cur_row['Start Daf'] = convert_to_daf(talmud_ref.sections[0])
        cur_row['Start Line'] = talmud_ref.sections[1]
        cur_row['End Daf'] = convert_to_daf(talmud_ref.toSections[0])
        cur_row['End Line'] = talmud_ref.toSections[1]
        csv_list.append(cur_row)

    csv_list.sort(key=lambda x: Ref(f"{x['Book']} {x['Mishnah Chapter']}:{x['Start Mishnah']}").order_id())

    generate_csv(csv_list, ['Book',
                            'Mishnah Chapter',
                            'Start Mishnah',
                            'End Mishnah',
                            'Start Daf',
                            'Start Line',
                            'End Daf',
                            'End Line'], 'links_mappings_new')


def false_pos_false_neg_check():
    csv_list = phase_one()
    csv_list = phase_two(csv_list)
    csv_list.sort(key=lambda x: Ref(x["talmud_tref"]).order_id())
    generate_csv(csv_list, ['mishnah_tref', 'talmud_tref', 'german_text', 'issue'], "fn_fp_issues")


if __name__ == "__main__":
    # runs the FN / FP test
    false_pos_false_neg_check()

    # Generates a map for QA
    # generate_map_from_links()
