# -*- coding: utf-8 -*-
import django
django.setup()

import csv
import requests
from io import StringIO

from sefaria.model import *
from sefaria.system.database import db


url = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vR6TNzK9oshIl0J6ah6pfoGdsmGdoHQSuiyN6VoFsJeIJkaz2fGQFeL6hlaESJYMEAU0ntmfuveQoeK/pub?gid=1889171650&single=true&output=csv'
response = requests.get(url)
data = response.content.decode("utf-8")
cr = csv.reader(StringIO(data))

next(cr)
for l in cr:
  slug     = l[0].strip()
  enTitle  = l[1].strip()
  enDesc   = l[2].strip()
  heDesc   = l[3].strip()
  heTitle  = l[4].strip()
  parashah = l[5].strip()

  description = {
    "en": enDesc,
    "he": heDesc,
  }

  if slug:
    # If slug is present, just update descriptions
    t = Topic().load({"slug": slug})
    if not t:
      print("Unknown Topic: {}".format(slug))
      continue

    t.description = description
    t.save()

  else:
    # If no slug is present, add a new topic or update existing with parashah data
    parashah_topic = db.parshiot.find_one({"parasha": parashah})
    if not parashah_topic:
      print("Couldn't find parashah: {}".format(parashah))
      continue

    oRef = Ref(parashah_topic["ref"])
    ref = {
      "en": oRef.normal(),
      "he": oRef.he_normal(),
      "url": oRef.url(),
    }

    slug = Topic.normalize_slug(enTitle)
    topic = Topic.init(slug) or Topic({"slug": slug})
    topic.add_title(enTitle, "en", primary=True, replace_primary=True)
    topic.add_title(heTitle, "he", primary=True, replace_primary=True)
    topic.parasha = parashah
    topic.ref = ref
    topic.description = description
    topic.description_published = True
    topic.save()
