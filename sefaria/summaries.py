# -*- coding: utf-8 -*-
"""
summaries.py - create and manage Table of Contents document for all texts

Writes to MongoDB Collection: summaries
"""
from datetime import datetime
from pprint import pprint

import texts
import counts
from database import db

toc_cache = []

# Giant list ordering or categories
# indentation and inclusion of duplicate categories (like "Seder Moed")
# is for readabiity only. The table of contents will follow this structure. 
order = [ 
	"Tanach",
		"Torah",
			"Genesis",
			"Exodus",
			"Leviticus",
			"Numbers",
			"Deuteronomy",
		"Prophets",
		"Writings",
	'Commentary',
	"Mishnah",
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
		'Siddur',
	'Philosophy', 
	'Chasidut',
	'Musar',
	'Responsa', 
	'Elucidation', 
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
	Saves the table of contents object to in-memory cache,
	invalidtes texts_list cache.
	"""
	global toc_cache
	toc_cache = toc
	texts.delete_template_cache("texts_list")


def get_toc_from_db():
	"""
	Retrieves the table of contents stored in MongoDB.
	"""
	toc = db.summaries.find_one({"name": "toc"})
	return toc["contents"] if toc else None


def save_toc_to_db():
	"""
	Saves table of contents to MongoDB.
	(This write can be slow.) 
	"""
	db.summaries.remove()
	toc_doc = {
		"name": "toc",
		"contents": toc_cache,
		"dateSaved": datetime.now(),
	}
	db.summaries.save(toc_doc)


def update_table_of_contents():
	toc = []

	# Add an entry for every text we know about
	indices = db.index.find()
	for i in indices:
		del i["_id"]
		if i["categories"][0] == "Commentary":
			# Special case commentary below
			continue
		if i["categories"][0] not in order:
			i["categories"].insert(0, "Other")
		node = get_or_make_summary_node(toc, i["categories"])
		#the toc "contents" attr is returned above so for each text appends the counts and index info
		text = add_counts_to_index(i)
		node.append(text)

	# Special handling to list available commentary texts which do not have
	# individual index records
	commentary_texts = texts.get_commentary_texts_list()
	for c in commentary_texts:
		i = texts.get_index(c)
		node = get_or_make_summary_node(toc, i["categories"])
		text = add_counts_to_index(i)
		node.append(text)

	# Annotate categories nodes with counts
	for cat in toc:
		add_counts_to_category(cat)

	# Recursively sort categories and texts
	toc = sort_toc_node(toc, recur=True)

	save_toc(toc)
	save_toc_to_db()

	return toc


def update_summaries_on_change(ref, old_ref=None, recount=True):
	"""
	Update text summary docs to account for change or insertion of 'text'
	* recount - whether or not to perform a new count of available text
	"""
	index = texts.get_index(ref)
	if "error" in index:
		return index

	if recount:
		counts.update_text_count(ref)

	resort_other = False
	if index["categories"][0] not in order:
		index["categories"].insert(0, "Other")
		resort_other = True

	toc = get_toc()
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
	texts.reset_texts_cache()
	

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
	count = db.counts.find_one({"title": text["title"]}) or \
			 counts.update_text_count(text["title"])
	if not count:
		return text

	if count and "percentAvailable" in count:
		text["percentAvailable"] = count["percentAvailable"]

	if count and "estimatedCompleteness" in count:
		text["estimatedCompleteness"] = count["estimatedCompleteness"]
		text["isSparse"] = count["estimatedCompleteness"]['he']['isSparse']

	text["availableCounts"] = counts.make_available_counts_dict(text, count)

	return text


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

	counts_doc = counts.get_category_count(cat_list) or counts.count_category(cat_list)
	cat.update(counts_doc)

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
	def node_sort_key(a):
		if "category" in a:
			print a["category"]
			try:
				return order.index(a["category"])
			except ValueError:
				# If there is a text with the exact name as this category
				# (e.g., "Bava Metzia" as commentary category)
				# sort by text's order
				i = db.index.find_one({"title": a["category"]})
				if i and "order" in i:
					return i["order"][-1]
				else:
					return a["category"]
		elif "title" in a:
			try:
				if "estimatedCompleteness" in a and a['estimatedCompleteness']['he']['isSparse'] == 1:
					return a['estimatedCompleteness']['he']['isSparse']
				return order.index(a["title"])
			except ValueError:
				if "order" in a:
					return a["order"][-1]
				else:
					return a["title"]

		return None

	def node_sort_sparse(a):
		if "title" in a:
			if "estimatedCompleteness" in a and a['estimatedCompleteness']['he']['isSparse'] == 1:
				return a['estimatedCompleteness']['he']['isSparse']
		else:
			return 0


	node = sorted(node, key=node_sort_key)
	node = sorted(node, key=node_sort_sparse)

	if recur:
		for cat in node:
			if "category" in cat:
				cat["contents"] = sort_toc_node(cat["contents"], recur=True)

	return node


def get_texts_summaries_for_category(category):
	"""
	Returns the list of texts records in the table of contents corresponding to "category".
	"""
	toc = get_toc()
	summary = []
	for cat in toc:
		if cat["category"] == category:
			if "category" in cat["contents"][0]:
				for cat2 in cat["contents"]:
					summary += cat2["contents"]
			else:
				summary += cat["contents"]

			return summary

	return []
