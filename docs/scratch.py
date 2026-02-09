import django

django.setup()

from sefaria.model import *

from sefaria.system.database import db
collection = db.notifications

unique_types = collection.distinct("type")

print(unique_types)