# -*- coding: utf-8 -*-
import sys
import os
import re 
import copy

from datetime import datetime
from pprint import pprint

import texts as sefaria

toc_cache = []

# Giant list ordering or categories
# indentation and inclusion of duplicate categories (like "Seder Moed")
# is for readabiity only. The table of contents will follow this structure. 
order = [ 
	"Tanach",
		"Torah",
		"Prophets",
		"Writings",
	'Commentary',
	"Mishna",
		"Seder Zeraim", 
		"Seder Moed", 
		"Seder Nashim", 
		"Seder Nezikin", 
		"Seder Kodashim", 
		"Seder Tahorot",
	"Tosefta",
		"Seder Zeraim", 
		"Seder Moed", 
		"Seder Nashim", 
		"Seder Nezikin", 
		"Seder Kodashim", 
		"Seder Tahorot",
	"Talmud",
		"Bavli",
				"Seder Zeraim", 
				"Seder Moed", 
				"Seder Nashim", 
				"Seder Nezikin", 
				"Seder Kodashim", 
				"Seder Tahorot",
		"Yerushalmi",
				"Seder Zeraim", 
				"Seder Moed", 
				"Seder Nashim", 
				"Seder Nezikin", 
				"Seder Kodashim", 
				"Seder Tahorot",
	"Midrash",
	"Halakhah",
		"Mishneh Torah",
			'Introduction',
			'Sefer Madda',
			'Sefer Ahavah',
			'Sefer Zemanim',
			'Sefer Nashim',
			'Sefer Kedushah',
			'Sefer Haflaah',
			'Sefer Zeraim',
			'Sefer Avodah',
			'Sefer Korbanot',
			'Sefer Taharah',
			'Sefer Nezikim',
			'Sefer Kinyan',
			'Sefer Mishpatim',
			'Sefer Shoftim',
		"Shulchan Arukh",
	"Kabbalah",
	'Liturgy',
	'Philosophy', 
	'Chasidut',
	'Musar',
	'Responsa', 
	'Elucidation', 
	'Modern', 
	'Other',
			'Onkelos Genesis',
			'Onkelos Exodus',
			'Onkelos Leviticus',
			'Onkelos Numbers',
			'Onkelos Deuteronomy',
			'Targum Jonathan on Genesis',
			'Targum Jonathan on Exodus',
			'Targum Jonathan on Leviticus',
			'Targum Jonathan on Numbers',
			'Targum Jonathan on Deuteronomy',
]

def get_toc():
	"""
	Returns table of contents object from in-memory cache,
	DB or by generating it, as needed. 
	"""
	global toc_cache
	if toc_cache:
		return toc_cache

	toc = get_toc_from_db()
	if toc:
		save_toc(toc)
		return toc

	return update_table_of_contents()
	

def save_toc(toc):
	"""
	Saves the table of contents object to in-memory cache. 
	"""
	global toc_cache
	toc_cache = toc
	sefaria.delete_template_cache("texts_list")


def get_toc_from_db():
	"""
	Retrieves the table of contents stored in MongoDB.
	"""
	toc = sefaria.db.summaries.find_one({"name": "toc"})
	return toc["contents"] if toc else None


def save_toc_to_db():
	"""
	Saves table of contents to MongoDB.
	(This write can be slow.) 
	"""
	sefaria.db.summaries.remove()
	toc_doc = {
		"name": "toc",
		"contents": toc_cache,
		"dateSaved": datetime.now(),
	}
	sefaria.db.summaries.save(toc_doc)


def update_table_of_contents():
	toc = []

	# Add an entry for every text we know about
	indices = sefaria.db.index.find()
	for i in indices:
		del i["_id"]
		if i["categories"][0] == "Commentary":
			# Special case commentary below
			continue
		if i["categories"][0] not in order:
			i["categories"].insert(0, "Other")
		node = get_or_make_summary_node(toc, i["categories"])
		text = add_counts_to_index(i)
		node.append(text)

	# Special handling to list available commentary texts which do not have
	# individual index records
	commentary_texts = sefaria.get_commentary_texts_list()
	for c in commentary_texts:
		i = sefaria.get_index(c)
		node = get_or_make_summary_node(toc, i["categories"])
		text = add_counts_to_index(i)
		node.append(text)

	# Annotate categories nodes with counts
	for cat in toc:
		add_counts_to_category(cat)

	# Recursively sort categories and texts
	toc = sort_toc_node(toc, recur=True)

	save_toc(toc)
	return toc


def update_summaries_on_change(ref, old_ref=None, recount=True):
	"""
	Update text summary docs to account for change or insertion of 'text'
	* recount - whether or not to perform a new count of available text
	"""
	global toc
	toc = get_toc()
	index = sefaria.get_index(ref)
	if "error" in index:
		return index

	if recount:
		sefaria.update_text_count(ref)

	resort_other = False
	if index["categories"][0] not in order:
		index["categories"].insert(0, "Other")
		resort_other = True

	node = get_or_make_summary_node(toc, index["categories"])
	text = add_counts_to_index(index)
	
	found = False
	test_title = old_ref or text["title"]
	for item in node:
		if item.get("title") == test_title:
			item.update(text)
			found = True
			break
	if not found:
		node.append(text)
		node[:] = sort_toc_node(node)

	# If a new category may have been added to other, resort the cateogries
	if resort_other:
		toc[-1]["contents"] = sort_toc_node(toc[-1]["contents"])

	save_toc(toc)


def update_summaries():
	"""
	Update all stored documents which summarize known and available texts
	"""
	update_table_of_contents()
	sefaria.reset_texts_cache()
	

def get_or_make_summary_node(summary, nodes):
	"""
	Returns the node in 'summary' that is named by the list of categories in 'nodes',
	creates the node if it doesn't exist.
	Used recursively on sub-summaries.
	"""
	if len(nodes) == 1:
	# Basecase, only need to search through on level 
		for node in summary:
			if node.get("category") == nodes[0]:
				return node["contents"]
		# we didn't find it, so let's add it
		summary.append({"category": nodes[0], "contents": []})
		return summary[-1]["contents"]

	# Look for the first category, or add it, then recur
	for node in summary:
		if node.get("category") == nodes[0]:
			return get_or_make_summary_node(node["contents"], nodes[1:])
	summary.append({"category": nodes[0], "contents": []})
	return get_or_make_summary_node(summary[-1]["contents"], nodes[1:])


def add_counts_to_index(text):
	"""
	Returns a dictionary representing a text which includes index info,
	and text counts.
	"""
	count = sefaria.db.counts.find_one({"title": text["title"]}) or \
			 sefaria.update_text_count(text["title"])
	if not count:
		return text

	if count and "percentAvailable" in count:
		text["percentAvailable"] = count["percentAvailable"]

	text["availableCounts"] = make_available_counts_dict(text, count)

	return text


def make_available_counts_dict(index, count):
	"""
	For index and count doc for a text, return a dictionary 
	which zips together section names and available counts. 
	Special case Talmud. 
	"""
	counts = {"en": {}, "he": {} }
	if count and "sectionNames" in index and "availableCounts" in count:
		for num, name in enumerate(index["sectionNames"]):
			if "Talmud" in index["categories"] and name == "Daf":
				counts["he"]["Amud"] = count["availableCounts"]["he"][num]
				counts["he"]["Daf"]  = counts["he"]["Amud"] / 2
				counts["en"]["Amud"] = count["availableCounts"]["en"][num]
				counts["en"]["Daf"]  = counts["en"]["Amud"] / 2
			else:
				counts["he"][name] = count["availableCounts"]["he"][num]
				counts["en"][name] = count["availableCounts"]["en"][num]
	
	return counts


def add_counts_to_category(cat, parents=[]):
	"""
	Recursively annotate catetory 'cat' as well as any subcategories with count info.
	- parent - optionally specficfy parent categories so that e.g, Seder Zeraim in Mishnah 
	can be diffentiated from Seder Zeraim in Talmud. 

	Adds the fields to cat:
	* availableCounts
	* textComplete
	* percentAvailable
	* num_texts
	"""
	cat_list = parents + [cat["category"]]

	# Recur on any subcategories
	for subcat in cat["contents"]:
		if "category" in subcat:
			add_counts_to_category(subcat, parents=cat_list)

	counts = sefaria.get_category_count(cat_list) or sefaria.count_category(cat_list)
	cat.update(counts)

	# count texts in this category by summing sub counts and counting texts
	cat["num_texts"] = 0
	for item in cat["contents"]:
		if "category" in item:
			# add sub cat for a subcategory
			cat["num_texts"] += item["num_texts"]
		elif "title" in item:
			# add 1 for each indvidual text
			cat["num_texts"] += 1


def sort_toc_node(node, recur=False):
	"""
	Sort the texts and categories in node according to:
	1. the order of categories and texts listed in the global var 'order'
	2. the order field on a text
	3. alphabetically

	If 'recur', call sort_toc_node on each category in 'node' as well.
	"""
	def node_sort(a):
		if "category" in a:
			try:
				return order.index(a["category"])
			except ValueError:
				return a["category"]
		elif "title" in a:
			try:
				return order.index(a["title"])
			except ValueError:
				if "order" in a:
					return a["order"][0]
				else:
					return a["title"]

		return None

	node = sorted(node, key=node_sort)

	if recur:
		for cat in node:
			if "category" in cat:
				cat["contents"] = sort_toc_node(cat["contents"], recur=True)

	return node
