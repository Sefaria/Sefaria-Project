# -*- coding: utf-8 -*-

import django

django.setup()

import re
from sefaria.model import *
import csv


# The goal of this script is to identify broken links in the connections between
# the mishnah and talmud refs as found in the German text.
def clean_text(german_text):
    german_text = str(german_text)
    german_text = TextChunk._strip_itags(german_text)
    text_array = re.sub(r"\[|\]|\{|\}|<small>|<\/small>", "", german_text)
    return text_array

# This function generates a CSV given a list of dicts
def generate_csv(dict_list, headers, file_name):

    with open(f'mishnah_map_validation/{file_name}.csv', 'w') as file:
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


def generate_data_append_to_list(data_list, talmud_ref, mishnah_ref):
    percent_uppercase, german_text = check_uppercase_percentage(talmud_ref)
    flagged_bad_link = 50 >= percent_uppercase > 0
    cur_link_data = {'mishnah_tref': mishnah_ref.normal(),
                     'talmud_tref': talmud_ref.normal(),
                     'percent_uppercase': percent_uppercase,
                     'german_text': german_text,
                     'flagged_bad_link': flagged_bad_link}

    if 50 >= percent_uppercase > 0:
        cur_link_data['issue'] = 'Majority NOT uppercase'
    data_list.append(cur_link_data)
    return cur_link_data


# Phase One: Report on all lowercase heavy Talmud pieces
def phase_one():
    ls = LinkSet({"type": "mishnah in talmud"})
    data_list = []
    for link in ls:
        mishnah_ref, talmud_ref = get_ref_from_link(link)
        if talmud_ref.is_range():
            for ref in talmud_ref.range_list():
                generate_data_append_to_list(data_list, ref, mishnah_ref)
        else:
            generate_data_append_to_list(data_list, talmud_ref, mishnah_ref)

    # CSV
    # TODO - condense w filter?
    csv_list = []
    for each in data_list:
        if 'issue' in each:
            csv_list.append(each)
    generate_csv(csv_list, ['mishnah_tref', 'talmud_tref', 'percent_uppercase', 'german_text', 'flagged_bad_link', 'issue'], 'links_issues')



    # Phase Two - Cross check
# - Next step for mapping
#     -  Passage collection
#     - Not really used in prod at all
#     - Sugya less relevant, Mishnah more relevant
#         -
# - Validate collection
#     - Check each Mishnah’s segment
#     - If each talmud ref is majority capital
#     - Then a good db to use
# - Then use this (filtered for mishnahs) and use it as base
def phase_two():
    # Step One - Validate if a 'good' database
    passage_set = PassageSet({'type': 'Mishnah'})
    passage_list_mishnah_in_talmud_segments = []
    passage_csv_list =[]
    count_segments_not_majority_uppercase = 0
    for each in passage_set:
        for tref in each.ref_list:
            passage_list_mishnah_in_talmud_segments.append(tref)
            percent_uppercase = check_uppercase_percentage(Ref(tref))[0]
            if percent_uppercase < 50:
                count_segments_not_majority_uppercase += 1
                passage_csv_list.append({'talmud_ref': tref, 'issue': 'Majority NOT uppercase'})
    generate_csv(passage_csv_list, ['talmud_ref', 'issue'], 'passage_issues')

    print(
        f"Of the {len(passage_list_mishnah_in_talmud_segments)} passage segments, {count_segments_not_majority_uppercase} are not uppercase")
    # Checking link set
    ls = LinkSet({"type": "mishnah in talmud"})
    linkset_list_mishnah_in_talmud_segments = []
    for link in ls:
        mishnah_ref, talmud_ref = get_ref_from_link(link)
        if talmud_ref.is_range():
            for ref in talmud_ref.range_list():
                linkset_list_mishnah_in_talmud_segments.append(ref)
        else:
            linkset_list_mishnah_in_talmud_segments.append(talmud_ref)

    # Cross checking
    missing_segments = []
    for each_link_ref in linkset_list_mishnah_in_talmud_segments:
        if each_link_ref.normal() not in passage_list_mishnah_in_talmud_segments:
            missing_segments.append({'missing_link_ref': each_link_ref})

    print(f"There are {len(missing_segments)} unaccounted for segments of Mishnah in passages not in linkset")
    generate_csv(missing_segments, ['missing_link_ref'], 'missing_link_refs_in_passages')


if __name__ == "__main__":
    phase_one()
    phase_two()
