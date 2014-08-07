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
    pkeys = []   # list of fields that others may depend on
    readonly = False
    history_noun = None # How do we label history records?
    second_save = False # Does this object need a two stage save?  Uses _prepare_second_save()

    def __init__(self, attrs=None):
        if attrs:
            self.load_from_dict(attrs)

        if len(self.pkeys):
            self.track_pkeys = True
        else:
            self.track_pkeys = False
        self.pkeys_orig_values = {}
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
            if self.track_pkeys:
                for pkey in self.pkeys:
                    self.pkeys_orig_values[pkey] = obj.get(pkey, None)
            return self.load_from_dict(obj)
        return None

    def load_from_dict(self, d):
        """ Can be used to initialize an object or to add values from a dict to an existing object. """
        for key, value in d.items():
            setattr(self, key, value)
        return self

    def update(self, query, attrs):
        """
        :param query: Query to find existing object to update.
        :param attrs: Dictionary of attributes to update.
        :return: The Object
        """
        if not self.load_by_query(query):
            return {"error": "No existing " + type(self).__name__ + " record found to update for %s" % str(query)}
        self.load_from_dict(attrs)
        return self.save()

    def save(self):
        """
        :return: The Object
        """
        if self.readonly:
            raise Exception("Can not save. " + type(self).__name__ + " objects are read-only.")
        is_new_obj = getattr(self, "_id", None) is None

        self._normalize()
        assert self._validate()

        #Build a savable dictionary from the object
        propkeys = self.required_attrs + self.optional_attrs + [self.id_field]
        props = {k: getattr(self, k) for k in propkeys if hasattr(self, k)}

        if self.track_pkeys and not is_new_obj:
            if not (len(self.pkeys_orig_values) == len(self.pkeys)):
                raise Exception("Aborted unsafe " + type(self).__name__ + " save. " + str(self.pkeys) + " not fully tracked.")

        _id = getattr(db, self.collection).save(props)
        if is_new_obj:
            self._id = _id

        if self.second_save:
            self._prepare_second_save()
            getattr(db, self.collection).save(props)

        if self.track_pkeys and not is_new_obj:
            for key, old_value in self.pkeys_orig_values.items():
                if old_value != getattr(self, key):
                    notify(self, "attributeChange", attr=key, old=old_value, new=getattr(self, key))

        self._post_save()
        notify(self, "save", orig_vals=self.pkeys_orig_values)

        #Set new values as pkey_orig_values so that future changes will be caught
        if self.track_pkeys and is_new_obj:
            for pkey in self.pkeys:
                self.pkeys_orig_values[pkey] = getattr(self, pkey, None)

        return self

    def delete(self):
        if getattr(self, "_id", None) is None:
            raise Exception("Can not delete " + type(self).__name__ + " that doesn't exist in database.")

        if self.track_pkeys:
            for pkey in self.pkeys:
                self.pkeys_orig_values[pkey] = getattr(self, pkey)

        getattr(db, self.collection).remove({"_id": self._id})

        #Todo: this should probably be a delete event, rather than an attr change event
        if self.track_pkeys:
            for key, old_value in self.pkeys_orig_values.items():
                notify(self, "attributeChange", attr=key, old=old_value, new=None)

    def delete_by_query(self, query):
        self.load_by_query(query).delete()

    def _validate(self, attrs=None):
        """
        attrs is a dictionary of object attributes
        When attrs is provided, tests attrs for validity
        When attrs not provided, tests self for validity
        :return: True on success
        Throws Exception on failure
        """
        if attrs is None:  # test self
            attrs = vars(self)

        """" This fails when the object has been created but not yet saved.
        if not getattr(self, self.id_field, None):
            logger.debug(type(self).__name__ + ".is_valid: No id field " + self.id_field + " found.")
            return False
        """
        if not isinstance(attrs, dict):
            raise Exception(type(self).__name__ + ".is_valid: 'attrs' Attribute is not a dictionary.")

        for attr in self.required_attrs:
            if attr not in attrs:
                raise Exception(type(self).__name__ + ".is_valid: Required attribute: " + attr + " not in " + ",".join(attrs))

        """ This check seems like a good idea, but stumbles as soon as we have internal attrs
        for attr in attrs:
            if attr not in self.required_attrs and attr not in self.optional_attrs and attr != self.id_field:
                logger.debug(type(self).__name__ + ".is_valid: Provided attribute: " + attr +
                             " not in " + ",".join(self.required_attrs) + " or " + ",".join(self.optional_attrs))
                return False
        """
        return True

    def _normalize(self):
        pass

    def _prepare_second_save(self):
        pass

    def _post_save(self, *args, **kwargs):
        pass

    def __eq__(self, other):
        if getattr(self, "_id", None) and getattr(other, "_id", None):
            return ObjectId(self._id) == ObjectId(other._id)
        return False

    def __ne__(self, other):
        if getattr(self, "_id", None) and getattr(other, "_id", None):
            return ObjectId(self._id) != ObjectId(other._id)
        return True


class AbstractMongoSet(collections.Iterable):
    """
    A set of mongo records from a single collection
    """
    recordClass = AbstractMongoRecord

    def __init__(self, query={}, page=0, limit=0):
        self.raw_records = getattr(db, self.recordClass.collection).find(query).sort([["_id", 1]]).skip(page * limit).limit(limit)
        self.has_more = self.raw_records.count() == limit
        self.records = None
        self.current = 0
        self.max = None

    def __iter__(self):
        return self

    def __len__(self):
        return self.max

    def distinct(self, field):
        return self.raw_records.distinct(field)   #not yet tested

    def count(self):
        if self.max:
            return self.max
        else:
            return self.raw_records.count()

    def next(self):  # Python 3: def __next__(self)
        if self.records is None:
            self.records = []
            for rec in self.raw_records:
                self.records.append(self.recordClass().load_from_dict(rec))
            self.max = len(self.records)
        if self.current == self.max:
            raise StopIteration
        else:
            self.current += 1
            return self.records[self.current - 1]

    def update(self, attrs):
        for rec in self:
            rec.load_from_dict(attrs).save()

    def delete(self):
        for rec in self:
            rec.delete()

    def save(self):
        for rec in self:
            rec.save()


def get_subclasses(c):
    subclasses = c.__subclasses__()
    for d in list(subclasses):
        subclasses.extend(get_subclasses(d))
    return subclasses


def get_record_classes():
    return get_subclasses(AbstractMongoRecord)


def get_set_classes():
    return get_subclasses(AbstractMongoSet)


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


"""
Register for model dependencies.
If instances of Model X depend on field f in Model Class Y:
- X subscribes with: subscribe(Y, "f", X.callback)
- On a chance of an instance of f, Y calls: notify(Y, "f", old_value, new_value)

todo: currently doesn't respect any inheritance
todo: find a way to test that dependencies have been regsitered correctly


>>> from sefaria.model import *
>>> def handle(old, new):
...     print "Old : " + old
...     print "New : " + new
...
>>> subscribe(index.Index, "title", handle)
>>> notify(index.Index(), "title", "yellow", "green")
Old : yellow
New : green
"""

deps = {}


def notify(inst, action, **kwargs):
    """
    :param inst: An object instance
    :param action: Currently used: "save", "attributeChange" ... could also be "new", "change", "delete"
    """
    actions_reqs = {
        "attributeChange": ["attr", "old", "new"],
        "save": []
    }

    for arg in actions_reqs[action]:
        if not kwargs.get(arg, None):
            raise Exception("Missing required argument %s in notify %s, %s" % arg, inst, action)

    if action == "attributeChange":
        callbacks = deps.get((type(inst), action, kwargs["attr"]), None)
        logger.debug("Notify: " + str(inst) + "." + kwargs["attr"] + ": " + kwargs["old"] + " is becoming " + kwargs["new"])
    else:
        callbacks = deps.get((type(inst), action), None)

    if not callbacks:
        return
    for callback in callbacks:
        callback(inst, **kwargs)


def subscribe(callback, klass, action, attr=None):
    if not deps.get((klass, action, attr), None):
        deps[(klass, action, attr)] = []
    deps[(klass, action, attr)].append(callback)
