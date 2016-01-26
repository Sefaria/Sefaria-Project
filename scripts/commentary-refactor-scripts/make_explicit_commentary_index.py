# -*- coding: utf-8 -*-

import argparse
import json

from sefaria.model import *
from sefaria.system.database import db



def make_explicit_commentary_index(title, del_commentator=True):
    idx = library.get_index(title)
    if not isinstance(idx, CommentaryIndex):
        print "{} is not an old style commentary".format(idx.title)

    new_idx = {
        'title' : idx.title,
        'categories' : ['Commentary2'] + idx.categories[1:],
        'schema' : idx.schema
    }

    if del_commentator:
        #delete commentator index record
        getattr(db, 'index').remove({"_id": idx.c_index._id})

    #save new explicit one
    Index(new_idx).save()


make_explicit_commentary_index('Shita Mekubetzet on Berakhot')
