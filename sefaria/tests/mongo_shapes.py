"""Observe which collections and fields a test touches on the mongomock client (stdlib + mongomock only)."""
import contextlib, json, os
FORMAT = 1
IGNORED_FIELDS = frozenset({"_id"})

def referenced_fields(value):
    if isinstance(value, str) and value.startswith("$"):
        return {value[1:].split(".", 1)[0]}
    if isinstance(value, dict):
        out = set()
        for key, item in value.items():
            if key.startswith("$"): out |= referenced_fields(item)
            else:
                out.add(key.split(".", 1)[0])
                if isinstance(item, (dict, list)): out |= referenced_fields(item)
        return out
    if isinstance(value, list):
        out = set()
        for item in value: out |= referenced_fields(item)
        return out
    return set()

def projection_fields(projection):
    if isinstance(projection, dict):
        return {k.split(".", 1)[0] for k, v in projection.items() if v and not k.startswith("$")}
    if isinstance(projection, (list, tuple, set)):
        return {str(k).split(".", 1)[0] for k in projection}
    return set()

class ShapeTracker:
    def __init__(self): self._installed = False; self._current = None; self.flags = set()
    def install(self):
        if self._installed: return
        from mongomock import collection as mc
        t = self
        o_iter, o_insert, o_agg, o_find, o_hint = (mc.Collection._iter_documents, mc.Collection._insert,
            mc.Collection.aggregate, mc.Collection.find, mc.Cursor.hint)
        def _iter(coll, filter): t._note(coll.name, referenced_fields(filter)); return o_iter(coll, filter)
        def _insert(coll, data, *a, **k): t._note(coll.name, ()); return o_insert(coll, data, *a, **k)
        def _agg(coll, pipeline, *a, **k):
            t._note(coll.name, referenced_fields([s["$match"] for s in pipeline if isinstance(s, dict) and "$match" in s]))
            return o_agg(coll, pipeline, *a, **k)
        def _find(coll, filter=None, projection=None, *a, **k):
            t._note(coll.name, projection_fields(projection))
            for key in ("hint", "collation", "max_time_ms"):
                if k.get(key) is not None: t._flag(f"{key}:{k[key]}")
            return o_find(coll, filter, projection, *a, **k)
        def _hint(cursor, index): t._flag(f"hint:{index}"); return o_hint(cursor, index)
        mc.Collection._iter_documents, mc.Collection._insert, mc.Collection.aggregate = _iter, _insert, _agg
        mc.Collection.find, mc.Cursor.hint = _find, _hint
        self._installed = True
    def _note(self, coll, fields):
        if self._current is not None: self._current.setdefault(coll, set()).update(set(fields) - IGNORED_FIELDS)
    def _flag(self, what):
        if self._current is not None: self.flags.add(what)
    @contextlib.contextmanager
    def recording(self):
        self._current, self.flags = {}, set()
        try: yield self._current
        finally: self._current = None

def load_shapes(path):
    if not os.path.isfile(path): return None
    payload = json.load(open(path))
    return {n: {c: set(f) for c, f in cols.items()} for n, cols in payload.get("shapes", {}).items()}

def shape_drift(observed, recorded):
    return [(c, sorted(observed[c] - recorded.get(c, set()))) for c in sorted(observed)
            if c not in recorded or observed[c] - recorded[c]]

def drift_message(nodeid, drift, flags=()):
    lines = [f"FIXTURE DRIFT for {nodeid}: the test now touches Mongo differently than its fixture was recorded for."]
    lines += [f"  collection {c!r}: new fields {f or '(whole collection is new)'}" for c, f in drift]
    lines += [f"  mongomock ignores {x}: mark the test needs_corpus" for x in sorted(flags)]
    lines.append(f"Fix: python scripts/pytest_minimal_dataset/rerecord_fixtures.py --only '{nodeid}'")
    return "\n".join(lines)
