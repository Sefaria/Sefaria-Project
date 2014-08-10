"""
Traffic controller
Accepts change requests for model objects, passes the changes to the models, and records the changes in history

"""

from sefaria.model import *
import sefaria.model.dependencies
models = abstract.get_record_classes()


def add(user, klass, attrs, **kwargs):
    """
    Creates a new instance, saves it, and records the history
    :param klass: The class we are instanciating
    :param attrs: Dictionary with the attributes of the class that we are instanciating
    :param user:  Integer user id
    :return:
    """
    assert issubclass(klass, abstract.AbstractMongoRecord)
    obj = klass().load_by_query({klass.criteria_field: attrs[klass.criteria_field]})
    if obj:
        old_dict = vars(obj)
        obj.load_from_dict(attrs).save()
        history.log_update(user, klass, old_dict, vars(obj), **kwargs)
        return obj
    obj = klass(attrs).save()
    history.log_add(user, klass, vars(obj), **kwargs)
    return {"response": "ok"}


def update(user, klass, attrs, **kwargs):
    assert issubclass(klass, abstract.AbstractMongoRecord)
    obj = klass().load_by_query({klass.criteria_field: attrs[klass.criteria_field]})
    old_dict = vars(obj)
    obj.load_from_dict(attrs).save()
    history.log_update(user, klass, old_dict, vars(obj), **kwargs)
    return {"response": "ok"}


def delete(user, klass, _id, **kwargs):
    obj = klass().load(_id)
    old_dict = vars(obj)
    obj.delete()
    history.log_delete(user, klass, old_dict, **kwargs)
    return {"response": "ok"}

