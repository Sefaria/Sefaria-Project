"""Look for places where dates have been stored in Mongo as ISO strings, replace them with Date objects."""

import os
import sys

from dateutil import parser
from sefaria.texts import *

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

history = db.history.find()

for act in history:
    if isinstance(act["date"], str):
        act["date"] = parser.parse(act["date"])
        db.history.save(act)
