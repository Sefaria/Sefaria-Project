import re
import csv
import requests
from datetime import datetime, timedelta
from io import StringIO
from pprint import pprint

from sefaria.model import Ref
from sefaria.system.database import db
from sefaria.utils.calendars import get_parasha

"""
url = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSL8vy0MbanOBqSQIW_h73uolEFphleIL08OvpJwhQuCH82cUyjTcyoOH817anHRVYQYnMDxXy16kf1/pub?gid=0&single=true&output=csv'
response = requests.get(url)
data = response.content.decode("utf-8")
cr = csv.reader(StringIO(data))
rows = list(cr)[1:]
"""


def print_parashah_rows(n=1000, lang="en"):
  d = datetime.now()

  for i in range(n):
    d = d + timedelta(days=1)
    p_diaspora = get_parasha(d, diaspora=True)
    p_israel = get_parasha(d, diaspora=False)

    rows = [p_diaspora["parasha"]]
    if p_diaspora["parasha"] != p_israel["parasha"]:
      rows.append(p_israel["parasha"])

    for row in rows:
      print("{}, {}".format(d.strftime("%-m/%-d/%y"), row))


def print_rows_with_interpolated_dates(rows):
  next_date = lambda d: d + timedelta(days=1)
  parse_date = lambda d: datetime.strptime(d, "%m/%d/%y")
  last_date = parse_date(rows[0][0]) - timedelta(days=1)
  for row in rows:
    this_date = parse_date(row[0])
    while this_date > last_date:
      print(last_date.strftime("%-m/%-d/%y"))
      last_date = next_date(last_date)

    if this_date != last_date: #skip duplicates
      print(", ".join(row))
      last_date = next_date(last_date)


def dupe_rows(rows):
  last = None
  for row in rows:
    if row[0] == last:
      print (", ".join(row))
    last = row[0]