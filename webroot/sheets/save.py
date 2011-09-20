#!/usr/bin/python

import sys
sys.path.insert(0, "/home5/brettloc/lib/python/")
sys.path.insert(0, '/home5/brettloc/lib/python/pymongo-1.9-py2.4-linux-x86_64.egg')
sys.path.insert(0, '/home5/brettloc/lib/python/simplejson-2.0.9-py2.4-linux-x86_64.egg')
import pymongo
import cgi
import simplejson
from datetime import datetime

form = cgi.FieldStorage()
j = simplejson.loads(form["json"].value)


connection = pymongo.Connection()
db = connection.sefaria
sheets = db.sheets

j["dateModified"] = datetime.now().isoformat()


if not "id" in j:
	j["dateCreated"] = datetime.now().isoformat()
	lastId = sheets.find().sort([['id', -1]]).limit(1)
	if lastId.count():
		j["id"] = lastId.next()["id"] + 1
	else:
		j["id"] = 1
	

	
sheets.update({"id": j["id"]}, j, True, False)

print "Content-type: application/json\n\n"
print simplejson.dumps(j)

