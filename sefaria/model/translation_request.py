"""
translation_request.py
Writes to MongoDB Collection: requests
"""
import re
from datetime import datetime, timedelta

from . import abstract as abst
from . import text
from . import history
from sefaria.system.database import db
from sefaria.system.exceptions import InputError
from sefaria.datatype.jagged_array import JaggedTextArray


class TranslationRequest(abst.AbstractMongoRecord):
    """
    A Request for a section of text to be translated.
    """
    collection   = 'translation_requests'
    history_noun = 'translationRequest'

    required_attrs = [
        "ref",             # string ref
        "requesters",      # list of int uids
        "request_count",   # int of requesters length
        "completed",       # bool
        "first_requested", # date
        "last_requested",  # date
        "section_level",   # bool is the ref section level
    ]
    optional_attrs = [
        "completed_date",  # date
        "completer",       # int uid
        "featured",        # bool
        "featured_until",  # date when feature ends
    ]

    def _init_defaults(self):
        self.requesters = []
        self.completed  = False

    def save(self, transfer_support=True):
        self.requesters    = list(set(self.requesters))
        self.request_count = len(self.requesters)
        self.section_level = text.Ref(self.ref).is_section_level()
        super(TranslationRequest, self).save()

    def _normalize(self):
        self.ref = text.Ref(self.ref).normal()

    def _give_support(self):
        """
        Look for requests that are contained by this one,
        give self's requesters' support to them.
 
        Not currently used. (too much noise in requests specificity)
        """
        oref = text.Ref(self.ref)
        requests = TranslationRequestSet({"ref": {"$regex": oref.regex()}})
        for request in requests:
            if request.ref == self.ref:
                continue
            request.requesters = list(set(request.requesters + self.requesters))
            request.save(transfer_support=False)

    def _receive_support(self):
        """
        Look for requests that contains this one, 
        receive their requesters support for self.

        Not currently used. (too much noise in requests specificity)
        """
        oref = text.Ref(self.ref)
        # TODO containing refs could include more than just these two
        containing_refs = (oref.section_ref().normal(), oref.top_section_ref().normal())
        requests = TranslationRequestSet({"ref": {"$in": containing_refs}})
        for request in requests:
            if request.ref == self.ref:
                continue
            self.requesters = list(set(request.requesters + self.requesters))
            request.save(transfer_support=False)

    def check_complete(self):
        """
        Checks if this Request has been fulfilled,
        mark and save if so.
        """
        oref = text.Ref(self.ref)
        if oref.is_text_translated():
            self.completed      = True
            self.completed_date = datetime.now()
            # TODO don't just look for the first segment in the history
            # How would we handle cases where multiple people contributed to the request?
            first_ref           = self.ref.split("-")[0]
            first_ref           = first_ref if oref.is_segment_level() else self.ref + ":1"
            log                 = history.History().load({
                                                            "ref": first_ref, 
                                                            "rev_type": {"$in": ["add text", "edit text"]}, 
                                                            "language": "en",
                                                        })
            self.completer      = log.user if log else None
            self.save()
            return True
        return False

    def contents(self, **kwargs):
        contents = super(TranslationRequest, self).contents()
        contents["first_requested"] = contents["first_requested"].isoformat()
        contents["last_requested"]  = contents["last_requested"].isoformat()
        return contents

    @staticmethod
    def make_request(tref, uid):
        """
        Updates existing TranslationRequest for tref with uid if present,
        creates a new object if not.
        """
        tr = TranslationRequest().load({"ref": tref})
        if tr:
            tr.requesters.append(uid)
            tr.last_requested = datetime.now()
        else:
            tr = TranslationRequest({"ref": tref, "requesters": [uid]})
            tr.first_requested = datetime.now()
            tr.last_requested  = datetime.now()
        tr.save()
        return tr

    @staticmethod
    def remove_request(tref, uid):
        """
        Remove uid from TranslationRequest for tref if there are other requesters,
        delete TranslationRequest if not.
        """
        tr = TranslationRequest().load({"ref": tref})
        if tr:
            tr.requesters.remove(uid)
            if len(tr.requesters):
                tr.save()
            else:
                tr.delete()


class TranslationRequestSet(abst.AbstractMongoSet):
    recordClass = TranslationRequest

    def __init__(self, query={}, page=0, limit=0, sort=[["request_count", 1]]):
        super(TranslationRequestSet, self).__init__(query, page, limit, sort)


def add_translation_requests_from_source_sheets(hours=0):
    """
    Walks through all source sheets, checking for included refs that are untranslated.
    Adds the user ID of the sheet owner as a request for each untranslated ref.
    
    Only consider the last 'hours' of modified sheets, unless 
    hours = 0, then consider all.
    """
    if hours == 0:
        query = {}
    else:
        cutoff = datetime.now() - timedelta(hours=hours)
        query = { "dateModified": { "$gt": cutoff.isoformat() } }

    sheets = db.sheets.find(query)
    for sheet in sheets:
        for source in sheet["sources"]:

            if "ref" not in source:
                continue
            try:
                r = text.Ref(source["ref"])
                if not r.is_text_translated():
                    TranslationRequest.make_request(source["ref"], sheet["owner"])
            except InputError:
                continue


def process_version_state_change_in_translation_requests(version, **kwargs):
    """
    When a version is updated, check if an open Translation Requests have been fulfilled.
    """
    requests = TranslationRequestSet({"ref": {"$regex": text.Ref(version.title).regex()}, "completed": False})
    for request in requests:
        request.check_complete()


def process_index_delete_in_translation_requests(indx, **kwargs):
    from sefaria.model.text import prepare_index_regex_for_dependency_process
    pattern = prepare_index_regex_for_dependency_process(indx)
    TranslationRequestSet({"refs": {"$regex": pattern}}).delete()


def count_completed_translation_requests():
    """
    Returns stats about completed translation requests.
    """
    featured           = 0
    words              = 0
    sct_words          = 0 
    featured_words     = 0
    featured_sct_words = 0

    trs = TranslationRequestSet({"completed": True})

    count = trs.count()

    for tr in trs:
        oref   = text.Ref(tr.ref)
        t      = oref.text().text
        is_sct = not oref.text().is_merged and oref.text().version() and oref.text().version().versionTitle == "Sefaria Community Translation"
        n      = JaggedTextArray(t).word_count()
        words += n
        sct_words += n if is_sct else 0
        if getattr(tr, "featured", False):
            featured += 1
            featured_words += n
            featured_sct_words += n if is_sct else 0


    out  = "%d total translation requests completed.\n" % count
    out += "%d total words of translation added.\n" % words
    out += "%d total words of translation created.\n" % sct_words
    out += "******\n"
    out += "%d featured translation requests completed.\n" % featured
    out += "%d total words of translation added from featured requests.\n" % featured_words
    out += "%d total words of translation created from featured requests.\n" % featured_sct_words

    return out