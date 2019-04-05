# encoding=utf-8
import django
django.setup()

from sefaria.model import *
from sefaria.system.database import db

ids = [54292,33762,11801,23770,4389,25573,27136,17753,72035,29587,9263,9485,3525,12593,2127,56061,10083,6064,21361,10254,26714,21360,23627,4319,53948,2372,1769,26838,50133,7326,1928,12557,18604,8670,480,2222,93763,41979,8430]
db.sheets.update_many({"id": {"$in": ids}}, {"$set": {"is_featured": True}})
