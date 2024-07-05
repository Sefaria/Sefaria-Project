"""
Object history tracker
Accepts change requests for model objects, passes the changes to the models, and records the changes in history

"""
import structlog
logger = structlog.get_logger(__name__)

import sefaria.model as model
from sefaria.system.exceptions import InputError
try:
    from sefaria.settings import USE_VARNISH
except ImportError:
    USE_VARNISH = False
if USE_VARNISH:
    from sefaria.system.varnish.wrapper import invalidate_ref, invalidate_linked


def modify_text(user, oref, vtitle, lang, text, vsource=None, completestatus="done", **kwargs):
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
    chunk = model.TextChunk(oref, lang, vtitle, completestatus)
    if getattr(chunk.version(), "status", "") == "locked" and not model.user_profile.is_user_staff(user):
        raise InputError("This text has been locked against further edits.")
    action = kwargs.get("type") or "edit" if chunk.text else "add"
    old_text = chunk.text
    chunk.text = text
    if vsource:
        chunk.versionSource = vsource  # todo: log this change
    if chunk.save():
        kwargs['skip_links'] = kwargs.get('skip_links', False) or chunk.has_manually_wrapped_refs()
        post_modify_text(user, action, oref, lang, vtitle, old_text, chunk.text, chunk.full_version._id, **kwargs)

    return chunk


def modify_bulk_text(user: int, version: model.Version, text_map: dict, vsource=None, **kwargs) -> dict:
    """
    user: user ID of user making modification
    version: version object of text being modified
    text_map: dict with segment ref keys and text values. Each key/value pair represents a segment that should be modified. Segments that don't have changes will be ignored. The key should be the tref, and the value the text, ex: {'Mishnah Berakhot 1:1': 'Text of the Mishnah goes here'}
    vsource: optional parameter to set the version source of the version. not sure why this is here. I copied it from modify_text.
    """
    def populate_change_map(old_text, en_tref, he_tref, _):
        nonlocal change_map, existing_tref_set
        existing_tref_set.add(en_tref)
        new_text = text_map.get(en_tref, None)
        if new_text is None or new_text == old_text:
            return
        change_map[en_tref] = (old_text, new_text, model.Ref(en_tref))
    change_map = {}
    existing_tref_set = set()
    version.walk_thru_contents(populate_change_map)
    new_ref_set = set(text_map.keys()).difference(existing_tref_set)
    for new_tref in new_ref_set:
        if len(text_map[new_tref].strip()) == 0:
            # this ref doesn't exist for this version. probably exists in a different version
            # no reason to add to change_map if it has not content
            continue
        change_map[new_tref] = ('', text_map[new_tref], model.Ref(new_tref))

    if vsource:
        version.versionSource = vsource  # todo: log this change

    # modify version in place
    error_map = {}
    for _, new_text, oref in change_map.values():
        try:
            version.sub_content_with_ref(oref, new_text)
        except Exception as e:
            error_map[oref.normal()] = f"Ref doesn't match schema of version. Exception: {repr(e)}"
    version.save()

    for old_text, new_text, oref in change_map.values():
        if oref.normal() in error_map: continue
        kwargs['skip_links'] = kwargs.get('skip_links', False) or getattr(version, 'hasManuallyWrappedRefs', False)
        # hard-code `count_after` to False here. It will be called later on the whole index once
        # (which is all that's necessary)
        kwargs['count_after'] = False
        post_modify_text(user, kwargs.get("type"), oref, version.language, version.versionTitle, old_text, new_text, version._id, **kwargs)

    count_segments(version.get_index())
    return error_map


def post_modify_text(user, action, oref, lang, vtitle, old_text, curr_text, version_id, **kwargs) -> None:
    model.log_text(user, action, oref, lang, vtitle, old_text, curr_text, **kwargs)
    if USE_VARNISH:
        invalidate_ref(oref, lang=lang, version=vtitle, purge=True)
        if oref.next_section_ref():
            invalidate_ref(oref.next_section_ref(), lang=lang, version=vtitle, purge=True)
        if oref.prev_section_ref():
            invalidate_ref(oref.prev_section_ref(), lang=lang, version=vtitle, purge=True)
    if not kwargs.get("skip_links", None):
        from sefaria.helper.link import add_links_from_text
        # Some commentaries can generate links to their base text automatically
        linker = oref.autolinker(user=user)
        if linker:
            linker.refresh_links(**kwargs)
        # scan text for links to auto add
        add_links_from_text(oref, lang, curr_text, version_id, user, **kwargs)

        if USE_VARNISH:
            invalidate_linked(oref)
    # rabbis_move(oref, vtitle)
    count_and_index(oref, lang, vtitle, to_count=kwargs.get("count_after", 1))


def count_and_index(oref, lang, vtitle, to_count=1):
    from sefaria.settings import SEARCH_INDEX_ON_SAVE

    # count available segments of text
    if to_count:
        count_segments(oref.index)
    
    if SEARCH_INDEX_ON_SAVE:
        model.IndexQueue({
            "ref": oref.normal(),
            "lang": lang,
            "version": vtitle,
            "type": "ref",
        }).save()


def count_segments(index):
    from sefaria.settings import MULTISERVER_ENABLED
    from sefaria.system.multiserver.coordinator import server_coordinator

    model.library.recount_index_in_toc(index)
    if MULTISERVER_ENABLED:
        server_coordinator.publish_event("library", "recount_index_in_toc", [index.title])


def add(user, klass, attrs, **kwargs):
    """
    Creates a new instance, saves it, and records the history
    :param klass: The class we are instantiating
    :param attrs: Dictionary with the attributes of the class that we are instantiating
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
    """
    :param user:
    :param klass:
    :param _id:
    :param kwargs:
        "callback" - an optional function that will be run on the object before it's deleted
        All other kwargs are passed to obj.contents()
    :return:
    """
    obj = klass().load_by_id(_id)
    if obj is None:
        return {'error': 'item with id: {} not found'.format(_id)}
    if kwargs.get("callback"):
        kwargs.get("callback")(obj)
        del kwargs["callback"]
    old_dict = obj.contents(**kwargs)
    obj.delete()
    model.log_delete(user, klass, old_dict, **kwargs)
    return {"response": "ok"}

