# -*- coding: utf-8 -*-

import django

django.setup()

import re
from sefaria.model import *


# TODO -
#      - check each of the segments in the Talmud range, is it majority not caps - then flag. Can still output the ranged ref
#      -


# The goal of this script is to identify broken links in the connections between
# the mishnah and talmud refs as found in the German text.
def clean_text(german_text):
    german_text = str(german_text)
    german_text = TextChunk._strip_itags(german_text)
    text_array = re.sub(r"\[|\]|\{|\}|<small>|<\/small>", "", german_text)
    return text_array


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


def check_uppercase_percentage(talmud_ref, mishnah_ref):
    german_text = get_german_text(talmud_ref)
    if german_text:
        percent_uppercase = (sum(1 for c in german_text if c.isupper()) / len(german_text)) * 100
    else:
        percent_uppercase = -1 # Not applicable
    flagged_bad_link = percent_uppercase <= 50
    cur_link_data = {'mishnah_tref': mishnah_ref.normal(),
                     'talmud_tref': talmud_ref.normal(),
                     'percent_uppercase': percent_uppercase,
                     'german_text': german_text,
                     'flagged_bad_link': flagged_bad_link}
    if percent_uppercase <= 50:
        print(cur_link_data)
    return cur_link_data

def generate_data_append_to_list(data_list, talmud_ref, mishnah_ref):
    cur_data = check_uppercase_percentage(talmud_ref, mishnah_ref)
    data_list.append(cur_data)

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
    passage_set = PassageSet({'type': 'Mishnah'})
    for each in passage_set:
        print(each.ref_list)


if __name__ == "__main__":
    phase_one()
    # phase_two()
