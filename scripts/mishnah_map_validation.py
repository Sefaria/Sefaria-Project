# -*- coding: utf-8 -*-

import django

django.setup()

import roman
import statistics
import re
import csv
from sefaria.model import *


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


def get_german_text(talmud_ref):
    german_text = talmud_ref.text('en', vtitle='Talmud Bavli. German trans. by Lazarus Goldschmidt, 1929 [de]')
    german_text = german_text.text
    german_text = clean_text(german_text)
    return german_text


ls = LinkSet({"type": "mishnah in talmud"})
data_list = []
for link in ls:
    mishnah_ref, talmud_ref = get_ref_from_link(link)
    german_text = get_german_text(talmud_ref)
    percent_uppercase = (sum(1 for c in german_text if c.isupper()) / len(german_text)) * 100
    flagged_bad_link = True if percent_uppercase <= 50 else False
    cur_link_data = {'mishnah_tref': mishnah_ref.normal(),
                     'talmud_tref': talmud_ref.normal(),
                     'percent_uppercase': percent_uppercase,
                     'german_text': german_text,
                     'flagged_bad_link': flagged_bad_link}
    data_list.append(cur_link_data)
    if percent_uppercase <= 50:
        print(cur_link_data)




