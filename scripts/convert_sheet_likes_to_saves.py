import django
from datetime import datetime

django.setup()
from sefaria.model import *
from sefaria.system.database import db
from sefaria.utils.util import epoch_time


all_sheets = db.sheets.find({})

now = epoch_time()
default_epoch_time = epoch_time(datetime(2017, 12, 1))  # the Sefaria epoch. approx time since we added time stamps to recent items
for sheet in all_sheets:
    likes = sheet.get("likes", [])
    tref = "Sheet {}".format(sheet["id"])
    oref = Ref(tref)
    for l in likes:
        d = {
            "ref": tref,
            "he_ref": oref.he_normal(),
            "book": oref.book,
            "versions": {},
            "last_place": False,
            "saved": True,
            "secondary": False,
            "sheet_title": sheet["title"],
            "sheet_owner": sheet["owner"],
            "time_stamp": default_epoch_time,
            "server_time_stamp": now
        }
