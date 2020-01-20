# -*- coding: utf-8 -*-

import argparse
import django
django.setup()
from sefaria.model import *
from sefaria.clean import *



""" The main function, runs when called from the CLI"""
if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument("-r", "--ref", help="ref")
    parser.add_argument("-d", "--delete_links", help="delete the bad links", action="store_true")
    parser.add_argument("-m", "--manual_links", help="Detect manual links that are bad", action="store_true")
    parser.add_argument("-a", "--auto_links", help="Detect automatically generated links that are bad", action="store_true")
    parser.add_argument("-e", "--check_text_exists", help="Also make sure there is actual text at the links", action="store_true")
    args = parser.parse_args()
    print(args)

    broken_link_res = broken_links(args.ref, args.auto_links, args.manual_links, args.delete_links, args.check_text_exists)