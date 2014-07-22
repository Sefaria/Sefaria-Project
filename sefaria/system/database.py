"""
database.py -- connection to MongoDB
"""

from sefaria.settings import *
import pymongo

connection = pymongo.Connection(MONGO_HOST)
db = connection[SEFARIA_DB]
if SEFARIA_DB_USER and SEFARIA_DB_PASSWORD:
	db.authenticate(SEFARIA_DB_USER, SEFARIA_DB_PASSWORD)
