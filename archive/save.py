#!/usr/bin/python

import sys
import pymongo
import cgi
import simplejson
from datetime import datetime

form = cgi.FieldStorage()
j = simplejson.loads(form["json"].value)


connection = pymongo.Connection()
db = connection.sefaria
commentary = db.commentary

j["dateModified"] = datetime.now().isoformat()
j["dateCreated"] = datetime.now().isoformat()

#source
if "ref" in j:
	refSplit = j["ref"].split(":")
	j["refVerse"] = refSplit[1]	 
	j["ref"] = refSplit[0].replace(" ", ".")
	
	if not "id" in j:
		
		lastId = commentary.find().sort([['id', -1]]).limit(1)
		if lastId.count():
			j["id"] = lastId.next()["id"] + 1
		else:
			j["id"] = 1
		
	commentary.update({"id": j["id"]}, j, True, False)



