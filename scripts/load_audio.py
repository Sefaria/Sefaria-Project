import django
django.setup()
import os
import json
from sefaria.model import *
from sefaria.system import exceptions
from sefaria.system.database import db

directory = '/home/tyastrab/Documents/GitHub/Sefaria-Project/tamars_work/jsons/'
for filename in os.listdir(directory):
    with open(directory + filename) as json_file:
        data = json.load(json_file)
        db.audio.save(data) # saves a single record
