"""
history.py
Writes to MongoDB Collection: history

"add index"     done
"add link"      done
"add note"      done
"add text"
"delete link"   done
"delete note"   done
"edit index"    done
"edit link"     done
"edit note"     done
"edit text"
"publish sheet"
"revert text"
"review"

"""

import regex as re
from datetime import datetime

from . import abstract as abst
from sefaria.system.database import db


def log_update(user, klass, old_dict, new_dict, **kwargs):
    kind = klass.history_noun
    rev_type = "edit {}".format(kind)
    return _log_general(user, kind, old_dict, new_dict, rev_type, **kwargs)


def log_delete(user, klass, old_dict, **kwargs):
    kind = klass.history_noun
    rev_type = "delete {}".format(kind)
    return _log_general(user, kind, old_dict, None, rev_type, **kwargs)


def log_add(user, klass, new_dict, **kwargs):
    kind = klass.history_noun
    rev_type = "add {}".format(kind)
    return _log_general(user, kind, None, new_dict, rev_type, **kwargs)


def _log_general(user, kind, old_dict, new_dict, rev_type, **kwargs):
    log = {
        "revision": next_revision_num(),
        "user": user,
        "old": old_dict,
        "new": new_dict,
        "rev_type": rev_type,
        "date": datetime.now(),
    }

    # Need a better way to handle variations in handling of different objects in history
    if kind == "note":
        #Don't log any changes to private notes
        if (new_dict and not new_dict.get("public")) or (not new_dict and not old_dict.get("public")):
            return

    # TODO: added just for link, but should check if this can be added for any object
    # Appears to be conflict with text.method
    if kind == 'link':
        log['method'] = kwargs.get("method", "Site")

    if kind == "index":
        log['title'] = new_dict["title"]

    return History(log).save()


def next_revision_num():
    #todo: refactor to use HistorySet? May add expense for no gain.
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
    if indx.is_commentary():
        pattern = r'{} on '.format(re.escape(kwargs["old"]))
        title_pattern = r'(^{}$)|({} on)'.format(re.escape(kwargs["old"]), re.escape(kwargs["old"]))
    else:
        pattern = r'(^{} \d)|(on {} \d)'.format(re.escape(kwargs["old"]), re.escape(kwargs["old"]))
        title_pattern = r'(^{}$)|(on {})'.format(re.escape(kwargs["old"]), re.escape(kwargs["old"]))

    text_hist = HistorySet({"ref": {"$regex": pattern}})
    for h in text_hist:
        h.ref = h.ref.replace(kwargs["old"], kwargs["new"], 1)
        h.save()

    link_hist = HistorySet({"new.refs": {"$regex": pattern}})
    for h in link_hist:
        h.new["refs"] = [r.replace(kwargs["old"], kwargs["new"], 1) for r in h.new["refs"]]
        h.save()

    note_hist = HistorySet({"new.ref": {"$regex": pattern}})
    for h in note_hist:
        h.new["ref"] = h.new["ref"].replace(kwargs["old"], kwargs["new"], 1)
        h.save()

    title_hist = HistorySet({"title": {"$regex": title_pattern}})
    for h in title_hist:
        h.title = h.title.replace(kwargs["old"], kwargs["new"], 1)
        h.save()


