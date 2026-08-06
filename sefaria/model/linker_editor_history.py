"""
linker_editor_history.py
Writes to MongoDB Collection: linker_editor_history

Append-only audit log of every mutating action taken through the staff linker editor
(/linker-editor), recording who (uid) did what (action) with what inputs (params), so the
full action sequence has enough detail to be replayed against a different environment.

Does NOT log rebuild_linker / rebuild_linker_resolvers (sefaria.model.text.Library, triggered
from sefaria/views.py) -- those are global in-process cache rebuilds, not scoped to a single
uid+index mutation, and are out of scope by design.
"""
import time

from sefaria.model.abstract import AbstractMongoRecord, AbstractMongoSet

# Every action linker_editor.py's mutating functions can log. Kept as a closed set so a
# typo'd action string fails validation loudly rather than silently creating an unreplayable
# log entry.
ACTIONS = (
    "add_match_template",
    "remove_match_template",
    "replace_match_template",
    "set_address_types",
    "set_node_properties",
    "rebuild_dibur_hamatchils",
    "create_non_unique_term",
    "add_non_unique_term_titles",
    "delete_non_unique_term",
    "swap_non_unique_term_usages",
)


class LinkerEditorHistory(AbstractMongoRecord):
    collection = "linker_editor_history"
    required_attrs = ["uid", "action", "params", "created"]
    optional_attrs = ["index_title", "slug"]  # denormalized from params, for querying

    attr_schemas = {
        "uid": {"type": "integer", "required": True},
        "action": {"type": "string", "allowed": list(ACTIONS), "required": True},
        "params": {"type": "dict", "required": True},
        "created": {"type": "integer", "required": True},
        "index_title": {"type": "string", "required": False},
        "slug": {"type": "string", "required": False},
    }

    def _sanitize(self):
        # Internal log of already-validated admin input, not raw HTML. (The default bleach pass
        # only touches string attrs anyway, so `params` -- a dict -- would be left alone regardless.)
        pass


class LinkerEditorHistorySet(AbstractMongoSet):
    recordClass = LinkerEditorHistory


def log_linker_editor_action(uid, action, params, index_title=None, slug=None):
    """
    Record one linker-editor action. Called by sefaria.helper.linker_editor immediately after
    each successful mutation -- a failed mutation should never produce a log entry.
    """
    doc = {
        "uid": uid,
        "action": action,
        "params": params,
        "created": int(time.time()),
    }
    if index_title is not None:
        doc["index_title"] = index_title
    if slug is not None:
        doc["slug"] = slug
    return LinkerEditorHistory(doc).save()
