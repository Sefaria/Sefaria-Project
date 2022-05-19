# -*- coding: utf-8 -*-

import django

django.setup()

import csv
import re
from sefaria.model import *

ls = LinkSet({"type": "mishnah in talmud"})

# Delete the existing LinkSet()
LinkSet({"type": "mishnah in talmud"}).delete()


# For each row in CSV - create a link
def create_link(row):
    link_param_dict = {'type': 'mishnah in talmud',
                       'auto': 'true',
                       'generated_by': 'mishnah_map'}
    ref_list = []

    mishnah_name = row[0]
    mishnah_ref = f"{row[1]}:{row[2]}"
    ref_list.append(f"{mishnah_name} {mishnah_ref}")

    talmud_name = re.sub('Mishnah', '', mishnah_name)
    talmud_start_daf = row[4]
    talmud_start_line = row[5]
    talmud_end_daf = row[6]
    talmud_end_line = row[7]

    # If the ref goes through two dapim
    if talmud_start_daf != talmud_end_daf:
        ref_list.append(f"{talmud_name} {talmud_start_daf}:{talmud_start_line}-{talmud_end_daf}:{talmud_end_line}")

    # if the ref is on one daf, multiple lines
    elif talmud_start_line != talmud_end_line:
        ref_list.append(f"{talmud_name} {talmud_start_daf}:{talmud_start_line}-{talmud_end_line}")

    # if the ref is to one Talmud line
    else:
        ref_list.append(f"{talmud_name} {talmud_start_daf}:{talmud_start_line}")

    link_param_dict['refs'] = ref_list
    print(link_param_dict)
    try:
        Link(link_param_dict).save()
    except:
        print('Already exists?')


# Ingest the corrected CSV
with open('correct_links.csv', newline='') as csvfile:
    csv_reader = csv.reader(csvfile, delimiter=',')
    # Skipping the headers
    next(csv_reader)
    for row in csv_reader:
        create_link(row)
