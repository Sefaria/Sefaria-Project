import django
from datetime import datetime
import time
from pymongo.errors import AutoReconnect
django.setup()
from sefaria.model import *
from sefaria.system.database import db
from sefaria.utils.util import epoch_time


def get_all_sheets(tries=0, page=0):
    limit = 1000
    has_more = True
    while has_more:
        try:
            temp_sheets = list(db.sheets.find().skip(page*limit).limit(limit))
        except AutoReconnect as e:
            tries += 1
            if tries >= 200:
                print("Tried: {} times".format(tries))
                raise e
            time.sleep(5)
            continue
        has_more = False
        for s in temp_sheets:
            has_more = True
            yield s
        page += 1

now = epoch_time()
default_epoch_time = epoch_time(datetime(2017, 12, 1))  # the Sefaria epoch. approx time since we added time stamps to recent items
for sheet in get_all_sheets():
    likes = sheet.get("likes", [])
    if "id" not in sheet:
        print(sheet)
        continue
    tref = "Sheet {}".format(sheet["id"])
    if len(likes) > 0:
        oref = Ref(tref)
        for l in likes:
            d = {
                "uid": l,
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
            uh = UserHistory(d)
            uh.save()
    try:
        del sheet["likes"]
        db.sheets.save(sheet)
    except KeyError:
        pass
