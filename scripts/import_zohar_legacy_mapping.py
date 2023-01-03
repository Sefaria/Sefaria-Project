import django
django.setup()
from sefaria.model import *
import json
from sefaria.helper.legacy_ref import LegacyRefParsingData


def get_raw_mapping():
    with open("data/private/zohar_map_old_to_new.json", "r") as fin:
        return json.load(fin)


def transform_raw_mapping(raw_mapping):
    return {
        "index_title": "Zohar",
        "data": {
           "mapping": {
                old_ref: new_ref.replace(" TNNG", "") for old_ref, new_ref in raw_mapping.items() if new_ref is not None
           }
        }
    }


def save_mapping_data(mapping_data):
    LegacyRefParsingData(mapping_data).save()


if __name__ == '__main__':
    raw_mapping = get_raw_mapping()
    mapping_data = transform_raw_mapping(raw_mapping)
    save_mapping_data(mapping_data)
