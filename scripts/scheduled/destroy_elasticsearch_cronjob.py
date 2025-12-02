import django
django.setup()
from sefaria.model import *
from sefaria.search import clear_index
from sefaria.settings import SEARCH_INDEX_NAME_TEXT, SEARCH_INDEX_NAME_SHEET

"""
Delete Elasticsearch indexes for custom index names (not the default 'text' and 'sheet').
This script is used as a Helm post-delete hook to clean up staging environment indexes.
"""

TEXT_INDEX = SEARCH_INDEX_NAME_TEXT
SHEET_INDEX = SEARCH_INDEX_NAME_SHEET

print(f"Text index name: {TEXT_INDEX}")
print(f"Sheet index name: {SHEET_INDEX}")

# Safety check and delete text indexes
if TEXT_INDEX == "text":
    print("Skipping text index deletion - using default 'text' index")
else:
    print(f"Deleting custom text indexes: {TEXT_INDEX}-a, {TEXT_INDEX}-b, and alias {TEXT_INDEX}")
    try:
        clear_index(f"{TEXT_INDEX}-a")
        print(f"Successfully deleted index: {TEXT_INDEX}-a")
    except Exception as e:
        print(f"Index {TEXT_INDEX}-a not found or already deleted: {e}")
    
    try:
        clear_index(f"{TEXT_INDEX}-b")
        print(f"Successfully deleted index: {TEXT_INDEX}-b")
    except Exception as e:
        print(f"Index {TEXT_INDEX}-b not found or already deleted: {e}")
    
    try:
        clear_index(TEXT_INDEX)
        print(f"Successfully deleted index/alias: {TEXT_INDEX}")
    except Exception as e:
        print(f"Index/alias {TEXT_INDEX} not found or already deleted: {e}")

# Safety check and delete sheet indexes
if SHEET_INDEX == "sheet":
    print("Skipping sheet index deletion - using default 'sheet' index")
else:
    print(f"Deleting custom sheet indexes: {SHEET_INDEX}-a, {SHEET_INDEX}-b, and alias {SHEET_INDEX}")
    try:
        clear_index(f"{SHEET_INDEX}-a")
        print(f"Successfully deleted index: {SHEET_INDEX}-a")
    except Exception as e:
        print(f"Index {SHEET_INDEX}-a not found or already deleted: {e}")
    
    try:
        clear_index(f"{SHEET_INDEX}-b")
        print(f"Successfully deleted index: {SHEET_INDEX}-b")
    except Exception as e:
        print(f"Index {SHEET_INDEX}-b not found or already deleted: {e}")
    
    try:
        clear_index(SHEET_INDEX)
        print(f"Successfully deleted index/alias: {SHEET_INDEX}")
    except Exception as e:
        print(f"Index/alias {SHEET_INDEX} not found or already deleted: {e}")

print("Elasticsearch cleanup complete")

