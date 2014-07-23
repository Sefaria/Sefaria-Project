# -*- coding: utf-8 -*-

import sefaria.model.abstract as abst

#Every subclass needs to be imported here.  There must be a better way.
#If we add each one to __all__ in the package, and import the package, that would work...
# noinspection PyUnresolvedReferences
import sefaria.model.version


def setup_module(module):
	global subs
	subs = abst.MongoAbstract.__subclasses__()


class Test_Mongo_Models():

	def test_collection(self):
		for sub in subs:
			assert sub.collection

	def test_required(self):
		for sub in subs:
			assert len(sub.required_attrs)
			assert "_id" not in sub.required_attrs
