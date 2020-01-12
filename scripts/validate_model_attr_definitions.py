from sefaria.system.database import db

from sefaria.model import *


record_classes = abstract.get_record_classes()
for record_class in record_classes:
    class_keys = set(record_class.required_attrs + record_class.optional_attrs + [record_class.id_field])
    req_class_keys = set(record_class.required_attrs)
    print()
    print(record_class)
    print("Class Keys: " + str(class_keys))
    print("Required: " + str(req_class_keys))
    not_covered_keys = set()
    failed_reqs = set()
    records = getattr(db, record_class.collection).find()
    for rec in records:
        record_keys = set(rec.keys())
        not_covered_keys |= record_keys - class_keys
        failed_reqs |= req_class_keys - record_keys
    if len(not_covered_keys):
        print("Keys not covered: " + str(not_covered_keys))
    if len(failed_reqs):
        print("Required keys missing in some records: " + str(failed_reqs))