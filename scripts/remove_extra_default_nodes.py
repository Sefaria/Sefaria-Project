# -*- coding: utf-8 -*-

import argparse
parser = argparse.ArgumentParser(description='Find and repair default nodes that are only children of their parents.\nBy default will list changes to be made, but not write them to the database.')
parser.add_argument('-w', '--write', dest='make_changes', action='store_true',
                    help='Check and execute any changes.')
args = parser.parse_args()




from sefaria.model import *
from sefaria.helper.schema import merge_default_into_parent

ins = library.all_index_records()
for i in ins:
    for n in i.nodes.get_leaf_nodes():
        if n.is_default() and len(n.siblings()) == 0:
            print(n.full_title())
            if args.make_changes:
                merge_default_into_parent(n.parent)
