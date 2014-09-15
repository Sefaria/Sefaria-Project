"""
Traffic controller
Accepts change requests for model objects, passes the changes to the models, and records the changes in history

"""

import sefaria.model as model


def add(user, klass, attrs, **kwargs):
    """
    Creates a new instance, saves it, and records the history
    :param klass: The class we are instanciating
    :param attrs: Dictionary with the attributes of the class that we are instanciating
    :param user:  Integer user id
    :return:
    """
    assert issubclass(klass, model.abstract.AbstractMongoRecord)
    if klass.criteria_override_field and attrs.get(klass.criteria_override_field):
        obj = klass().load({klass.criteria_field: attrs[klass.criteria_override_field]})
    else:
        obj = klass().load({klass.criteria_field: attrs[klass.criteria_field]})
    if obj:
        old_dict = obj.contents()
        obj.load_from_dict(attrs).save()
        model.log_update(user, klass, old_dict, obj.contents(), **kwargs)
        return obj
    obj = klass(attrs).save()
    model.log_add(user, klass, obj.contents(), **kwargs)
    return {"response": "ok"}


def update(user, klass, attrs, **kwargs):
    assert issubclass(klass, model.abstract.AbstractMongoRecord)
    if klass.criteria_override_field and attrs.get(klass.criteria_override_field):
        obj = klass().load({klass.criteria_field: attrs[klass.criteria_override_field]})
    else:
        obj = klass().load({klass.criteria_field: attrs[klass.criteria_field]})
    old_dict = obj.contents()
    obj.load_from_dict(attrs).save()
    model.log_update(user, klass, old_dict, obj.contents(), **kwargs)
    return {"response": "ok"}


def delete(user, klass, _id, **kwargs):
    obj = klass().load_by_id(_id)
    old_dict = obj.contents()
    obj.delete()
    model.log_delete(user, klass, old_dict, **kwargs)
    return {"response": "ok"}

