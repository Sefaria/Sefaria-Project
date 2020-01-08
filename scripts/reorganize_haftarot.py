# -*- coding: utf-8 -*-
import django
django.setup()
import argparse
import sefaria.model as model
from sefaria.system.database import db
from sefaria.system.exceptions import InputError


try:
    import xml.etree.cElementTree as ET
except ImportError:
    import xml.etree.ElementTree as ET



def add_sephardic(filename):
    haftara_dict = {}

    xmltree = ET.parse(filename)
    root = xmltree.getroot()
    for parsha in root:
        attrs = parsha.attrib
        if "num" in attrs and int(attrs["num"]) <=  54:
            if "sephardic" in attrs:
                h_arr = []
                for i,h in enumerate(attrs["sephardic"].split(";")):
                    try:
                        r = model.Ref(h.strip())
                        h_arr.append(r)
                    except InputError as e:
                        r = model.Ref("{} {}".format(h_arr[i-1].book, h.strip()))
                        h_arr.append(r)

                haftara_dict[attrs["id"]] = {
                    "sephardic": [r.normal() for r in h_arr],
                }


    print(haftara_dict)

    all_calendar_parashot = db.parshiot.find({})
    for parasha in all_calendar_parashot:
        if isinstance(parasha["haftara"], list):
            parasha["haftara"] = {"ashkenazi": parasha["haftara"]}
        if parasha["parasha"] in haftara_dict:
            parasha["haftara"]["sephardi"] = haftara_dict[parasha["parasha"]]["sephardic"]
            print(parasha["date"])
            print(parasha["haftara"])
        db.parshiot.save(parasha)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument("-f", "--file", help="path of data xml")
    args = parser.parse_args()
    add_sephardic(args.file)