# -*- coding: utf-8 -*-

from sefaria.model import *
from sefaria.helper.text import *
from sefaria.helper.link import *
import re

import argparse
from sefaria.system.database import db

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


def remove_old_index_and_rename(idx_title):

    print(idx_title)

    temp_title = 'Complex {}'.format(idx_title)

    print("loading up objects for {}".format(idx_title))

    indx = Index().load({'title': idx_title})
    #since Index validation prevents having duplicate titles in the system, we can pnly copy the alternate titles after the old index is removed
    old_title_variants = [x for x in indx.nodes.get_titles_object() if 'primary' not in x or x['primary'] is False]
    old_he_primary = indx.get_title('he')

    vs = VersionSet({'title': idx_title})


    pattern = Ref(idx_title).regex(anchored=True)

    print("deleting history for {}".format(idx_title))
    HistorySet({"ref": {"$regex": pattern}}).delete()

    print("deleting link history for {}".format(idx_title))
    HistorySet({"new.refs": {"$regex": pattern}})

    print("deleting version states for {}".format(idx_title))
    VersionStateSet({"title": idx_title}).delete()

    print("deleting versions of {}".format(idx_title))
    vs.delete()
    print("deleting {}".format(idx_title))

    indx.delete()

    print("loading up temporary index for rename")
    new_indx = Index().load({'title' : temp_title})
    print("renaming and saving")
    new_indx.title = idx_title
    new_indx.set_title(old_he_primary, 'he')
    for title in old_title_variants:
        new_indx.nodes.add_title(title['text'], title['lang'])
    new_indx.save()


    #manually rename history and links, since the dependencies don't work.
    temp_title = re.escape(temp_title)
    print("manually renaming  links and history")
    ls = db.links.find({"refs":{"$regex":"^{}".format(temp_title)}})
    print(ls.count())
    for l in ls:
        print("...".join(l["refs"]))
        l["refs"] = [r.replace("Complex ","") for r in l["refs"]]
        print("...".join(l["refs"]))
        db.links.save(l)

    hs = db.history.find({"ref":{"$regex":"^{}".format(temp_title)}})
    for h in hs:
        print(h["ref"])
        h["ref"] = h["ref"].replace("Complex ", "")
        print(h["ref"])
        db.history.save(h)

    hs = db.history.find({"new.refs":{"$regex":"^{}".format(temp_title)}})
    for h in hs:
        print("...".join(h["new"]["refs"]))
        h["new"]["refs"] = [r.replace("Complex ", "") for r in h["new"]["refs"]]
        print("...".join(h["new"]["refs"]))
        db.history.save(h)





#delete versionstates for the comemntaries?


""" The main function, runs when called from the CLI"""
if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument("title", help="title of existing index record")
    args = parser.parse_args()
    print(args)
    remove_old_index_and_rename(args.title)
    #print json.dumps(schema)
    #print new_mappings