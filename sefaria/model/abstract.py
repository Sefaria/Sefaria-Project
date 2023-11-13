# -*- coding: utf-8 -*-

"""
abstract.py - abstract classes for Sefaria models
"""
from cerberus import Validator
import collections
import structlog
import copy
import bleach
import re

#Should we import "from abc import ABCMeta, abstractmethod" and make these explicity abstract?
#

from bson.objectid import ObjectId

from sefaria.system.database import db
from sefaria.system.exceptions import InputError, SluggedMongoRecordMissingError

logger = structlog.get_logger(__name__)


class AbstractMongoRecord(object):
    """
    AbstractMongoRecord - superclass of classes representing mongo records.
    "collection" attribute is set on subclass
    """
    collection = None  # name of MongoDB collection
    id_field = "_id"  # Mongo ID field
    criteria_field = "_id"  # Primary ID used to find existing records
    criteria_override_field = None  # If a record type uses a different primary key (such as 'title' for Index records), and the presence of an override field in a save indicates that the primary attribute is changing ("oldTitle" in Index records) then this class attribute has that override field name used.
    required_attrs = []  # list of names of required attributes
    optional_attrs = []  # list of names of optional attributes
    attr_schemas = {}    # schemas to validate that an attribute is in the right format. Keys are attribute names, values are schemas in Cerberus format.
    track_pkeys = False
    pkeys = []   # list of fields that others may depend on
    history_noun = None  # Label for history records
    ALLOWED_TAGS = bleach.ALLOWED_TAGS + ["p", "br"]  # not sure why p/br isn't included. dont see any security risks
    ALLOWED_ATTRS = bleach.ALLOWED_ATTRIBUTES

    def __init__(self, attrs=None):
        if attrs is None:
            attrs = {}
        self._init_defaults()
        self.pkeys_orig_values = {}
        self.load_from_dict(attrs, True)
            
    def load_by_id(self, _id=None):
        if _id is None:
            raise Exception(type(self).__name__ + ".load() expects an _id as an argument. None provided.")

        if isinstance(_id, str):
            # allow _id as either string or ObjectId
            _id = ObjectId(_id)
        return self.load({"_id": _id})

    def load(self, query, proj=None):
        obj = getattr(db, self.collection).find_one(query, proj)
        if obj:
            assert set(obj.keys()) <= set(self._saveable_attr_keys()), \
                "{} record loaded with unhandled key(s): {}".format(
                    type(self).__name__,
                    set(obj.keys()) - set(self._saveable_attr_keys())
                )
            self.load_from_dict(obj, True)
            return self
        return None  # used to check for existence of record.

    # careful that this doesn't defeat itself, if/when a cache catches constructor calls
    def copy(self):
        attrs = self._saveable_attrs()
        del attrs[self.id_field]
        return self.__class__(copy.deepcopy(attrs))

    def load_from_dict(self, d, is_init=False):
        """
        Add values from a dict to an existing object.
        Used internally both to initialize new objects and to update existing objects

        :param dict d: The dictionary used to update the object
        :param bool is_init: Indicates whether this dictionary is initializing (as opposed to updating) an object.  If this is true, the primary keys are tracked from this load, and any change will trigger an 'attributeChange' notification.
        :return: the object
        """
        for key, value in list(d.items()):
            setattr(self, key, value)
        if is_init and not self.is_new():
            self._set_pkeys()
        self._set_derived_attributes()
        return self

    def update(self, query, attrs):
        """
        :param query: Query to find existing object to update.
        :param attrs: Dictionary of attributes to update.
        :return: the object
        """
        if not self.load(query):
            raise InputError("No existing {} record found to update for {}".format(type(self).__name__, str(query)))
        self.load_from_dict(attrs)
        return self.save()

    def save(self, override_dependencies=False):
        """
        Save the object to the Mongo data store.
        On completion, will emit a 'save' notification.  If a tracked attribute has changed, will emit an 'attributeChange' notification.
        if override_dependencies is set to True, no notifications will be emitted.
        :return: the object
        """
        is_new_obj = self.is_new()

        self._normalize()
        self._validate()
        self._sanitize()
        self._pre_save()

        props = self._saveable_attrs()

        if self.track_pkeys and not is_new_obj:
            if not (len(self.pkeys_orig_values) == len(self.pkeys)):
                raise Exception("Aborted unsafe {} save. {} not fully tracked.".format(type(self).__name__, self.pkeys))

        if is_new_obj:
            result = getattr(db, self.collection).insert_one(props)
            self._id = result.inserted_id
        else:
            result = getattr(db, self.collection).replace_one({"_id":self._id}, props, upsert=True)
            if not result.matched_count and result.upserted_id:
                raise Exception("{} inserted when expecting an update.".format(type(self).__name__))

        if self.track_pkeys and not is_new_obj and not override_dependencies:
            for key, old_value in list(self.pkeys_orig_values.items()):
                if old_value != getattr(self, key, None):
                    notify(self, "attributeChange", attr=key, old=old_value, new=getattr(self, key))

        if not override_dependencies:
            notify(self, "save", orig_vals=self.pkeys_orig_values, is_new=is_new_obj)

        # Set new values as pkey_orig_values so that future changes will be caught
        if self.track_pkeys:
            for pkey in self.pkeys:
                self.pkeys_orig_values[pkey] = getattr(self, pkey, None)

        return self

    def can_delete(self):
        """
        This method can raise an error or output a reason for the failure to delete.
        :return:
        """
        return True

    def delete(self, force=False, override_dependencies=False):
        """
        Just before the delete is executed, will emit a 'delete' notification.

        :param force: delete object, even if it fails a `can_delete()` check
        :param override_dependencies: if override_dependencies is set to True, no notifications will be emitted.
        :return:
        """
        if not self.can_delete():
            if force:
                logger.warning("Forcing delete of {}.".format(str(self)))
            else:
                logger.warning("Failed to delete {}.".format(str(self)))
                return

        if self.is_new():
            raise InputError("Can not delete {} that doesn't exist in database.".format(type(self).__name__))

        if not override_dependencies:
            notify(self, "delete")
        getattr(db, self.collection).delete_one({"_id": self._id})

    def delete_by_query(self, query, force=False):
        r = self.load(query)
        if r:
            r.delete(force=force)

    def is_new(self):
        return getattr(self, "_id", None) is None

    def _saveable_attr_keys(self):
        return self.required_attrs + self.optional_attrs + [self.id_field]

    def _saveable_attrs(self):
        return {k: getattr(self, k) for k in self._saveable_attr_keys() if hasattr(self, k)}

    def contents(self, **kwargs):
        """ Build a savable/portable dictionary from the object
        Extended by subclasses with derived attributes passed along with portable object
        :return: dict
        """
        d = self._saveable_attrs()
        try:
            del d[self.id_field]
        except KeyError:
            pass
        if kwargs.get("with_string_id", False) and hasattr(self, "_id"):
            d["_id"] = str(self._id)
        return d

    def _set_pkeys(self):
        if self.track_pkeys:
            for pkey in self.pkeys:
                self.pkeys_orig_values[pkey] = getattr(self, pkey, None)

    def is_key_changed(self, key):
        assert self.track_pkeys and key in self.pkeys, "Failed to track key {} in {}".format(key, self.__class__.__name__)
        if self.is_new():
            return bool(getattr(self, key, False))
        return self.pkeys_orig_values[key] != getattr(self, key, None)

    def _init_defaults(self):
        pass

    def _set_derived_attributes(self):
        pass

    def _validate(self):
        """
        Test self for validity
        :return: True on success
        Throws Exception on failure
        """

        attrs = vars(self)

        """" This fails when the object has been created but not yet saved.
        if not getattr(self, self.id_field, None):
            logger.debug(type(self).__name__ + ".is_valid: No id field " + self.id_field + " found.")
            return False
        """

        for attr in self.required_attrs:
            #properties. which are virtual instance members, do not get returned by vars()
            if attr not in attrs and not getattr(self, attr, None):
                raise InputError(type(self).__name__ + "._validate(): Required attribute: " + attr + " not in " + ", ".join(attrs))

        """ This check seems like a good idea, but stumbles as soon as we have internal attrs
        for attr in attrs:
            if attr not in self.required_attrs and attr not in self.optional_attrs and attr != self.id_field:
                logger.debug(type(self).__name__ + ".is_valid: Provided attribute: " + attr +
                             " not in " + ",".join(self.required_attrs) + " or " + ",".join(self.optional_attrs))
                return False
        """
        for attr, schema in self.attr_schemas.items():
            v = Validator(schema)
            try:
                value = getattr(self, attr)
                if not v.validate(value):
                    raise InputError(v.errors)
            except AttributeError:
                # not checking here if value exists, that is done above.
                # assumption is if value doesn't exist, it's optional
                pass
        return True

    def _normalize(self):
        pass

    def _pre_save(self):
        pass

    def _sanitize(self):
        """
        bleach all input to protect against security risks
        """
        all_attrs = self.required_attrs + self.optional_attrs
        for attr in all_attrs:
            val = getattr(self, attr, None)
            if isinstance(val, str):
                setattr(self, attr, bleach.clean(val, tags=self.ALLOWED_TAGS, attributes=self.ALLOWED_ATTRS))

    def same_record(self, other):
        if getattr(self, "_id", None) and getattr(other, "_id", None):
            return ObjectId(self._id) == ObjectId(other._id)
        return False

    def __eq__(self, other):
        """

        """
        if type(other) is type(self):
            return self._saveable_attrs() == other._saveable_attrs()
        return False

    def __ne__(self, other):
        return not self.__eq__(other)

    @classmethod
    def all_subclasses(cls) -> set:
        # get all subclasses recursively
        # see https://stackoverflow.com/a/3862957/4246723
        return set(cls.__subclasses__()).union([sub_sub_cls for sub_cls in cls.__subclasses__() for sub_sub_cls in sub_cls.all_subclasses()])


class AbstractMongoSet(collections.abc.Iterable):
    """
    A set of mongo records from a single collection
    """
    recordClass = AbstractMongoRecord

    def __init__(self, query=None, page=0, limit=0, sort=None, proj=None, skip=None, hint=None, record_kwargs=None):   # default sort used to be =[("_id", 1)]
        self.query = query or {}
        self.record_kwargs = record_kwargs or {}  # kwargs to pass to record when instantiating
        self.raw_records = getattr(db, self.recordClass.collection).find(self.query, proj)
        if sort:
            self.raw_records = self.raw_records.sort(sort)
        self.skip = skip if skip is not None else page * limit
        self.raw_records = self.raw_records.skip(self.skip).limit(limit)
        self.hint = hint
        self.limit = limit
        if hint:
            self.raw_records.hint(hint)
        #self.has_more = limit != 0 and self.raw_records.count() == limit
        self.records = None
        self.current = 0
        self.max = None
        self._local_iter = None

    def __iter__(self):
        self._read_records()
        return iter(self.records)

    def __getitem__(self, item):
        self._read_records()
        return self.records[item]

    def _read_records(self):
        if self.records is None:
            self.records = []
            for rec in self.raw_records:
                self.records.append(self.recordClass(attrs=rec, **self.record_kwargs))
            self.max = len(self.records)

    def __len__(self):
        if not self.max:
            self._read_records()
        return self.max

    def array(self):
        self._read_records()
        return self.records

    def distinct(self, field):
        return self.raw_records.distinct(field)

    def count(self):
        if self.max:
            return self.max
        else:
            kwargs = {k: getattr(self, k) for k in ["skip", "limit", "hint"] if getattr(self, k, None)}
            return int(getattr(db, self.recordClass.collection).count_documents(self.query, **kwargs))

    def update(self, attrs):
        for rec in self:
            rec.load_from_dict(attrs).save()

    def delete(self, force=False, bulk_delete=False):
        if bulk_delete: # Bulk deletion is more performant but will not trigger dependencies.
            getattr(db, self.recordClass.collection).delete_many(self.query)
        else:
            for rec in self:
                rec.delete(force=force)

    def save(self):
        for rec in self:
            rec.save()

    def remove(self, condition_callback):
        self._read_records()
        self.records = [r for r in self.records if not condition_callback(r)]
        self.max = len(self.records)
        return self

    def contents(self, **kwargs):
        return [r.contents(**kwargs) for r in self]


class SluggedAbstractMongoRecordMeta(type):

    def __init__(cls, name, parents, dct):
        super().__init__(name, parents, dct)
        cls._init_cache = {}  # cache for instances instantiated using cls.init()


class SluggedAbstractMongoRecord(AbstractMongoRecord, metaclass=SluggedAbstractMongoRecordMeta):
    """
    Use instead of AbstractMongoRecord when model has unique slug field
    """

    slug_fields = None  # List[str]: Names of slug fields on model. Most commonly will be ["slug"] but there are cases where multiple slug fields are useful.
    cacheable = False

    @classmethod
    def init(cls, slug: str, slug_field_idx: int = None) -> 'AbstractMongoRecord':
        """
        Convenience func to avoid using .load() when you're only passing a slug
        Applicable only if class defines `slug_fields`
        @param slug:
        @param slug_field_idx: Optional index of slug field in case `cls` has multiple slug fields. Index should be between 0 and len(cls.slug_fields) - 1
        @return: instance of `cls` with slug `slug`
        """
        if len(cls.slug_fields) != 1 and slug_field_idx is None:
            raise Exception("Can only call init() if exactly one slug field is defined or `slug_field_idx` is passed as"
                            " a parameter.")
        slug_field_idx = slug_field_idx or 0
        if not cls.cacheable or slug not in cls._init_cache:
            instance = cls().load({cls.slug_fields[slug_field_idx]: slug})
            if cls.cacheable:
                cls._init_cache[slug] = instance
            else:
                return instance
        return cls._init_cache[slug]

    def normalize_slug_field(self, slug_field):
        """
        Set the slug (stored in self[slug_field]) using the first available number at the end if duplicates exist
        """
        slug = self.normalize_slug(getattr(self, slug_field))
        dupe_count = 0
        _id = getattr(self, '_id', None)  # _id is not necessarily set b/c record might not have been saved yet
        temp_slug = slug
        while getattr(db, self.collection).find_one({slug_field: temp_slug, "_id": {"$ne": _id}}):
            dupe_count += 1
            temp_slug = "{}{}".format(slug, dupe_count)
        return temp_slug

    @staticmethod
    def normalize_slug(slug):
        slug = slug.lower()
        slug = slug.replace("Ḥ", "H").replace("ḥ", "h")
        slug = re.sub(r"[ /]", "-", slug.strip())
        slug = re.sub(r"[^a-z0-9()\-א-ת]", "", slug)  # parens are for disambiguation on topics
        slug = re.sub(r"-+", "-", slug)
        return slug

    def _normalize(self):
        super()._normalize()
        if self.slug_fields is not None:
            for slug_field in self.slug_fields:
                setattr(self, slug_field, self.normalize_slug_field(slug_field))

    @classmethod
    def validate_slug_exists(cls, slug: str, slug_field_idx: int = None):
        """
        Validate that `slug` points to an existing object of type `cls`. Pass `slug_field` if `cls` has multiple slugs
        associated with it (e.g. TopicLinkType)
        @param slug: Slug to look up
        @param slug_field_idx: Optional index of slug field in case `cls` has multiple slug fields. Index should be
        between 0 and len(cls.slug_fields) - 1
        @return: raises SluggedMongoRecordMissingError is slug doesn't match an existing object
        """
        instance = cls.init(slug, slug_field_idx)
        if not instance:
            raise SluggedMongoRecordMissingError(f"{cls.__name__} with slug '{slug}' does not exist.")


class Cloneable:

    def clone(self, **kwargs) -> 'Cloneable':
        """
        Return new object with all the same data except modifications specified in kwargs
        """
        return self.__class__(**{**self.__dict__, **kwargs})


def get_subclasses(c):
    subclasses = c.__subclasses__()
    for d in list(subclasses):
        subclasses.extend(get_subclasses(d))

    return subclasses


def get_record_classes(concrete=True, dynamic_classes=False):
    sc = get_subclasses(AbstractMongoRecord)
    if concrete:
        sc = [s for s in sc if s.collection is not None]
    if not dynamic_classes:
        from sefaria.model.lexicon import DictionaryEntry
        sc = [s for s in sc if not issubclass(s, DictionaryEntry)]
    return sc


def get_set_classes():
    return get_subclasses(AbstractMongoSet)


"""
    Metaclass to provides a caching mechanism for objects of classes using this metaclass.
    Based on: http://chimera.labs.oreilly.com/books/1230000000393/ch09.html#metacreational

    Not yet used
"""


class CachingType(type):

    def __init__(cls, name, parents, dct):
        super(CachingType, cls).__init__(name, parents, dct)
        cls.__cache = {}

    def __call__(cls, *args, **kwargs):
        key = make_hashable(args), make_hashable(kwargs)
        if key in cls.__cache:
            return cls.__cache[key]
        else:
            obj = super(CachingType, cls).__call__(*args)
            cls.__cache[key] = obj
            return obj


def make_hashable(obj):
    """WARNING: This function only works on a limited subset of objects
    Make a range of objects hashable.
    Accepts embedded dictionaries, lists or tuples (including namedtuples)"""
    if isinstance(obj, collections.Hashable):
        #Fine to be hashed without any changes
        return obj
    elif isinstance(obj, collections.Mapping):
        #Convert into a frozenset instead
        items = list(obj.items())
        for i, item in enumerate(items):
            items[i] = make_hashable(item)
        return frozenset(items)
    elif isinstance(obj, collections.Iterable):
        #Convert into a tuple instead
        ret=[type(obj)]
        for i, item in enumerate(obj):
            ret.append(make_hashable(item))
        return tuple(ret)
    #Use the id of the object
    return id(obj)


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
    :param action: Currently used: "save", "attributeChange", "delete", "create", ... could also be "change"
    """

    actions_reqs = {
        "attributeChange": ["attr"],
        "save": [],
        "delete": [],
        "create": []
    }
    assert inst
    assert action in actions_reqs

    for arg in actions_reqs[action]:
        if not kwargs.get(arg, None):
            raise Exception("Missing required argument {} in notify {}, {}".format(arg, inst, action))

    if action == "attributeChange":
        callbacks = deps.get((type(inst), action, kwargs["attr"]), None)
        logger.debug("Notify: " + str(inst) + "." + str(kwargs["attr"]) + ": " + str(kwargs["old"]) + " is becoming " + str(kwargs["new"]))
    else:
        logger.debug("Notify: " + str(inst) + " is being " + action + "d.")
        callbacks = deps.get((type(inst), action, None), [])

    if not callbacks:
        return

    for callback in callbacks:
        logger.debug("Notify: Calling " + callback.__name__ + "() for " + inst.__class__.__name__ + " " + action)
        callback(inst, **kwargs)


def subscribe(callback, klass, action, attr=None):
    if not deps.get((klass, action, attr), None):
        deps[(klass, action, attr)] = []
    deps[(klass, action, attr)].append(callback)


def cascade(set_class, attr):
    """
    Handles generic value cascading, for simple key reference changes.
    See examples in dependencies.py
    :param set_class: The set class of the impacted model
    :param attr: The name of the impacted class attribute (fk) that holds the references to the changed attribute (pk)
        There is support for any level of nested attributes, e.g. "contents.properties.value"
    :return: a function that will update 'attr' in 'set_class' and can be passed to subscribe()
    """
    from functools import reduce

    attrs = attr.split(".")
    if len(attrs) == 1:
        return lambda obj, **kwargs: set_class({attr: kwargs["old"]}).update({attr: kwargs["new"]})
    else:
        def foo(obj, **kwargs):
            for rec in set_class({attr: kwargs["old"]}):
                dict_parent = reduce(lambda d, k: d[k], attrs[1:-1], getattr(rec, attrs[0]))
                dict_parent[attrs[-1]] = kwargs["new"]
                setattr(rec, attrs[0], getattr(rec, attrs[0]))
                rec.save()
        return foo


def cascade_to_list(set_class, attr):
    """
    Handles generic value cascading, for keys in attributes that hold lists of keys.
    See examples in dependencies.py
    :param set_class: The set class of the impacted model
    :param attr: The name of the impacted class attribute (fk) that holds the list of references to the changed attribute (pk)
    :return: a function that will update 'attr' in 'set_class' and can be passed to subscribe()
    """
    def foo(obj, **kwargs):
        for rec in set_class({attr: kwargs["old"]}):
            setattr(rec, attr, [kwargs["new"] if e == kwargs["old"] else e for e in getattr(rec, attr)])
            rec.save()

    return foo


def cascade_delete(set_class, fk_attr, pk_attr):
    """
    Handles generic delete cascading, for simple key reference changes.
    See examples in dependencies.py
    :param set_class: The set class of the impacted model
    :param fk_attr: The name of the impacted class attribute (fk) that holds the references to the primary identifier (pk)
            There is support for nested attributes of arbitrary depth - e.g. "contents.subcontents.value"
    :return: a function that will delete values of 'set_class' where 'attr' matches
    """
    return lambda obj, **kwargs: set_class({fk_attr: getattr(obj, pk_attr)}).delete()


def cascade_delete_to_list(set_class, fk_attr, pk_attr):
    """
    Handles generic delete cascading, for keys in attributes that hold lists of keys.
    See examples in dependencies.py
    :param set_class: The set class of the impacted model
    :param fk_attr: The name of the impacted class attribute (fk) that holds the list of references to the primary identifier (pk)
    :param pk_attr:
    :return: a function that will update 'attr' in 'set_class' and can be passed to subscribe()
    """
    def foo(obj, **kwargs):
        for rec in set_class({fk_attr: getattr(obj, pk_attr)}):
            setattr(rec, fk_attr, [e for e in getattr(rec, fk_attr) if e != getattr(obj, pk_attr)])
            rec.save()

    return foo
