# -*- coding: utf-8 -*-

from sefaria.model import *
from sefaria.model.schema import *
from convert_to_complex_text import *
from completely_delete_index_and_related import *

import json
import argparse
import csv



def build_schema_from_mapping(title, mappings):
    origIndex = Index().load({'title': title})
    en_primary_title = title
    he_primary_title = origIndex.get_title('he')
    new_mappings = [["old_ref", "new_ref"]]
    root = SchemaNode()
    root.add_title(en_primary_title, "en", primary=True)
    root.key = root.primary_title()
    root.add_title(he_primary_title, "he", primary=True)

    #now create a JaggedArrayNode for each entry in the mappings.
    for map in mappings:
        old_ref = map[0]
        en_title = map[1]
        he_title = map[2]
        n = JaggedArrayNode()
        n.add_title(en_title, "en", primary=True)
        n.add_title(he_title, "he", primary=True)
        n.key = n.primary_title()
        n.depth = origIndex.nodes.depth - 1
        n.sectionNames = origIndex.nodes.sectionNames[1:]
        n.addressTypes = origIndex.nodes.addressTypes[1:]
        n.append_to(root)
        new_mappings.append([old_ref,"{}, {}".format(title, en_title)])

    return (root.serialize(), new_mappings)






def create_complex_mappings(title, mappings):
    pass









""" The main function, runs when called from the CLI"""
if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument("title", help="title of existing index record")
    parser.add_argument("mapping_file", help="title of existing index record")
    args = parser.parse_args()
    print(args)
    with open(args.mapping_file, 'rb') as csvfile:
        mapping_csv = csv.reader(csvfile, delimiter='\t')
        mappings = []
        for entry in mapping_csv:
            mappings.append(entry)
    schema, new_mappings = build_schema_from_mapping(args.title, mappings)
    migrate_to_complex_structure(args.title, json.loads(json.dumps(schema)), new_mappings[1:])
    #print json.dumps(schema)
    #print new_mappings