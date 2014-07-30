"""
ref.py
"""

import sefaria.model.abstract as abst

class Ref(object):
	__metaclass__ = abst.CachingType

	def __init__(self, a, *args, **kwargs):
		pass