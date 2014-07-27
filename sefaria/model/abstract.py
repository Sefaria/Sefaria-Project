"""
abstract.py - abstract classes for Sefaria models
"""
import collections
import logging
#Should we import "from abc import ABCMeta, abstractmethod" and make these explicity abstract?
#

from bson.objectid import ObjectId

from sefaria.system.database import db

logging.basicConfig()
logger = logging.getLogger("abstract")
logger.setLevel(logging.DEBUG)


class AbstractMongoRecord(object):
    """
    AbstractMongoRecord - superclass of classes representing mongo records.
    "collection" attribute is set on subclass
    """
    collection = None  # name of MongoDB collection
    id_field = "_id"
    required_attrs = []  # list of names of required attributes
    optional_attrs = []  # list of names of optional attributes

    def __init__(self, attrs=None):
        self._id = None
        if attrs:
            self.load_from_dict(attrs)
        return

    def load(self, _id=None):
        if _id is None:
            raise Exception(type(self).__name__ + ".load() excepts an _id as an arguemnt. None provided.")

        if isinstance(_id, basestring):
            # allow _id as either string or ObjectId
            _id = ObjectId(_id)
        return self.load_by_query({"_id": _id})

    def save(self):
        if not self.is_valid():
            raise Exception("Attempted to save invalid " + type(self).__name__)

        #Build a savable dictionary from the object
        propkeys = self.required_attrs + self.optional_attrs + [self.id_field]
        props = {k: getattr(self, k) for k in propkeys if hasattr(self, k)}

        _id = getattr(db, self.collection).save(props)

        if not self._id:
            self._id = _id
        return self

    def load_by_query(self, query):
        obj = getattr(db, self.collection).find_one(query)
        if obj:
            return self.load_from_dict(obj)
        return None

    def is_valid(self, attrs=None):
        """
        attrs is a dictionary of object attributes
        When attrs is provided, tests attrs for validity
        When attrs not provided, tests self for validity
        :return: Boolean
        """
        if attrs is None:  # test self
            attrs = vars(self)
            """" This fails when the object has been created but not yet saved.
            if not getattr(self, self.id_field, None):
                logger.debug(type(self).__name__ + ".is_valid: No id field " + self.id_field + " found.")
                return False
            """
        if not isinstance(attrs, dict):
            logger.debug(type(self).__name__ + ".is_valid: 'attrs' Attribute is not a dictionary.")
            return False

        for attr in self.required_attrs:
            if attr not in attrs:
                logger.debug(type(self).__name__ + ".is_valid: Required attribute: " + attr + " not in " + ",".join(attrs))
                return False
        """ This check seems like a good idea, but stumbles as soon as we have internal attrs
        for attr in attrs:
            if attr not in self.required_attrs and attr not in self.optional_attrs and attr != self.id_field:
                logger.debug(type(self).__name__ + ".is_valid: Provided attribute: " + attr +
                             " not in " + ",".join(self.required_attrs) + " or " + ",".join(self.optional_attrs))
                return False
        """
        return True

    def load_from_dict(self, d):
        self.__dict__.update(d)
        return self


class AbstractMongoSet(collections.Iterable):
    """
    A set of mongo records from a single collection
    """
    recordClass = AbstractMongoRecord

    def __init__(self, query, page=0, limit=0):
        raw_records = getattr(db, self.recordClass.collection).find(query).sort([["_id", -1]]).skip(page * limit).limit(limit)
        self.has_more = raw_records.count() == limit
        self.records = []
        self.current = 0
        self.max = 0

        for rec in raw_records:
            self.records.append(self.recordClass().load_from_dict(rec))
            self.current = 0
            self.max = len(self.records)

    def __iter__(self):
        return self

    def __len__(self):
        return self.max

    def next(self):  # Python 3: def __next__(self)
        if self.current == self.max:
            raise StopIteration
        else:
            self.current += 1
            return self.records[self.current - 1]