# -*- coding: utf-8 -*-
"""
Normalizes backlog of source sheet tags so that there are no dupes.
"""
import sys
import os
import re
from collections import defaultdict

path = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, path)
sys.path.insert(0, path + "/sefaria")

from sefaria.utils.util import titlecase
from sefaria.system.database import db


def normalize_tags(query={}, test=True):
	sheets = db.sheets.find(query, {"tags": 1, "id": 1})
	for sheet in sheets:
		old_tags = sheet.get("tags", []);
		norm_tag_list = [normalize_tag(tag) for tag in old_tags]
		norm_tags = [tag for sublist in norm_tag_list for tag in sublist]

		if set(norm_tags) != set(old_tags):
			print("-------")
			print(sheet["id"])
			print(old_tags)
			print(norm_tags)
			if not test:
				db.sheets.update({"id": sheet["id"]}, {"$set": {"tags": norm_tags}})


FIXED_SUBS = {
	"Trade, Aid & Debt": "Trade, Aid & Debt",
	"Martin Luther King, Jr": "Martin Luther King",
	"#MeToo": "#MeToo",
	"#Metoo": "#MeToo",
	"Hanukah, Pesach and Purim Walk Into a Bar": "Hanukah Pesach Purim Walk Into a Bar",
}
def normalize_tag(tag):
	"""
	Returns an array of `tags` that `tag` normalizes to, which may be empty or multiple
	"""
	if tag in FIXED_SUBS:
		return [FIXED_SUBS[tag]]

	tag = re.sub('#(\d+)', "\g<1>", tag) # replace hash'd numbers ("#1" with just numbers)
	tag = tag.replace("#", ",") # remove # and treat as separator
	if tag.startswith("http"):  # scrub URLS
		return []
	if re.search('^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$', tag): # scrub email addresses
		return []
	tags = tag.split(",")
	tags = [tag for tag in tags if len(tag)]
	tags = [titlecase(tag.strip()) for tag in tags]
	tags = list(set(tags))
	return tags


def count_bad_tags():
	sheets = db.sheets.find({"tags": { "$regex": "[,#@]" }}, {"tags": 1, "id": 1, "owner": 1})
	tags = defaultdict(int)
	tag_owners = defaultdict(set)

	for sheet in sheets:
		for tag in sheet.get("tags", []):
			chars = (",", "#", "@")
			if any([char in tag for char in chars]):
				tags[tag] += 1
				tag_owners[tag].add(sheet["owner"])


	tags = sorted(tags.items(), key=lambda x: -x[1])
	for tag in tags:
		print("{} ({}, {})".format(tag[0], tag[1], len(tag_owners[tag[0]])))
		print(normalize_tag(tag[0]))

