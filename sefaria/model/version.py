"""
version.py - handle user event notifications

Writes to MongoDB Collection: texts
"""

import sefaria.model.abstract as abst


class Version(abst.MongoAbstract):
	"""
	A version of a text.
	Relates to a single record from the texts collection
	"""
	collection = "texts"
	required_attrs = [
		"chapter",
		"language",
		"title",
		"versionSource",
		"versionTitle"
	]
	optional_attrs = [
		"status"
	]

	def __init__(self):
		pass
