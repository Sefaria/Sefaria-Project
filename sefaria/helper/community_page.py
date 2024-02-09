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
from sefaria.system.database import db
from sefaria.utils.calendars import get_parasha
from sefaria.utils.hebrew import has_hebrew, hebrew_term, hebrew_parasha_name
from sefaria.utils.util import strip_tags
from sefaria.helper.topic import get_topic_by_parasha
from sefaria.system.cache import django_cache, delete_cache_elem, cache_get_key, in_memory_cache


def get_community_page_data(language="english", refresh=False):
  """
  Returns (nearly) raw data from Community page spreadsheet for `language`. Manages caching of date in memeory.
  """
  data = in_memory_cache.get("community-page-data-{}".format(language))
  if data and not refresh:
    return data

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

  data = {
    "parashah": load_data_from_sheet(urls[language]["parashah"]),
    "calendar": load_data_from_sheet(urls[language]["calendar"]),
    "discover": load_data_from_sheet(urls[language]["discover"]),
    "featured": load_data_from_sheet(urls[language]["featured"]),
  }

  in_memory_cache.set("community-page-data-{}".format(language), data, timeout=60 * 60)

  return data


def load_data_from_sheet(url):
  """
  Returns data from a single spreadsheet URL, formatted as keyed objects according to sheet headers, translating Hebrew headers into English.
  """
  response = requests.get(url)
  data     = response.content.decode("utf-8")
  cr       = csv.reader(StringIO(data))
  rows     = list(cr)
  fields   = [translate_labels(f) for f in rows[1]]
  data     = rows[2:]

  keyed_data = []
  for row in data:
    row_data = {}
    for i in range(len(fields)):
      row_data[fields[i]] = row[i]
    keyed_data.append(row_data)

  return keyed_data


def get_community_page_items(date=None, language="english", diaspora=True, refresh=False):
  """
  Retruns processed community page items
  """
  try:
    data = get_community_page_data(language=language, refresh=refresh)
  except:
    data = {
      "parashah": None,
      "calendar": None,
      "discover": None,
      "featured": None,
    }

  if date is None:
    datetime_obj = timezone.localtime(timezone.now())
    date = datetime_obj.strftime("%-m/%-d/%y")

  return {
    "parashah": get_parashah_item(data["parashah"], date=date, diaspora=diaspora),
    "calendar": get_featured_item(data["calendar"], date=date),
    "discover": get_featured_item(data["discover"], date=date),
    "featured": get_featured_item(data["featured"], date=date),
  }


def get_parashah_item(data, date=None, diaspora=True, interface_lang="english"):
    todays_data = get_todays_data(data, date)  # First we want the row in the sheet representing today. Always.
    weekend_reading = get_parasha(datetime.strptime(date, "%m/%d/%y"), diaspora=diaspora)  # What is this week's torah reading on Saturday. Can be a special reading for Holiday.

    if weekend_reading is not None:
        parashah_name = weekend_reading["parasha"]
        parashah_topic = get_topic_by_parasha(parashah_name)
    else:
        # Handle the case where weekend_reading is None
        # For example, return None or set default values for parashah_name and parashah_topic
        return None  # Or other appropriate handling

    if not todays_data or not (todays_data["Sheet URL"]):
        sheet = None
    else:
        sheet = sheet_with_customization(todays_data)
        if sheet:
            if parashah_topic and todays_data["Parashah"] in [parashah_topic.parasha] + parashah_topic.get_titles():
                parashah_name = parashah_topic.parasha
                sheet["heading"] = {
                    "en": "This Week's Torah Portion: " + parashah_name,
                    "he": "פרשת השבוע: " + hebrew_parasha_name(parashah_name)
                }
            else:  
                sheet["heading"] = {
                    "en": "Torah Reading For: " + todays_data["Parashah"],
                    "he": "קריאת התורה ל:" + todays_data["Parashah"]
                }

    if not parashah_topic and not sheet:
        return None

    return {
        "topic": parashah_topic.contents() if parashah_topic else None,
        "sheet": sheet
    }


def get_featured_item(data, date):
  todays_data = get_todays_data(data, date)
  if not todays_data or not (todays_data["Block Title"] and todays_data["Sheet URL"]):
    return None

  sheet = sheet_with_customization(todays_data)
  if not sheet:
    return None

  return {
    "heading": todays_data["Block Title"], # This is never actually used and is confusing here (since it also appears inside the sheet object below). 
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
  sheet = get_sheet(sheet_id)
  if "error" in sheet:
    return None

  sheet = sheet_to_dict(sheet)

  if len(data.get("Custom Title", "")):
    sheet["title"] = data["Custom Title"]

  if len(data.get("Custom Summary", "")):
    sheet["summary"] = data["Custom Summary"]

  if len(data.get("Custom Author", "")):
    sheet["ownerName"] = data["Custom Author"]


  if len(data.get("Block Title", "")):
    sheet["heading"] = {"en": data["Block Title"], "he": data["Block Title"]}

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
  sheets = [s for s in sheets if not has_hebrew(s["title"]) and s["summary"] and len(s["summary"]) > 140]
  return random.choice(sheets)


def get_featured_sheet_from_ref(ref):
  import random
  sheets = get_sheets_for_ref(ref)
  sheets = [s for s in sheets if not has_hebrew(s["title"]) and s["summary"] and len(s["summary"]) > 140]
  return random.choice(sheets)  


def translate_labels(label):
  LABEL_TRANSLATIONS = {
    "תאריך": "Date",
    "פרשה":  "Parashah",
    "קישור לדף המקורות": "Sheet URL",
    "כותרת מיוחדת": "Custom Title",
    "תקציר מיוחד": "Custom Summary",
    "מחבר מיוחד": "Custom Author",
    "מוכן לפרסום": "Ready",
    "כותרת נושא מיוחדת": "Custom About Title",
    "קישור לדף הנושא": "Topic URL",
    "תאריך לתצוגה":  "Displayed Date",
    "כותרת תיאור": "Description Title",
    "הפנייה": "Citation",
    "תיאור": "Description",
    "כותרת ראשית למקטע": "Block Title",
  }
  return LABEL_TRANSLATIONS.get(label, label)



### Helper function for populting spreadsheet ###

def print_parashah_rows(n=1000, lang="en"):
  """
  Helper for populating Community page Schedule spreadsheet.
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


def sheets_with_content_by_category(cat, print_results=True):
  """
  Returns or prints a list of public sheets that include ref within the category `cat`.
  `cat` may be either a string which is compared to each ref's `primary_category`,
  or a list of strings which must match exactly the ref's index's `categories`.
  """
  results = []
  sids = set()
  sheets = db.sheets.find({"status": "public"}, {"title": 1, "id": 1, "owner": 1, "includedRefs": 1, "status":1})
  for sheet in sheets:
    if sheet["owner"] == 101527:
      continue
    refs = []
    for ref in sheet["includedRefs"]:
      try:
        oRef = Ref(ref)
      except:
        continue
      if oRef.primary_category == cat or oRef.index.categories == cat:
        refs.append(ref)
        sids.add(sheet["id"])
    if len(refs):
      for ref in refs:
        title = strip_tags(sheet["title"], remove_new_lines=True).strip()
        results.append([sheet["id"], title, ref])
        if print_results:
          print("www.sefaria.org/sheets/{}\t{}\t{}".format(sheet["id"], title, ref))

  print("\n\n{} Sheet with {}".format(len(sids), cat))

  if not print_results:
    return results


def sheets_by_parashah(print_results=True):
  """
  Returns or prints a list of public sheets that include verses of Torah, aggregated and
  labeled by parashah.
  """
  sheets = sheets_with_content_by_category(["Tanakh", "Torah"], print_results=False)
  parshiot = TermSet({"scheme": "Parasha"})
  for p in parshiot:
    p.oRef = Ref(p.ref)

  def parashah_for_ref(ref):
    oRef = Ref(ref)
    for p in parshiot:
      if p.oRef.overlaps(oRef):
        return p
    print("No parashah found for {}".format(ref))
    return None

  for sheet in sheets:
    p = parashah_for_ref(sheet[2])
    if p:
      titles = [p.get_primary_title(), p.get_primary_title(lang="he")]
    else:
      titles = ["", ""]
    sheet.extend(titles)

  # Aggregate each row by parashah
  results_index = {} 
  for sheet in sheets:
    key = str(sheet[0]) + sheet[3]
    if key in results_index:
      results_index[key][4] += ", " + sheet[2] # add to list of citations
    else:
      results_index[key] = [sheet[3], sheet[4], sheet[0], sheet[1], sheet[2]]

  results = results_index.values()

  if print_results:
    for result in results:
      print("{}\t{}\twww.sefaria.org/sheets/{}\t{}\t{}".format(*result))
  else:
    return sheets