"""Digest the model schemas the Mongo fixtures were recorded against, so a schema change flags stale fixtures."""
import copy
import hashlib
import json


def _effective_schema(schema, is_root=True):
    """
    Copy of `schema` with AbstractMongoRecord._validate's in-place edit applied: on first save of an instance,
    it sets `allow_unknown` (default False) on every nested dict schema of the class's attr_schemas. Hashing
    this form keeps a digest the same whether or not an earlier test in the session saved that model.
    """
    schema = copy.deepcopy(schema)
    if not is_root and schema.get('type') == 'dict':
        schema['allow_unknown'] = schema.get('allow_unknown', False)
    for key in schema:
        if isinstance(schema[key], dict) and 'schema' in schema[key]:
            schema[key] = _effective_schema(schema[key], is_root=False)
    return schema


def schema_digests():
    """Return {collection: {"required", "optional", "schema_sha"}} for the least-derived record class per collection."""
    from sefaria.model import abstract
    # Record classes defined outside sefaria.model register only once imported; import them so the digest
    # set doesn't depend on what earlier tests in the session happened to import.
    import sefaria.sheets  # noqa: F401
    import sefaria.helper.legacy_ref  # noqa: F401
    by_collection = {}
    for cls in abstract.get_record_classes():
        by_collection.setdefault(cls.collection, []).append(cls)
    digests = {}
    for collection, classes in by_collection.items():
        cls = min(classes, key=lambda c: len(c.__mro__))
        sha = hashlib.sha256(json.dumps(_effective_schema(cls.attr_schemas), sort_keys=True, default=repr).encode()).hexdigest()[:12]
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
