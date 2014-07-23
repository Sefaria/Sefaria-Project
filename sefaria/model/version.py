"""
version.py - handle user event notifications

Writes to MongoDB Collection: texts
"""

class Version(object):
	"""
	A version of a text.
	Relates to a single record from the texts collection
	_id
	chapter - Jagged Array
	language
	title
	versionSource
	versionTitle
	status
	"""
	def __init__(self):
		pass
