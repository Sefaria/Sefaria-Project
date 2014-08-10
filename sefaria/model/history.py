"""
history.py
Writes to MongoDB Collection: history

db.history.distinct("rev_type")
{
    "0" : "add index",
    "1" : "add link",
    "2" : "add note",
    "3" : "add text",
    "4" : "delete link",
    "5" : "delete note",
    "6" : "edit index",
    "7" : "edit link",
    "8" : "edit note",
    "9" : "edit text",
    "10" : "publish sheet",
    "11" : "revert text",
    "12" : "review"
}
"""

import regex as re
from datetime import datetime

import sefaria.model.abstract as abst
from sefaria.system.database import db


def log_update(user, klass, old_dict, new_dict, **kwargs):
    kind = klass.history_noun
    rev_type = "edit %s" % kind
    return log_general(user, kind, old_dict, new_dict, rev_type, **kwargs)


def log_delete(user, klass, old_dict, **kwargs):
    kind = klass.history_noun
    rev_type = "delete %s" % kind
    return log_general(user, kind, old_dict, None, rev_type, **kwargs)


def log_add(user, klass, new_dict, **kwargs):
    kind = klass.history_noun
    rev_type = "add %s" % kind
    return log_general(user, kind, None, new_dict, rev_type, **kwargs)


def log_general(user, kind, old_dict, new_dict, rev_type, **kwargs):
    log = {
        "revision": next_revision_num(),
        "user": user,
        "old": old_dict,
        "new": new_dict,
        "rev_type": rev_type,
        "date": datetime.now(),
    }
    """TODO: added just for link, but should check if this can be added for any object
        Appears to be conflict with text.method
        This is hacky.
    """
    if kind == 'link':
        log['method'] = kwargs.get("method", "Site")

    return History(log).save()


def next_revision_num():
    #todo: refactor to use HistorySet
    last_rev = db.history.find().sort([['revision', -1]]).limit(1)
    revision = last_rev.next()["revision"] + 1 if last_rev.count() else 1
    return revision


class History(abst.AbstractMongoRecord):
    collection = 'history'
    required_attrs = [
        "rev_type",
        "user",
        "date"
    ]
    optional_attrs = [
        "revision",  # do we need this at all? Could use _id
        "message",
        "revert_patch",
        "language",
        "diff_html",
        "version",
        "ref",
        "method",
        "old",
        "new",
        "link_id",
        "title",    # .25%
        "note_id",  # .05%
        "comment",  # rev_type: review
        "score",    # rev_type: review
        "sheet"     # rev_type: publish sheet
    ]

    def pretty_print(self):
        pass


class HistorySet(abst.AbstractMongoSet):
    recordClass = History


def process_index_title_change_in_history(indx, **kwargs):
    """
    Update all history entries which reference 'old' to 'new'.
    """
    pattern = r'^%s(?= \d)' % re.escape(kwargs["old"])
    text_hist = HistorySet({"ref": {"$regex": pattern}})
    for h in text_hist:
        h.ref = re.sub(pattern, kwargs["new"], h.ref)
        h.save()

    HistorySet({"title": kwargs["old"]}).update({"title": kwargs["new"]})
    #Was: db.history.update({"title": old}, {"$set": {"title": new}}, upsert=False, multi=True)

    link_hist = HistorySet({"new": {"refs": {"$regex": pattern}}})
    for h in link_hist:
        h.new["refs"] = [re.sub(pattern, kwargs["new"], r) for r in h.new["refs"]]
        h.save()
