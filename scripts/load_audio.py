import os
from sefaria.model import *
from sefaria.system import exceptions

directory = 'C:/Users/Tamar Yastrab/Documents/Github/Sefaria-Project/tamars_work/jsons'
for filename in os.listdir(directory):
    db.audio.save(filename) # saves a single record
