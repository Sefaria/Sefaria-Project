# -*- coding: utf-8 -*-

import sys
import os
import re 
import copy

from pprint import pprint

import texts as sefaria
from counts import update_text_count, count_category

toc_cache = []

order = [ 
	"Tanach",
		"Torah",
		"Writings",
		"Prophets",
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
	"Halacha",
	"Kabbalah",
	'Liturgy',
	'Philosophy', 
	'Chasidut',
	'Musar',
	'Responsa', 
	'Elucidation', 
	'Modern', 
	'Commentary',
	'Other',
]

def get_toc():
	global toc_cache
	if toc_cache:
		return toc_cache
	toc = sefaria.db.summaries.find_one({"name": "toc"})
	if not toc:
		return update_table_of_contents()
	
	toc_cache = toc["contents"]
	return toc_cache


def save_toc(toc):
	global toc_cache
	toc_cache = toc

	sefaria.db.summaries.remove({"name": "toc"})		
	sefaria.db.summaries.save({"name": "toc", "contents": toc})
	sefaria.delete_template_cache("texts_list")


def update_table_of_contents():
	toc = []

	# Add an entry for every text we know about
	indices = sefaria.db.index.find()
	for i in indices:
		del i["_id"]
		if i["categories"][0] not in order:
			i["categories"].insert(0, "Other")
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


def update_summaries_on_change(ref, recount=True):
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
		update_text_count(ref)

	node = get_or_make_summary_node(toc, index["categories"])
	text = add_counts_to_index(index)
	
	found = False
	for item in node:
		if item.get("title") == text["title"]:
			item = text
			found = True
			break
	if not found:
		node.append(text)
		pprint(node)
		node = sort_toc_node(node)
		pprint(node)

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
	count = sefaria.db.counts.find_one({"title": text["title"]})
	if not count:
		count = update_text_count(text["title"])
		if not count:
			return text

	if count and "percentAvailable" in count:
		text["percentAvailable"] = count["percentAvailable"]

	text["availableCounts"] = make_available_counts_dict(text, count)

	return text


def add_counts_to_category(cat, parent=None):
	"""
	Recursively annotate catetory 'cat' as well as any subcategories with count info.
	- parent - optionally specficfy parent category so that e.g, Seder Zeraim in Mishnah 
	can be diffentiated from Seder Zeraim in Talmud. 

	Adds the fields to cat:
	* availableCounts
	* textComplete
	* percentAvailable
	* num_texts
	"""
	cat_query = [cat["category"], parent] if parent else cat["category"]
	counts = count_category(cat_query)
	cat.update(counts)

	# Recur on any subcategories
	for subcat in cat["contents"]:
		if "category" in subcat:
			add_counts_to_category(subcat, cat["category"])

	# count texts in this category by summing sub counts and counting texts
	cat["num_texts"] = 0
	for item in cat["contents"]:
		if "category" in item:
			# add sub cat for a subcategory
			cat["num_texts"] += item["num_texts"]
		elif "title" in item:
			# add 1 for each indvidual text
			cat["num_texts"] += 1


def make_available_counts_dict(index, count):
	"""
	For index and count doc for a text, return a dictionary 
	which zips together section names and available counts. 
	Special case Talmud. 
	"""
	cat = index["categories"][0]
	counts = {"en": {}, "he": {} }
	if count and "sectionNames" in index and "availableCounts" in count:
		for num, name in enumerate(index["sectionNames"]):
			if cat == "Talmud" and name == "Daf":
				counts["he"]["Amud"] = count["availableCounts"]["he"][num]
				counts["he"]["Daf"]  = counts["he"]["Amud"] / 2
				counts["en"]["Amud"] = count["availableCounts"]["en"][num]
				counts["en"]["Daf"]  = counts["en"]["Amud"] / 2
			else:
				counts["he"][name] = count["availableCounts"]["he"][num]
				counts["en"][name] = count["availableCounts"]["en"][num]
	
	return counts


def sort_toc_node(node, recur=False):
	"""
	Sort the texts and categories in node according to:
	- the order of categories listed in the global var 'order'
	- the order field on a text
	- alphabetically
	"""
	def node_sort(a):
		if "category" in a:
			try:
				return order.index(a["category"])
			except ValueError:
				return a["category"]
		elif "title" in a:
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
