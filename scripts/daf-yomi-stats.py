# encoding=utf-8
import django
django.setup()

import csv
from datetime import datetime, timedelta
from sefaria.system.database import db


# Process Daf Yomi data dumped from Analytics.
# Record format: BookName, Ref, Date, Users, Sessions

FORWARD = 5             # days +
BACK = -1 * FORWARD     # days -

# Get list of dappim/dates
dappim = []
d = datetime(2020,1,5)  # Start of cycle
d_objs = [d + timedelta(days=x) for x in range(308)]  # Until Nov 7
d_strs = [d.strftime("%-m/%-d/%Y") for d in d_objs]
c = db.dafyomi.find({"date": {"$in": d_strs}})
for o in c:
    dappim += [{"daf": o["daf"].replace("Eiruvin","Eruvin"),  "date": datetime.strptime(o["date"], "%m/%d/%Y")}]

# Raw data
rows = []
with open('/Users/levisrael/Downloads/dafyomi-2.csv', mode='r') as csv_file:
    csv_reader = csv.DictReader(csv_file)
    line_count = 0
    for row in csv_reader:
        if line_count == 0:
            print(f'Column names are {", ".join(row)}')
            line_count += 1
        rows += [row]
        line_count += 1
    print(f'Processed {line_count} lines.')

# Record is {BookName, Ref, Date, Users, Sessions}
# Convert to (ref, data): record
stats_lookup = {(row["Ref"], datetime.strptime(row["Date"], "%Y-%m-%d")):row for row in rows}

daf_data = {}
for daf in dappim:
    a_side = daf["daf"] + "a"
    b_side = daf["daf"] + "b"

    dates = [daf["date"] - timedelta(days=x) for x in range(BACK, FORWARD +1)]
    d = {}
    days = []
    for date in dates:
        try:
            days += [(int(stats_lookup[(a_side, date)]["Users"]), int(stats_lookup[(b_side, date)]["Users"]))]
        except KeyError as e:
            try:
                days += [(int(stats_lookup[(a_side, date)]["Users"]), 0)]
            except Exception as e:
                days += [(0, 0)]
                print(e)

    d["total"] = sum([max(a,b) for a,b in days])
    d["days"] = days
    daf_data[daf["daf"]] = d

for daf in dappim:
    print("{},{}".format(daf["daf"], daf_data[daf["daf"]]["total"]))

