import unicodedata

from django.views import View

from sefaria.client.util import jsonResponse
from sefaria.model.lexicon import LexiconEntry, LexiconEntrySet, Lexicon
from sefaria.model.text import Ref
from sefaria.helper.schema import change_lexicon_headword, get_available_lexicon_headword
from sefaria.system.exceptions import InputError
from sefaria.system.multiserver.coordinator import server_coordinator
from sefaria.settings import MULTISERVER_ENABLED
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
        # DictionaryEntryNode embeds the loaded entry inside itself, so a cached Ref for it
        # would otherwise keep serving pre-edit content until the process restarts. This
        # process's own cache is cleared directly; other pods behind the same deployment
        # each carry their own copy of the same cache and only hear about the edit via
        # the multiserver event.
        lex = Lexicon().load({"name": lexicon})
        if lex and getattr(lex, "index_title", None):
            tref = f"{lex.index_title}, {entry.headword}"
            Ref.remove_ref_from_cache(lex.index_title, tref)
            if MULTISERVER_ENABLED:
                server_coordinator.publish_event("Ref", "remove_ref_from_cache", [lex.index_title, tref])
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
        # A non-string JSON value would raise AttributeError at .strip() below. Also catches
        # "missing" (None). Emptiness is get_available_lexicon_headword's own concern.
        if not isinstance(new_headword, str):
            return jsonResponse({"error": "'new_headword' is required and must be a string."}, status=400)
        if unicodedata.normalize('NFC', new_headword.strip()) == entry.headword:
            # Client asked for the headword it already has -- possibly byte-identical,
            # possibly just a different (but NFC-equivalent) combining-mark encoding of the
            # same word -- either way a legitimate no-op, not a rename.
            return jsonResponse({"status": "ok", "headword": entry.headword})
        try:
            resolved = get_available_lexicon_headword(lexicon, new_headword, exclude_headword=entry.headword)
        except ValueError as e:
            return jsonResponse({"error": str(e)}, status=400)
        if resolved == entry.headword:
            # A real request that disambiguation collapsed back to the current value --
            # don't silently 200 as if nothing was asked for.
            return jsonResponse({"error": f"'{new_headword}' collides with this entry's own "
                                           f"current headword after disambiguation; no change made."}, status=409)
        try:
            actual_headword = change_lexicon_headword(lexicon, entry.headword, resolved)
        except ValueError as e:
            # change_lexicon_headword raises plain ValueError for two unrelated reasons: a
            # genuine collision (get_available_lexicon_headword already confirmed resolved
            # was free, so this only fires if another write claimed it in between -- a real,
            # retryable race) or a corrupted prev_hw/next_hw pointer on the entry being
            # renamed (pre-existing bad data, unrelated to this request, not fixed by
            # retrying). Distinguish by re-checking whether resolved is actually taken, so
            # the message matches what's actually true instead of always claiming a race.
            if LexiconEntry().load({'parent_lexicon': lexicon, 'headword': resolved}):
                return jsonResponse({"error": f"'{resolved}' was just claimed by another change; please retry."}, status=409)
            return jsonResponse({"error": str(e)}, status=500)
        except InputError as e:
            # entry.save() inside change_lexicon_headword runs _validate(), which can reject
            # resolved for reasons get_available_lexicon_headword doesn't check itself (e.g.
            # ref-unsafe characters like a hyphen) -- a normal client input error, not a 500.
            return jsonResponse({"error": str(e)}, status=400)
        # actual_headword rather than resolved: entry.save() inside change_lexicon_headword
        # can still transform it (NFC-normalize), so resolved is only the pre-save candidate.
        return jsonResponse({"status": "ok", "headword": actual_headword})
