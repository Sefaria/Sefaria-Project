# -*- coding: utf-8 -*-
import urllib.request, urllib.parse, urllib.error
import urllib.request, urllib.error, urllib.parse
from urllib.error import URLError, HTTPError
import json 
import pdb
import os
import sys
import re

from sefaria.model import *
from sefaria.helper.text import *
import csv
import argparse
import pdb

if __name__ == "__main__":
	parser = argparse.ArgumentParser()
	parser.add_argument("-t", "--title", help="title of book", default="")
	parser.add_argument("-v", "--version", help="version title to be copied", default="")
	parser.add_argument("-u", "--uid", help="UID: user id", default="15399")
	parser.add_argument("-l", "--language", help="language: he or en", default='')

	args = parser.parse_args()
	if not args.version or not args.language or not args.title:
		print("Need to specify title of book, its language, and its version title.")
		print("Title of book specified: '"+args.title+"'")
		print("Language specified: '"+args.language+"'")
		print("Version title specified: '"+args.version+"'")
	elif args.language != 'en' and args.language != 'he':
		print("Language must be either English ('en') or Hebrew ('he').  The language you specified: "+args.language+" is not 'he' or 'en'.")
	else:
		vtitle = args.version
		uid = args.uid
		lang = args.language
		title = args.title
		csvfile = open('./data/temp/find_replace_'+lang+'.csv')
		reader = csv.reader(csvfile)
		find_strings = []
		replace_strings = []
		for row in reader:
			find_strings.append(row[0].decode('utf-8'))
			replace_strings.append(row[1].decode('utf-8'))

	
		for count in range(len(find_strings)):
			find_and_replace_in_text(title, vtitle, lang, find_strings[count], replace_strings[count], uid)
	
  	
