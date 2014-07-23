"""
abstract.py - abstract classes for Sefaria models
"""

from bson.objectid import ObjectId

from sefaria.system.database import db

import logging
logging.basicConfig()
logger = logging.getLogger("abstract")
logger.setLevel(logging.DEBUG)

class MongoAbstract(object):
	"""
	MongoAbstract - superclass of classes representing mongo collections.
	"collection" attribute is set on subclass
	"""
	collection = None  # name of MongoDB collection
	id_field = "_id"
	required_attrs = []  # list of names of required attributes
	optional_attrs = []  # list of names of optional attributes

	def load(self, _id = None):
		if isinstance(_id, basestring):
			# allow _id as either string or ObjectId
			_id = ObjectId(_id)
		return self.load_by_query({"_id": _id})

	def save(self):
		getattr(db, self.collection).save(vars(self))
		return self

	def load_by_query(self, query):
		obj = getattr(db, self.collection).find_one(query)
		if obj:
			return self._load_from_obj(obj)
		return None

	def is_valid(self, attrs= None):
		"""
		attrs is a dictionary of object attributes
		When attrs is provided, tests attrs for validity
		When attrs not provided, tests self for validity
		:return: Boolean
		"""
		if attrs is None:  # test self
			attrs = vars(self)
			#test presence of _id
			if not getattr(self, self.id_field):
				return False

		for attr in self.required_attrs:
			if attr not in attrs:
				logger.debug("Required attribute: " + attr + " not in " + ",".join(attrs))
				return False

		for attr in attrs:
			if attr not in self.required_attrs and attr not in self.optional_attrs:
				logger.debug("Provided attribute: " + attr + " not in " + ",".join(self.required_attrs) + " or " + ",".join(self.optional_attrs))
				return False
		return True

	def _load_from_obj(self, obj):
		self.__dict__.update(obj)
		return self