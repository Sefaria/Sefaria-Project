# Look for places where dates have been stored in Mongo as ISO strings, replace them with Date objects.

import dateutil.parser
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sefaria.texts import *

history = db.history.find()

for act in history:
	if isinstance(act["date"], str):
		act["date"] = dateutil.parser.parse(act["date"])
		db.history.save(act)

