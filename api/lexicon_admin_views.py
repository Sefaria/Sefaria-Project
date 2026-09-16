import unicodedata

from django.views import View

from sefaria.client.util import jsonResponse
from sefaria.model.lexicon import LexiconEntrySet
from sefaria.helper.schema import change_lexicon_headword, get_available_lexicon_headword
from sefaria.system.exceptions import InputError
from .views import _load_json_body, StaffRequiredMixin


class AmbiguousLexiconEntry(Exception):
    pass


def _load_lexicon_entry(lexicon, headword):
    """Returns the entry, or None if not found. Raises AmbiguousLexiconEntry if more than
    one document matches -- a cheap, capped query (not a full scan), catching this for
    both reads and writes rather than the silent first-match a plain .load() would give."""
    matches = list(LexiconEntrySet(
        {'parent_lexicon': lexicon, 'headword': unicodedata.normalize('NFC', headword)}, limit=2))
    if len(matches) > 1:
        raise AmbiguousLexiconEntry()
    return matches[0] if matches else None


def _not_found():
    return jsonResponse({"error": "Entry not found."}, status=404)


def _ambiguous():
    return jsonResponse({"error": "More than one entry currently matches this headword."}, status=409)


class LexiconEntryView(View):
    def get(self, request, lexicon, headword):
        try:
            entry = _load_lexicon_entry(lexicon, headword)
        except AmbiguousLexiconEntry:
            return _ambiguous()
        if not entry:
            return _not_found()
        return jsonResponse({"entry": entry.contents(), "content_attr_names": sorted(entry.content_attr_names())})

    def patch(self, request, lexicon, headword):
        # Deliberately not StaffRequiredMixin: GET on this same view must stay public,
        # matching every other lexicon read endpoint (dictionary_api etc).
        if not request.user.is_staff:
            return jsonResponse({"error": "Only Sefaria Moderators can edit lexicon entries."}, status=403)
        body, err = _load_json_body(request)
        if err:
            return err
        try:
            entry = _load_lexicon_entry(lexicon, headword)
        except AmbiguousLexiconEntry:
            return _ambiguous()
        if not entry:
            return _not_found()
        try:
            entry.replace_content_attrs(body.get("content", {}))
            entry.save()
        except InputError as e:
            return jsonResponse({"error": str(e)}, status=400)
        return jsonResponse({"status": "ok", "entry": entry.contents()})


class LexiconEntryHeadwordView(StaffRequiredMixin, View):
    def patch(self, request, lexicon, headword):
        body, err = _load_json_body(request)
        if err:
            return err
        try:
            entry = _load_lexicon_entry(lexicon, headword)
        except AmbiguousLexiconEntry:
            return _ambiguous()
        if not entry:
            return _not_found()
        new_headword = body.get("new_headword")
        if not new_headword:
            return jsonResponse({"error": "'new_headword' is required."}, status=400)
        if unicodedata.normalize('NFC', new_headword.strip()) == entry.headword:
            # Client asked for the headword it already has -- possibly byte-identical,
            # possibly just a different (but NFC-equivalent) combining-mark encoding of the
            # same word -- either way a legitimate no-op, not a rename.
            return jsonResponse({"status": "ok", "headword": entry.headword})
        resolved = get_available_lexicon_headword(lexicon, new_headword, exclude_headword=entry.headword)
        if resolved == entry.headword:
            # A real request that disambiguation collapsed back to the current value --
            # don't silently 200 as if nothing was asked for.
            return jsonResponse({"error": f"'{new_headword}' collides with this entry's own "
                                           f"current headword after disambiguation; no change made."}, status=409)
        try:
            change_lexicon_headword(lexicon, entry.headword, resolved)
        except ValueError:
            # get_available_lexicon_headword already confirmed resolved was free -- the only
            # way this still fires is another write claiming it in between. Say that
            # directly rather than passing through the generic "already exists" message,
            # which would read as if the client's input was simply wrong.
            return jsonResponse({"error": f"'{resolved}' was just claimed by another change; please retry."}, status=409)
        return jsonResponse({"status": "ok", "headword": resolved})
