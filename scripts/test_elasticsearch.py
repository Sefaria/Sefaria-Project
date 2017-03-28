from sefaria.model import *
from sefaria import search

def version_title_change():
    i = library.get_index("Genesis")
    v  = i.versionSet().array()[8]
    v.versionTitle = 'The Noah chumash'
    v.save()


version_title_change()