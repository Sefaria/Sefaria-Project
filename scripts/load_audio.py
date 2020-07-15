import os
from sefaria.model import *
from sefaria.system import exceptions

directory = '/home/tyastrab/Documents/GitHub/Sefaria-Project/tamars_work/jsons/'
for filename in os.listdir(directory):
    db.audio.save(filename) # saves a single record
