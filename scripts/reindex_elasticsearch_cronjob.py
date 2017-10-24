from datetime import datetime
import requests
import json
from sefaria.model import *
from sefaria.search import index_all
from sefaria.local_settings import SEFARIA_BOT_API_KEY
start_time = datetime.now().replace(second=0, microsecond=0).isoformat()
index_all(merged=False)
payload = {"timestamp": start_time, "apikey": SEFARIA_BOT_API_KEY}
r = requests.post("https://sefaria.org/admin/index-sheets-by-timestamp", data=json.dumps(payload))
if "error" in r.text:
    pass
    # email dev!
