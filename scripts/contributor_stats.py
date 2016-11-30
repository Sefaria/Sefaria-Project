from sefaria.system.database import *

all_sheet_makers = db.sheets.distinct("owner")
public_sheet_makers = db.sheets.find({"status": "public"}).distinct("owner")
all_contributors = set(db.history.distinct("user")+all_sheet_makers)

print "All Sheet Makers: %d" % len(all_sheet_makers)
print "Public Sheet Makers: %d" % len(public_sheet_makers)
print "Public contributors and source sheet makers: %d" % len(all_contributors)