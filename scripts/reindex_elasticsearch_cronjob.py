from datetime import datetime
import requests
import traceback
import os
import django
django.setup()
from sefaria.model import *
from sefaria.search import index_all
from sefaria.local_settings import SEFARIA_BOT_API_KEY
from sefaria.pagesheetrank import update_pagesheetrank

"""
Source sheets added after last_sheet_timestamp will be missing from the index process. We want to manually index all
source sheets created after this. Depending on the database being used to index the timestamp will be different. If
running against a production database, last_sheet_timestamp will be the time this script began running. Otherwise, this
value will need to be set to the time at which the last mongo dump was created (assuming the database is using the most
up-to-date mongo dump).
"""
# last_sheet_timestamp = datetime.fromtimestamp(os.path.getmtime("/var/data/sefaria_public/dump/sefaria")).isoformat()
try:
    last_sheet_timestamp = datetime.now().isoformat()
    update_pagesheetrank()
    index_all()
    r = requests.post("https://www.sefaria.org/admin/index-sheets-by-timestamp", data={"timestamp": last_sheet_timestamp, "apikey": SEFARIA_BOT_API_KEY})
    if "error" in r.text:
        raise Exception("Error when calling admin/index-sheets-by-timestamp API: " + r.text)
    else:
        print("SUCCESS!", r.text)
except Exception as e:
    tb_str = traceback.format_exc()
    print("Caught exception")
    post_object = {
        "icon_emoji": ":facepalm:",
        "username": "Reindex ElasticSearch",
        "channel": "#engineering-discuss",
        "attachments": [
            {
                "fallback": tb_str,
                "color": "#a30200",
                "pretext": "Cronjob Error",
                "text": tb_str
            }
        ]
    }
    requests.post(os.environ['SLACK_URL'], json=post_object)
    raise e
