"""Digest the model schemas the Mongo fixtures were recorded against, so a schema change flags stale fixtures."""
import hashlib
import json


def schema_digests():
    """Return {collection: {"required", "optional", "schema_sha"}} for the least-derived record class per collection."""
    from sefaria.model import abstract
    by_collection = {}
    for cls in abstract.get_record_classes():
        by_collection.setdefault(cls.collection, []).append(cls)
    digests = {}
    for collection, classes in by_collection.items():
        cls = min(classes, key=lambda c: len(c.__mro__))
        sha = hashlib.sha256(json.dumps(cls.attr_schemas, sort_keys=True, default=repr).encode()).hexdigest()[:12]
        digests[collection] = {"required": sorted(cls.required_attrs), "optional": sorted(cls.optional_attrs),
                               "schema_sha": sha}
    return digests


def schema_changes(recorded, current):
    """Per changed collection, which attrs were added or removed and whether the attr schemas changed."""
    changes = {}
    for collection in sorted(set(recorded) | set(current)):
        old, new = recorded.get(collection), current.get(collection)
        if old == new:
            continue
        old, new = old or {"required": [], "optional": [], "schema_sha": None}, new or {"required": [], "optional": [], "schema_sha": None}
        changes[collection] = {
            "required_added": sorted(set(new["required"]) - set(old["required"])),
            "required_removed": sorted(set(old["required"]) - set(new["required"])),
            "optional_added": sorted(set(new["optional"]) - set(old["optional"])),
            "optional_removed": sorted(set(old["optional"]) - set(new["optional"])),
            "schema_changed": old["schema_sha"] != new["schema_sha"],
        }
    return changes
