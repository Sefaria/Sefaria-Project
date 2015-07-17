"""
Object history tracker
Accepts change requests for model objects, passes the changes to the models, and records the changes in history

"""
import logging
logger = logging.getLogger(__name__)

import sefaria.model as model
from sefaria.utils.users import is_user_staff
from sefaria.system.exceptions import InputError


def modify_text(user, oref, vtitle, lang, text, vsource=None, **kwargs):
    """
    Updates a chunk of text, identified by oref, versionTitle, and lang, and records history.
    :param user:
    :param oref:
    :param vtitle:
    :param lang:
    :param text:
    :param vsource:
    :return:
    """
    chunk = model.TextChunk(oref, lang, vtitle)
    if getattr(chunk.version(), "status", "") == "locked" and not is_user_staff(user):
        raise InputError("This text has been locked against further edits.")
    action = kwargs.get("type") or "edit" if chunk.text else "add"
    old_text = chunk.text
    chunk.text = text
    if vsource:
        chunk.versionSource = vsource  # todo: log this change
    if chunk.save():
        model.log_text(user, action, oref, lang, vtitle, old_text, text, **kwargs)

        from sefaria.helper.link import add_commentary_links, add_links_from_text
        # Commentaries generate links to their base text automatically
        if oref.type == "Commentary":
            add_commentary_links(oref, user, **kwargs)
        # scan text for links to auto add
        add_links_from_text(oref.normal(), lang, chunk.text, chunk.full_version._id, user, **kwargs)

    return chunk


def add(user, klass, attrs, **kwargs):
    """
    Creates a new instance, saves it, and records the history
    :param klass: The class we are instanciating
    :param attrs: Dictionary with the attributes of the class that we are instanciating
    :param user:  Integer user id
    :return:
    """
    assert issubclass(klass, model.abstract.AbstractMongoRecord)
    obj = None
    if getattr(klass, "criteria_override_field", None) and attrs.get(klass.criteria_override_field):
        obj = klass().load({klass.criteria_field: attrs[klass.criteria_override_field]})
    elif attrs.get(klass.criteria_field):
        if klass.criteria_field == klass.id_field:  # a clumsy way of pushing _id through ObjectId
            obj = klass().load_by_id(attrs[klass.id_field])
        else:
            obj = klass().load({klass.criteria_field: attrs[klass.criteria_field]})
    if obj:
        old_dict = obj.contents(**kwargs)
        obj.load_from_dict(attrs).save()
        model.log_update(user, klass, old_dict, obj.contents(**kwargs), **kwargs)
        return obj
    obj = klass(attrs).save()
    model.log_add(user, klass, obj.contents(**kwargs), **kwargs)
    return obj


def update(user, klass, attrs, **kwargs):
    assert issubclass(klass, model.abstract.AbstractMongoRecord)
    if getattr(klass, "criteria_override_field", None) and attrs.get(klass.criteria_override_field):
        obj = klass().load({klass.criteria_field: attrs[klass.criteria_override_field]})
    else:
        if klass.criteria_field == klass.id_field:  # a clumsy way of pushing _id through ObjectId
            obj = klass().load_by_id(attrs[klass.id_field])
        else:
            obj = klass().load({klass.criteria_field: attrs[klass.criteria_field]})
    old_dict = obj.contents(**kwargs)
    obj.load_from_dict(attrs).save()
    model.log_update(user, klass, old_dict, obj.contents(**kwargs), **kwargs)
    return obj


def delete(user, klass, _id, **kwargs):
    obj = klass().load_by_id(_id)
    old_dict = obj.contents(**kwargs)
    obj.delete()
    model.log_delete(user, klass, old_dict, **kwargs)
    return {"response": "ok"}

