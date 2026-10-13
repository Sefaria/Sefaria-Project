import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "sefaria.settings")
import django

django.setup()

from sefaria.model import Version
from sefaria.system.database import db

QUERY = {"title": "Chafetz Chaim", "versionTitle": "Sefaria Community Translation [fa]"}

# Step 1: verify we have the right record before touching anything
print("=== Step 1: Verify record ===")
r = db.texts.find_one(
    QUERY,
    {"title": 1, "versionTitle": 1, "actualLanguage": 1, "languageFamilyName": 1, "language": 1},
)

if not r:
    print("ERROR: Record not found. Check title and versionTitle.")
    exit(1)

print("Current state:", r)

if r.get("actualLanguage") == "fa":
    print("actualLanguage is already 'fa' — already fixed. Exiting.")
    exit(0)

assert r.get("actualLanguage") == "ar", (
    f"Unexpected actualLanguage: {r.get('actualLanguage')} — stopping, manual review needed"
)

print("Record verified. Proceeding.\n")

# Step 2: unset the stale fields so _normalize() re-derives them from the versionTitle bracket
print("=== Step 2: Unset stale fields ===")
result = db.texts.update_one(
    QUERY,
    {"$unset": {"actualLanguage": "", "languageFamilyName": ""}},
)
assert result.modified_count == 1, "Update did not modify any document — stopping"
print(f"Modified {result.modified_count} document.\n")

# Step 3: verify the unset worked before re-saving
print("=== Step 3: Verify unset ===")
r2 = db.texts.find_one(QUERY, {"actualLanguage": 1, "languageFamilyName": 1})
assert "actualLanguage" not in r2, "actualLanguage still present after unset"
assert "languageFamilyName" not in r2, "languageFamilyName still present after unset"
print("Fields unset confirmed.\n")

# Step 4: re-save through the ORM — _normalize() extracts [fa] from versionTitle
# and writes actualLanguage = 'fa' and languageFamilyName = 'farsi'
print("=== Step 4: Re-save through ORM ===")
v = Version().load({"title": "Chafetz Chaim", "versionTitle": "Sefaria Community Translation [fa]"})
v.save()
print("Saved.\n")

# Step 5: verify the result
print("=== Step 5: Verify fix ===")
r3 = db.texts.find_one(
    QUERY,
    {"title": 1, "versionTitle": 1, "actualLanguage": 1, "languageFamilyName": 1},
)
print("Final state:", r3)
assert r3.get("actualLanguage") == "fa", f"actualLanguage not updated: {r3.get('actualLanguage')}"
print("\nSUCCESS — actualLanguage is now 'fa', languageFamilyName is now", r3.get("languageFamilyName"))
print("Verify at /api/texts/translations/ar (Chafetz Chaim should be gone)")
print("Verify at /api/texts/translations/fa (Chafetz Chaim should appear)")

# Rollback if needed:
# db.texts.update_one(
#     QUERY,
#     {'$set': {'actualLanguage': 'ar', 'languageFamilyName': 'arabic'}}
# )
