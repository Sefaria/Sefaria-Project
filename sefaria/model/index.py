"""
index.py

Writes to MongoDB Collection: index
"""

import sefaria.model.abstract as abst


class Index(abst.AbstractMongoRecord):
	collection = 'index'
	required_attrs = [
		"title",
		"titleVariants",
		"categories"
	]
	optional_attrs = [
	    "sectionNames",
	    "heTitle",
	    "heVariants",
	    "maps",
	    "order",
	    "length",
	    "lengths",
	    "transliteratedTitle",
	    "maps"
	]


class IndexSet(abst.AbstractMongoSet):
	recordClass = Index