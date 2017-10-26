from datetime import datetime
import requests
from sefaria.model import *
from sefaria.search import index_all
from sefaria.local_settings import SEFARIA_BOT_API_KEY
start_time = datetime.now().replace(second=0, microsecond=0).isoformat()
index_all(merged=False)
r = requests.post("https://www.sefaria.org/admin/index-sheets-by-timestamp", data={"timestamp": start_time, "apikey": SEFARIA_BOT_API_KEY})
if "error" in r.text:
    raise Exception("Error when calling admin/index-sheets-by-timestamp API: " + r.text)
