# -*- coding: utf-8 -*-

from sefaria.model import *
from sefaria.helper.text import *
from sefaria.helper.link import *
import re

"""
normal Index delete takes care of:

deleting the VersionState of the index record
theoretically deleting all links
deleting the direct versions of text

we need to add:

delete history of versions
delete history of commentary versions
delete commentary versions
delete links history
delete version states of the commntaries
"""



idx_title = 'Pesach Haggadah'

print "loading up objects for {}".format(idx_title)

indx = Index().load({'title': idx_title})
vs = VersionSet({'title': idx_title})

commentaries = library.get_commentary_versions_on_book(idx_title)

#delete History - for versions and commentary versions
commentators = library.get_commentator_titles()
pattern = ur"(^{} \d)|(^({}) on {} \d)".format(idx_title, "|".join(commentators), idx_title)

print "deleting history for {}".format(idx_title)
HistorySet({"ref": {"$regex": pattern}}).delete()

print "deleting link history for {}".format(idx_title)
HistorySet({"new.refs": {"$regex": pattern}})

print "deleting version states for {}".format(idx_title)
VersionStateSet({"title": {"$regex": ur"(^{})|(^({}) on {})".format(idx_title, "|".join(commentators), idx_title)}}).delete()
print "deleting translation requests for {}".format(idx_title)
TranslationRequestSet({'ref': {"$regex": ur"(^{})|(^({}) on {})".format(idx_title, "|".join(commentators), idx_title)}}).delete()


print "deleting commentaries for {}".format(idx_title)
commentaries.delete()
print "deleting versions of {}".format(idx_title)
vs.delete()
print "deleting {}".format(idx_title)
indx.delete()

print "loading up temporary index for rename"
new_indx = Index().load({'title' : 'Complex Pesach Haggadah'})
print "renaming and saving"
new_indx.title = 'Pesach Haggadah'
new_indx.save()


#manually rename history and links, since the dependencies don't work.
from sefaria.system.database import db
print "manually renaming  links and history"
ls = db.links.find({"refs":{"$regex":"^Complex Pesach Haggadah"}})
print ls.count()
for l in ls:
    print "...".join(l["refs"])
    l["refs"] = [r.replace("Complex ","") for r in l["refs"]]
    print "...".join(l["refs"])
    db.links.save(l)

hs = db.history.find({"ref":{"$regex":"^Complex Pesach Haggadah"}})
for h in hs:
    print h["ref"]
    h["ref"] = h["ref"].replace("Complex ", "")
    print h["ref"]
    db.history.save(h)

hs = db.history.find({"new.refs":{"$regex":"^Complex Pesach Haggadah"}})
for h in hs:
    print "...".join(h["new"]["refs"])
    h["new"]["refs"] = [r.replace("Complex ", "") for r in h["new"]["refs"]]
    print "...".join(h["new"]["refs"])
    db.history.save(h)





#delete versionstates for the comemntaries?


