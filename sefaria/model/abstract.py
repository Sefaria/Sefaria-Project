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
    id_field = "_id" # Mongo ID field
    criteria_field = "_id"  # What field do we use to find existing records?
    required_attrs = []  # list of names of required attributes
    optional_attrs = []  # list of names of optional attributes
    readonly = False
    tracked = False  # Do we record history for this?
    history_noun = None # How do we label history records?

    def __init__(self, attrs=None):
        if attrs:
            self.update_from_dict(attrs)
        return

    def load(self, _id=None):
        if _id is None:
            raise Exception(type(self).__name__ + ".load() expects an _id as an arguemnt. None provided.")

        if isinstance(_id, basestring):
            # allow _id as either string or ObjectId
            _id = ObjectId(_id)
        return self.load_by_query({"_id": _id})

    def load_by_query(self, query, proj=None):
        obj = getattr(db, self.collection).find_one(query, proj)
        if obj:
            return self.update_from_dict(obj)
        return None

    def update(self, query, attrs, user=None):
        """
        :param query: Query to find existing object to update.
        :param attrs: Dictionary of attributes to update.
        :param user: Passed along to save() function. Optional.
        :return: The Object
        """
        if not self.load_by_query(query):
            return {"error": "No existing " + type(self).__name__ + " record found to update for %s" % str(query)}
        self.update_from_dict(attrs)
        return self.save(user)

    def update_from_dict(self, d):
        """ Can be used to initialize and object or to add values from a dict to an existing object. """
        for key, value in d.items():
            setattr(self, key, value)
        return self

    def save(self, user=None):
        """
        :param user: Used to record History of the change. Optional at this level.
        :return: The Object
        """
        if self.readonly:
            raise Exception("Can not save. " + type(self).__name__ + " objects are read-only.")
        if "error" in self.validate():
            raise Exception("Attempted to save invalid " + type(self).__name__)

        #Build a savable dictionary from the object
        propkeys = self.required_attrs + self.optional_attrs + [self.id_field]
        props = {k: getattr(self, k) for k in propkeys if hasattr(self, k)}

        _id = getattr(db, self.collection).save(props)

        if getattr(self, "_id", None) is None:
            self._id = _id
        return self

    def delete(self):
        if getattr(self, "_id", None) is None:
            raise Exception("Can not delete " + type(self).__name__ + " that doesn't exist in database.")
        return self.delete_by_query({"_id": self._id})

    def delete_by_query(self, query):
        getattr(db, self.collection).remove(query)
        # return?

    def validate(self, attrs=None):
        """
        attrs is a dictionary of object attributes
        When attrs is provided, tests attrs for validity
        When attrs not provided, tests self for validity
        :return: dict
        {"ok": 1} on success
        {"error" : <errormsg>} on failure
        """
        if attrs is None:  # test self
            attrs = vars(self)
            """" This fails when the object has been created but not yet saved.
            if not getattr(self, self.id_field, None):
                logger.debug(type(self).__name__ + ".is_valid: No id field " + self.id_field + " found.")
                return False
            """
        if not isinstance(attrs, dict):
            error_msg = type(self).__name__ + ".is_valid: 'attrs' Attribute is not a dictionary."
            logger.debug(error_msg)
            return {"error": error_msg}

        for attr in self.required_attrs:
            if attr not in attrs:
                error_msg = type(self).__name__ + ".is_valid: Required attribute: " + attr + " not in " + ",".join(attrs)
                return {"error": error_msg}
        """ This check seems like a good idea, but stumbles as soon as we have internal attrs
        for attr in attrs:
            if attr not in self.required_attrs and attr not in self.optional_attrs and attr != self.id_field:
                logger.debug(type(self).__name__ + ".is_valid: Provided attribute: " + attr +
                             " not in " + ",".join(self.required_attrs) + " or " + ",".join(self.optional_attrs))
                return False
        """
        return {"ok": 1}




class AbstractMongoSet(collections.Iterable):
    """
    A set of mongo records from a single collection
    """
    recordClass = AbstractMongoRecord

    def __init__(self, query={}, page=0, limit=0, distinct=None):
        raw_records = getattr(db, self.recordClass.collection).find(query).sort([["_id", 1]]).skip(page * limit).limit(limit)
        self.has_more = raw_records.count() == limit
        self.records = []
        self.current = 0
        self.max = 0
        if distinct is not None:
            raw_records.distinct(distinct)   #not yet tested
        for rec in raw_records:
            self.records.append(self.recordClass().update_from_dict(rec))
        self.max = len(self.records)

    def __iter__(self):
        return self

    def __len__(self):
        return self.max

    def count(self):
        return self.max

    def next(self):  # Python 3: def __next__(self)
        if self.current == self.max:
            raise StopIteration
        else:
            self.current += 1
            return self.records[self.current - 1]


class CachingType(type):
    """
    Mataclass.  Provides a caching mechanism for objects of classes using this metaclass.
    Based on: http://chimera.labs.oreilly.com/books/1230000000393/ch09.html#metacreational
    """

    def __init__(cls, name, parents, dct):
        super(CachingType, cls).__init__(name, parents, dct)
        cls.__cache = {}

    def __call__(cls, *args, **kwargs):
        keylist = kwargs.items()
        key = args, frozenset(keylist)
        if key in cls.__cache:
            return cls.__cache[key]
        else:
            obj = super(CachingType, cls).__call__(*args)
            cls.__cache[key] = obj
            return obj


def get_subclasses(c):
    subclasses = c.__subclasses__()
    for d in list(subclasses):
        subclasses.extend(get_subclasses(d))
    return subclasses


def get_record_classes():
    return get_subclasses(AbstractMongoRecord)


def get_set_classes():
    return get_subclasses(AbstractMongoSet)
