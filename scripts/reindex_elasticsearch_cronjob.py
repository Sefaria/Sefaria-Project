from datetime import datetime
import requests
import os
from sefaria.model import *
from sefaria.search import index_all, init_pagesheetrank_dicts
from sefaria.local_settings import SEFARIA_BOT_API_KEY
from sefaria.pagesheetrank import calculate_pagerank, calculate_sheetrank

# Source sheets added after this time will be missing from the index process. We want to manually index all source
# sheets created after this. When this script is run on the cloud the timestamp might need to be calculated differently.
last_dump = datetime.fromtimestamp(os.path.getmtime("/var/data/sefaria_public/dump/sefaria")).isoformat()
calculate_pagerank()
calculate_sheetrank()
# reinit pagesheetrank after calculation
init_pagesheetrank_dicts()
index_all(merged=False)
index_all(merged=True)
r = requests.post("https://www.sefaria.org/admin/index-sheets-by-timestamp", data={"timestamp": last_dump, "apikey": SEFARIA_BOT_API_KEY})
if "error" in r.text:
    raise Exception("Error when calling admin/index-sheets-by-timestamp API: " + r.text)
else:
    print "SUCCESS!", r.text
