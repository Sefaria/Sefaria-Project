import json
import unicodedata

from bson import ObjectId
from bson.errors import InvalidId
from django.contrib.auth.models import User
from django.views import View
from django.views.decorators.csrf import csrf_exempt, csrf_protect

from sefaria.client.util import jsonResponse
from sefaria.model.lexicon import LexiconEntry, LexiconEntrySet, Lexicon, LexiconEntrySubClassMapping, WordForm, WordFormSet
from sefaria.model.text import Ref
from sefaria.system.database import db
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


# ---- Bulk upload of a whole lexicon (used by scripts/move_draft_lexicon.py) ----
#
# Entries and word forms are matched on _id, not headword/form: neither is unique (BDB Augmented
# Strong has several entries per headword; one form often has a word form per generating script).
# Copies of the same Mongo dump share _ids, and records created in one environment keep their _id
# in the other, so later uploads (including headword renames) update instead of duplicating.
# Nothing is ever deleted here.


def _require_staff(request, write):
    """Runs write(request) for a staff user, logged in or with an API key (same rules as terms_api)."""
    if not request.user.is_authenticated:
        key = request.POST.get("apikey")
        if not key:
            return jsonResponse({"error": "You must be logged in or use an API key to upload lexicons."}, status=403)
        apikey = db.apikeys.find_one({"key": key})
        if not apikey:
            return jsonResponse({"error": "Unrecognized API key."}, status=403)
        user = User.objects.filter(id=apikey["uid"]).first()
        if not (user and user.is_staff):
            return jsonResponse({"error": "Only Sefaria Moderators can upload lexicons."}, status=403)
        return write(request)
    if request.user.is_staff:
        return csrf_protect(write)(request)
    return jsonResponse({"error": "Only Sefaria Moderators can upload lexicons."}, status=403)


def _load_upload(request, expected_type):
    """The uploaded JSON: the "json" form field (as move_draft_text.py's APIs take it), else the raw body."""
    try:
        data = json.loads(request.POST["json"] if "json" in request.POST else request.body)
    except (json.JSONDecodeError, UnicodeDecodeError):
        return None, jsonResponse({"error": "Invalid JSON."}, status=400)
    if not isinstance(data, expected_type):
        return None, jsonResponse({"error": f"JSON must be a{'n object' if expected_type is dict else ' list'}."}, status=400)
    return data, None


def _check_fields(record_class, data):
    # save() silently drops fields the class doesn't list, so refuse them instead of losing data.
    unknown = sorted(set(data) - set(record_class.required_attrs + record_class.optional_attrs))
    if unknown:
        raise InputError(f"Unknown {record_class.__name__} fields: {unknown}")


def _pop_id(data):
    try:
        return ObjectId(data.pop("_id"))
    except (KeyError, InvalidId, TypeError):
        raise InputError("Each record needs a valid _id.")


def _is_unchanged(record, data):
    return {k: v for k, v in record._saveable_attrs().items() if k != record.id_field} == data


def _replace_fields(record, data):
    """Makes an existing record hold exactly `data`: fields missing from `data` are removed, _id is kept."""
    for attr in record.required_attrs + record.optional_attrs:
        if attr in vars(record):
            delattr(record, attr)
    return record.load_from_dict(data)


def _upsert_entry(lexicon, data):
    oid = _pop_id(data)
    if data.get("parent_lexicon") != lexicon:
        raise InputError(f"parent_lexicon must be '{lexicon}'.")
    entry_class = LexiconEntrySubClassMapping.class_factory(lexicon)
    _check_fields(entry_class, data)
    existing = LexiconEntry().load({"_id": oid})
    if not existing:
        entry_class(data).save(insert_id=oid)
        return "created"
    if existing.parent_lexicon != lexicon:
        raise InputError(f"This _id belongs to an entry of '{existing.parent_lexicon}'.")
    if _is_unchanged(existing, data):
        return "unchanged"
    _replace_fields(existing, data).save()
    return "updated"


def _upsert_word_form(lexicon, data):
    oid = _pop_id(data)
    _check_fields(WordForm, data)
    lookups = data.get("lookups")
    if not isinstance(lookups, list) or not lookups or any(l.get("parent_lexicon") != lexicon for l in lookups):
        raise InputError(f"lookups must be a non-empty list whose parent_lexicon is always '{lexicon}'.")
    existing = WordForm().load({"_id": oid})
    if not existing:
        WordForm(data).save(insert_id=oid)
        return "created"
    # A word form can hold lookups into several lexicons. Replace only this lexicon's, in the
    # position they already had, and keep the rest.
    merged, placed = [], False
    for lookup in existing.lookups:
        if lookup.get("parent_lexicon") != lexicon:
            merged.append(lookup)
        elif not placed:
            merged += lookups
            placed = True
    data["lookups"] = merged if placed else merged + lookups
    if _is_unchanged(existing, data):
        return "unchanged"
    _replace_fields(existing, data).save()
    return "updated"


def _upsert_batch(lexicon, upsert_one):
    def write(request):
        records, err = _load_upload(request, list)
        if err:
            return err
        lex = Lexicon().load({"name": lexicon})
        if not lex:
            return jsonResponse({"error": f"Lexicon '{lexicon}' does not exist. Upload it first."}, status=404)
        result = {"created": 0, "updated": 0, "unchanged": 0, "errors": 0, "error_details": []}
        for data in records:
            try:
                if not isinstance(data, dict):
                    raise InputError("Each record must be an object.")
                result[upsert_one(lexicon, dict(data))] += 1
            except Exception as e:
                # Report and move on, so one bad record doesn't sink the rest of the batch.
                result["errors"] += 1
                result["error_details"].append({"_id": data.get("_id") if isinstance(data, dict) else None, "error": f"{type(e).__name__}: {e}"})
        if upsert_one is _upsert_entry and (result["created"] or result["updated"]) and getattr(lex, "index_title", None):
            # Cached Refs of a dictionary Index embed the entries they point to (see LexiconEntryView.patch).
            Ref.remove_index_from_cache(lex.index_title)
            if MULTISERVER_ENABLED:
                server_coordinator.publish_event("Ref", "remove_index_from_cache", [lex.index_title])
        return jsonResponse(result)
    return write


@csrf_exempt
def lexicon_api(request, lexicon):
    if request.method == "GET":
        lex = Lexicon().load({"name": lexicon})
        if not lex:
            return jsonResponse({"error": f"Lexicon '{lexicon}' does not exist."}, status=404)
        return jsonResponse({
            "lexicon": lex.contents(),
            "entry_count": LexiconEntrySet({"parent_lexicon": lexicon}).count(),
            "word_form_count": WordFormSet({"lookups.parent_lexicon": lexicon}).count(),
        })
    if request.method != "POST":
        return jsonResponse({"error": "Unsupported HTTP method."}, status=405)

    def write(request):
        data, err = _load_upload(request, dict)
        if err:
            return err
        data.pop("_id", None)  # lexicons are matched on name
        if data.get("name") != lexicon:
            return jsonResponse({"error": f"name must be '{lexicon}'."}, status=400)
        try:
            _check_fields(Lexicon, data)
            existing = Lexicon().load({"name": lexicon})
            (_replace_fields(existing, data) if existing else Lexicon(data)).save()
        except InputError as e:
            return jsonResponse({"error": str(e)}, status=400)
        return jsonResponse({"status": "updated" if existing else "created"})
    return _require_staff(request, write)


@csrf_exempt
def lexicon_entries_api(request, lexicon):
    if request.method != "POST":
        return jsonResponse({"error": "Unsupported HTTP method."}, status=405)
    return _require_staff(request, _upsert_batch(lexicon, _upsert_entry))


@csrf_exempt
def lexicon_word_forms_api(request, lexicon):
    if request.method != "POST":
        return jsonResponse({"error": "Unsupported HTTP method."}, status=405)
    return _require_staff(request, _upsert_batch(lexicon, _upsert_word_form))
