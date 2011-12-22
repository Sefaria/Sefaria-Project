# -*- coding: utf-8 -*-
#!/usr/bin/python2.6

import sys
import pymongo
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
from config import *
from datetime import datetime

connection = pymongo.Connection()
db = connection[SEFARIA_DB]


def migrateRashi():
	cur = db.commentary.find({"commentator": "Rashi"}).sort([["_id", 1]])
	
	counts = {}
	
	for c in cur:
		ref = c["ref"] + "." + c["refVerse"]
		if ref in counts:
			counts[ref] += 1
		else:
			counts[ref] = 1
			
		ref = "%s on %s.%d" % (c["commentator"],ref, counts[ref])
		
		text = {}
		
		text["versionTitle"] = c["source"]
		text["text"] = c["text"]
		text["language"] = "en"
		
		saveText(ref, text)
		
def rashiLinks():
	cur = db.commentary.find({"commentator": "Rashi"}).sort([["_id", 1]])
	
	counts = {}
	
	for c in cur:
		ref = c["ref"] + "." + c["refVerse"]
		if ref in counts:
			counts[ref] += 1
		else:
			counts[ref] = 1
			
		cRef = "%s on %s.%d" % (c["commentator"],ref, counts[ref])
		
		link ={}
		
		link["anchorText"] = c["anchorText"]
		link["type"] = "commentary"
		link["refs"] = [ref, cRef] 
		
		db.links.save(link)