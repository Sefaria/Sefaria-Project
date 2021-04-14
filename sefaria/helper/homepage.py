import re
import csv
import requests
import random
from datetime import datetime, timedelta
from io import StringIO
from pprint import pprint

from django.utils import timezone

from sefaria.model import Ref, Topic, Collection
from sefaria.sheets import get_sheet, sheet_to_dict
from sefaria.utils.calendars import get_parasha
from sefaria.utils.hebrew import is_hebrew, hebrew_term, hebrew_parasha_name
from sefaria.helper.topic import get_topic_by_parasha
from sefaria.system.cache import django_cache, delete_cache_elem


@django_cache(timeout=1 * 60 * 60, cache_key="homepage")
def get_homepage_data(language="english"):
  urls = {
    "english": {
      "parashah": 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSoHRVY9Z5MNhERjolxXzQ6Efp3SFTniHMgkSORWFPlkwoj5ppYeP8AyTX7yG_LcQ3p165iRNfOpOSZ/pub?output=csv',
      "calendar": 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSoHRVY9Z5MNhERjolxXzQ6Efp3SFTniHMgkSORWFPlkwoj5ppYeP8AyTX7yG_LcQ3p165iRNfOpOSZ/pub?gid=1789079733&single=true&output=csv',
      "discover": 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSoHRVY9Z5MNhERjolxXzQ6Efp3SFTniHMgkSORWFPlkwoj5ppYeP8AyTX7yG_LcQ3p165iRNfOpOSZ/pub?gid=2070604890&single=true&output=csv',
      "featured": 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSoHRVY9Z5MNhERjolxXzQ6Efp3SFTniHMgkSORWFPlkwoj5ppYeP8AyTX7yG_LcQ3p165iRNfOpOSZ/pub?gid=1926549189&single=true&output=csv',
    },
    "hebrew": {
      "parashah": 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRefP0BMml1sC6Ic50t2ekkLLIh3SIH9uYEBjWmdRwmBGs0-NDFFhjU3vW_tFzj_ATpK2PwqNdpVwQ4/pub?gid=0&single=true&output=csv',
      "calendar": 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRefP0BMml1sC6Ic50t2ekkLLIh3SIH9uYEBjWmdRwmBGs0-NDFFhjU3vW_tFzj_ATpK2PwqNdpVwQ4/pub?gid=1789079733&single=true&output=csv',
      "discover": 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRefP0BMml1sC6Ic50t2ekkLLIh3SIH9uYEBjWmdRwmBGs0-NDFFhjU3vW_tFzj_ATpK2PwqNdpVwQ4/pub?gid=2070604890&single=true&output=csv',
      "featured": 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRefP0BMml1sC6Ic50t2ekkLLIh3SIH9uYEBjWmdRwmBGs0-NDFFhjU3vW_tFzj_ATpK2PwqNdpVwQ4/pub?gid=1926549189&single=true&output=csv',
    },
  }

  return {
    "parashah": load_data_from_sheet(urls[language]["parashah"]),
    "calendar": load_data_from_sheet(urls[language]["calendar"]),
    "discover": load_data_from_sheet(urls[language]["discover"]),
    "featured": load_data_from_sheet(urls[language]["featured"]),
  }


def load_data_from_sheet(url):
  response = requests.get(url)
  data = response.content.decode("utf-8")
  cr = csv.reader(StringIO(data))
  rows = list(cr)
  fields = rows[1]
  data   = rows[2:]

  keyed_data = []
  for row in data:
    row_data = {}
    for i in range(len(fields)):
      row_data[fields[i]] = row[i]
    keyed_data.append(row_data)

  return keyed_data


def get_homepage_items(date="5/23/21", language="englsih", diaspora=True, refresh=False):
  if refresh:
    delete_cache_elem("homepage")
  
  data = get_homepage_data(language=language)

  if date is None:
    datetime_obj = timezone.localtime(timezone.now())
    date = datetime_obj.strftime("%-m/%-d/%y")

  return {
    "parashah": get_parashah_item(data["parashah"], date=date, diaspora=diaspora),
    "calendar": get_calendar_item(data["calendar"], date=date),
    "discover": get_discover_item(data["discover"], date=date),
    "featured": get_featured_item(data["featured"], date=date),
  }


def get_parashah_item(data, date=None, diaspora=True, interface_lang="english"):
  parashah = get_parasha(datetime.strptime(date, "%m/%d/%y"), diaspora=diaspora)
  parashah_name = parashah["parasha"]
  parashah_topic = get_topic_by_parasha(parashah_name)
  # TODO failsafe if we don't have a topic

  todays_data = None
  for day_data in data:
    if day_data["Date"] == date and day_data["Parashah"] == parashah_name:
      todays_data = day_data
      break
  if not todays_data:
    # Couldn't find a matching row in the data, fall back to something random
    sheet = get_featured_sheet_from_topic(parashah_topic.slug)
  else:
    sheet = sheet_with_customization(todays_data)

  sheet["heading"] = {
    "en": "On " + parashah_name,
    "he": "על " + hebrew_parasha_name(parashah_name)
  }

  return {
    "topic": parashah_topic.contents(),
    "sheet": sheet
  }


def get_calendar_item(data, date):
  todays_data = get_todays_data(data, date)
  if not todays_data or not todays_data["Topic URL"]:
    return None

  topic = topic_from_url(todays_data["Topic URL"])
  topic["date"] = todays_data["Displayed Date"]
  if len(todays_data["Custom About Title"]):
    topic["primaryTitle"] = {"en": todays_data["Custom About Title"], "he": todays_data["Custom About Title"]}

  sheet = sheet_with_customization(todays_data)
  sheet["heading"] = {
    "en": "On " + topic["primaryTitle"]["en"],
    "he": "על " + topic["primaryTitle"]["he"],
  }

  return {
    "topic": topic,
    "sheet": sheet
  }


def get_discover_item(data, date):
  todays_data = get_todays_data(data, date)
  if not todays_data or not todays_data["Sheet URL"]:
    return None

  if todays_data["Citation"]: 
    oRef = Ref(todays_data["Citation"])
    about = {
      "title": todays_data["Description Title"],
      "description": todays_data["Description"],
      "ref": {
        "url": oRef.url(),
        "en": oRef.normal(),
        "he": oRef.he_normal(),
      },
      "category": {
        "en": oRef.index.get_primary_category(),
        "he": hebrew_term(oRef.index.get_primary_category()),
      }
    }
  else:
    about = None

  sheet = sheet_with_customization(todays_data)
  sheet["heading"] = {
    "en": "On " + about["category"]["en"],
    "he": "על ה" + about["category"]["he"],
  }

  return {
    "about": about,
    "sheet": sheet
  }


def get_featured_item(data, date):
  todays_data = get_todays_data(data, date)
  if not todays_data or not (todays_data["Block Title"] and todays_data["Sheet URL"]):
    return None

  sheet = sheet_with_customization(todays_data)

  return {
    "heading": todays_data["Block Title"],
    "sheet": sheet
  }


def get_todays_data(data, date):
  todays_data = None
  for day_data in data:
    if day_data["Date"] == date:
      todays_data = day_data
      break
  return todays_data


def sheet_with_customization(data):
  sheet_id = url_to_sheet_id(data["Sheet URL"])
  sheet = sheet_to_dict(get_sheet(sheet_id))

  if len(data["Custom Title"]):
    sheet["title"] = data["Custom Title"]
  if len(data["Custom Summary"]):
    sheet["summary"] = data["Custom Summary"]

  return sheet


def url_to_sheet_id(url):
  m = re.match(r".+\/sheets\/(\d+)", url)
  return int(m[1])


def topic_from_url(url):
  slug = url_to_topic_slug(url)
  topic = Topic().load({"slug": slug}).contents()
  return topic


def url_to_topic_slug(url):
  m = re.match(r".+\/topics\/([^?]+)", url)
  return m[1]


def get_featured_sheet_from_collection(collection):
  import random
  collection = Collection().load({"slug": collection})
  if not collection:
    return None

  sheets = collection.sheet_contents()

  return random.choice(sheets) if len(sheets) else None


def get_featured_sheet_from_topic(slug):
  import random
  from sefaria.sheets import sheet_list
  from sefaria.model.topic import RefTopicLinkSet
  sheet_links = RefTopicLinkSet({"is_sheet": True, "toTopic": slug})
  sids = [int(s.ref.replace("Sheet ", "")) for s in sheet_links]
  if not len(sids):
    return None

  sheets = sheet_list({
    "id": {"$in": sids},
    "summary": {"$exists": 1},
  })
  sheets = [s for s in sheets if not is_hebrew(s["title"]) and s["summary"] and len(s["summary"]) > 140]
  return random.choice(sheets)


def get_featured_sheet_from_ref(ref):
  import random
  sheets = get_sheets_for_ref(ref)
  sheets = [s for s in sheets if not is_hebrew(s["title"]) and s["summary"] and len(s["summary"]) > 140]
  return random.choice(sheets)  



### Helper function for populting spreadsheet ###

def print_parashah_rows(n=1000, lang="en"):
  """
  Helper for populating Homepage Schedule spreadsheet.
  Prints a date and the name of upcoming parashah, to be coped into the spreadsheet.
  Prints multiple rows when Israel/Disapora readings differ.
  """

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