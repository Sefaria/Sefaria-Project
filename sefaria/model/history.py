"""
history.py
Writes to MongoDB Collection: history

"add index"     done
"add link"      done
"add note"      done
"add text"      done
"delete link"   done
"delete note"   done
"edit index"    done
"edit link"     done
"edit note"     done
"edit text"     done
"publish sheet"
"revert text"
"review"

"""

import regex as re
from datetime import datetime
from diff_match_patch import diff_match_patch
dmp = diff_match_patch()

from . import abstract as abst
from sefaria.system.database import db


def log_text(user, action, oref, lang, vtitle, old_text, new_text, **kwargs):

    if isinstance(new_text, list):
        if not isinstance(old_text, list):  # is this necessary? the TextChunk should handle it.
            old_text = [old_text]
        maxlength = max(len(old_text), len(new_text))
        for i in reversed(list(range(maxlength))):
            subref = oref.subref(i + 1)
            subold = old_text[i] if i < len(old_text) else [] if isinstance(new_text[i], list) else ""
            subnew = new_text[i] if i < len(new_text) else [] if isinstance(old_text[i], list) else ""
            log_text(user, action, subref, lang, vtitle, subold, subnew, **kwargs)
        return

    if old_text == new_text:
        return

    # create a patch that turns the new version back into the old
    backwards_diff = dmp.diff_main(new_text, old_text)
    patch = dmp.patch_toText(dmp.patch_make(backwards_diff))
    # get html displaying edits in this change.
    forwards_diff = dmp.diff_main(old_text, new_text)
    dmp.diff_cleanupSemantic(forwards_diff)
    diff_html = dmp.diff_prettyHtml(forwards_diff)

    log = {
        "ref": oref.normal(),
        "version": vtitle,
        "language": lang,
        "diff_html": diff_html,
        "revert_patch": patch,
        "user": user,
        "date": datetime.now(),
        #"revision": next_revision_num(),
        "message": kwargs.get("message", ""), # is this used?
        "rev_type": "{} text".format(action),
        "method": kwargs.get("method", "Site")
    }

    History(log).save()


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
        #"revision": next_revision_num(),
        "user": user,
        "old": old_dict,
        "new": new_dict,
        "rev_type": rev_type,
        "date": datetime.now(),
    }

    # Need a better way to handle variations in handling of different objects in history
    if kind == "note":
        #Don't log any changes to private notes, even notes that had been previously private - since the old version will be shown in history
        if (new_dict and not new_dict.get("public")) or (old_dict and not old_dict.get("public")):
            return

    # TODO: added just for link, but should check if this can be added for any object
    # Appears to be conflict with text.method
    if kind == 'link':
        log['method'] = kwargs.get("method", "Site")

    if kind == "index":
        log['title'] = new_dict["title"]

    return History(log).save()

'''
def next_revision_num():
    #todo: refactor to use HistorySet? May add expense for no gain.
    last_rev = db.history.find().sort([['revision', -1]]).limit(1)
    revision = last_rev.next()["revision"] + 1 if last_rev.count() else 1
    return revision
'''

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

    def _sanitize(self):
        # History should only ever be called internally with clean text. No need to sanitize
        pass

    def pretty_print(self):
        pass


class HistorySet(abst.AbstractMongoSet):
    recordClass = History


def process_index_title_change_in_history(indx, **kwargs):

    def construct_query(attribute, queries):
        query_list = [{attribute: {'$regex': query}} for query in queries]
        return {'$or': query_list}

    print("Cascading History {} to {}".format(kwargs['old'], kwargs['new']))
    """
    Update all history entries which reference 'old' to 'new'.
    """
    from sefaria.model.text import prepare_index_regex_for_dependency_process
    queries = prepare_index_regex_for_dependency_process(indx, as_list=True)
    queries = [query.replace(re.escape(indx.title), re.escape(kwargs["old"])) for query in queries]
    title_pattern = r'(^{}$)'.format(re.escape(kwargs["old"]))

    text_hist = HistorySet(construct_query('ref', queries),  sort=[('ref', 1)])
    print("Cascading Text History {} to {}".format(kwargs['old'], kwargs['new']))
    for h in text_hist:
        h.ref = h.ref.replace(kwargs["old"], kwargs["new"], 1)
        h.save()

    link_hist = HistorySet(construct_query("new.refs", queries), sort=[('new.refs', 1)])
    print("Cascading Link History {} to {}".format(kwargs['old'], kwargs['new']))
    for h in link_hist:
        h.new["refs"] = [r.replace(kwargs["old"], kwargs["new"], 1) for r in h.new["refs"]]
        h.save()

    note_hist = HistorySet(construct_query("new.ref", queries), sort=[('new.ref', 1)])
    print("Cascading Note History {} to {}".format(kwargs['old'], kwargs['new']))
    for h in note_hist:
        h.new["ref"] = h.new["ref"].replace(kwargs["old"], kwargs["new"], 1)
        h.save()

    title_hist = HistorySet({"title": {"$regex": title_pattern}}, sort=[('title', 1)])
    print("Cascading Index History {} to {}".format(kwargs['old'], kwargs['new']))
    for h in title_hist:
        h.title = h.title.replace(kwargs["old"], kwargs["new"], 1)
        h.save()

def process_version_title_change_in_history(ver, **kwargs):
    """
    Rename a text version title in history records
    'old' and 'new' are the version title names.
    """
    query = {
        "ref": {"$regex": r'^%s(?= \d)' % ver.title},
        "version": kwargs["old"],
        "language": ver.language,
    }
    db.history.update(query, {"$set": {"version": kwargs["new"]}}, upsert=False, multi=True)