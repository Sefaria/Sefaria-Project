# -*- coding: utf-8 -*-

import django

django.setup()

import csv
import re
from sefaria.model import *


# This function generates a CSV given a list of dicts
def generate_csv(dict_list, headers, file_name):
    with open(f'{file_name}.csv', 'w+') as file:
        c = csv.DictWriter(file, fieldnames=headers)
        c.writeheader()
        c.writerows(dict_list)

    print(f"File writing of {file_name} complete")


def delete_linkset(type):
    # Delete the existing LinkSet()
    LinkSet({"type": type}).delete()


# For each row in CSV - create a link
def create_link(row):
    link_param_dict = {'type': 'mishnah in talmud',
                       'auto': 'true',
                       'generated_by': 'mishnah_map'}
    ref_list = []

    mishnah_name = row[0]
    if row[2] == row[3]:
        mishnah_ref = f"{mishnah_name} {row[1]}:{row[2]}"
    else:
        mishnah_ref = f"{mishnah_name} {row[1]}:{row[2]}-{row[3]}"

    ref_list.append(mishnah_ref)

    talmud_name = re.sub('Mishnah ', '', mishnah_name)
    talmud_start_daf = row[4]
    talmud_start_line = row[5]
    talmud_end_daf = row[6]
    talmud_end_line = row[7]

    # If the ref goes through two dapim
    if talmud_start_daf != talmud_end_daf:
        talmud_ref = f"{talmud_name} {talmud_start_daf}:{talmud_start_line}-{talmud_end_daf}:{talmud_end_line}"

    # if the ref is on one daf, multiple lines
    elif talmud_start_line != talmud_end_line:
        talmud_ref = f"{talmud_name} {talmud_start_daf}:{talmud_start_line}-{talmud_end_line}"

    # if the ref is to one Talmud line
    else:
        talmud_ref = f"{talmud_name} {talmud_start_daf}:{talmud_start_line}"

    ref_list.append(talmud_ref)

    link_param_dict['refs'] = ref_list

    try:
        Link(link_param_dict).save()
    except Exception as e:
        ref_list = [mishnah_ref, talmud_ref]
        ref_list.sort()
        ls = Link().load({"refs": ref_list})
        if ls and (ls.type == 'mesorat hashas' or ls.type == 'related' or ls.refs == ['Bava Batra 84b:5-6', 'Mishnah Bava Batra 5:7']):
            ls.update(query={"refs": ref_list}, attrs={'type': 'mishnah in talmud'})
        elif "A more precise link" in str(e):
            curlink = Link(link_param_dict)
            curlink._override_preciselink = True
            curlink.save()


def ingest_new_links():
    errors_csv = []
    delete_linkset('mishnah in talmud')
    print("Original linkset deleted")

    # Ingest the corrected CSV
    with open('../../data/Mishnah Map.csv', newline='') as csvfile:
        csv_reader = csv.reader(csvfile, delimiter=',')
        # Skipping the headers
        next(csv_reader)
        for row in csv_reader:
            create_link(row)

    print("All new links created")

    # generate the errors csv
    # generate_csv(dict_list=errors_csv,
    #              headers=['ref1 (trying to save)', 'ref2 (trying to save)', 'ref1 (exists)', 'ref2 (exists)'],
    #              file_name='errors')


ingest_new_links()
