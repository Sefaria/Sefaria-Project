import django
django.setup()
from sefaria.model import *
import json


INPUT = "/Users/levisrael/sefaria/guide/data.jsonl"
loaded_data = []

# Each object should have keys: "ref", "en", "he", "response", "error", "skipped", "raw"
# When "skipped" is True, "response" and "error" should be empty. A mistake in logic may result in raw having the previous response.  Raw is only relevant if skipped is false.

with open(INPUT, "r") as f:
    # Read the first line
    line = f.readline()
    # If the file is not empty keep reading line one at a time
    # till the file is empty
    while line:
        # Decode the JSON from the line
        loaded_data += [json.loads(line)]
        # read the next line
        line = f.readline()

for d in loaded_data:
    if d["skipped"]:
        continue
    Guide().load_from_dict(d["response"]).save()