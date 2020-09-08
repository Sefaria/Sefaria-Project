# -*- coding: utf-8 -*-

"""
takes 3 command line arguments
first argument :: filename.opml
-t :: stores all items nodes in opml as shared terms (not including root)
-v :: saves any text stored in opml as notes to a single version
"""
import django
django.setup()
import argparse
import pprint
try:
    import xml.etree.cElementTree as ET
except ImportError:
    import xml.etree.ElementTree as ET
from sefaria.helper.text import WorkflowyParser



if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument("outline_file", help="The file containing the workflowy outline of the text")
    parser.add_argument("-t", "--term_scheme", help="Provide name of term scheme to save the titles as")
    parser.add_argument("-i", "--create_index", action="store_true", help="optional argument to create an Index object with the provided schema")
    parser.add_argument("-v", "--create_version", action="store_true", help="Optional argument to create a version from the notes on the outline. Requires an existing Index or one to be created")
    parser.add_argument("-d", "--delim", help="Optional argument for other delimiters")
    args = parser.parse_args()
    print(args)
    wfparser = WorkflowyParser(args.outline_file, args.term_scheme, args.create_index, args.create_version, args.delim)
    res = wfparser.parse()
    print(pprint.pprint(res))

