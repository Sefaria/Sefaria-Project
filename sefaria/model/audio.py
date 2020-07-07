#import django  # required to have the script run in command line w/ Sefaria settings
#django.setup() # same as above

#from sefaria.system.database import db # does all the heavy lifting of connecting to the db
#audio_collection = db["audio"] # creates the audio collection


#for record in audio_json:
    #db.audio.save(record) # saves a single record
    
"""
note.py
Writes to MongoDB Collection: notes
"""

import regex as re
import os


from . import abstract as abst
from sefaria.model.text import Ref

import logging
logger = logging.getLogger(__name__)


class Audio(abst.AbstractMongoRecord):
    """
    Audio for sidebar connection pannel.  May be public or private.
    """
    audio_collection = db["audio"] # creates the audio collection
    history_noun  = 'audio'
    ALLOWED_TAGS  = ("i", "b", "br", "u", "strong", "em", "big", "small", "span", "div", "img", "a")
    ALLOWED_ATTRS = {
                        'audio': ['controls', 'src'] # this could have more tags within controls?
                    }

    def _normalize(self):
        self.ref = Ref(self.ref).normal()


class AudioSet(abst.AbstractMongoSet):
    recordClass = Note


directory = 'C:/Users/Tamar Yastrab/Documents/Github/Sefaria-Project/tamars_work/jsons'
for filename in os.listdir(directory):
    db.audio.save(filename) # saves a single record
