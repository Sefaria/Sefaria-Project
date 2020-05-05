from sefaria.system.database import *

all_sheet_makers = db.sheets.distinct("owner")
public_sheet_makers = db.sheets.find({"status": "public"}).distinct("owner")
all_contributors = set(db.history.distinct("user")+all_sheet_makers)

print("All Sheet Makers: %d" % len(all_sheet_makers))
print("Public Sheet Makers: %d" % len(public_sheet_makers))
print("Public contributors and source sheet makers: %d" % len(all_contributors))

"""
// Getting counts from times past
from dateutil.relativedelta import relativedelta
start = datetime.today() - relativedelta(years=1)
query = {"dateCreated": {"$lt": start.isoformat()}}

sheet_makers = db.sheets.find(query).distinct("owner")
contributors = db.history.find({"date": {"$lt": start}}).distinct("user")
print len(set(sheet_makers+contributors))
"""