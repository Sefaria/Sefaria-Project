"""
Small utilities for fixing problems that occur in the DB.
"""

from sefaria.system.database import db

import sefaria.model as model
from sefaria.system.exceptions import BookNameError


def remove_refs_with_false():
    """
    Removes any links and history records about links that contain False
    as one of the refs.
    """
    model.LinkSet({"refs": False}).delete()
    model.HistorySet({"new.refs": False}).delete()
    #db.links.remove({"refs": False})
    #db.history.remove({"new.refs": False})
    #db.history.find({"new.refs": False})


def remove_old_counts():
    """
    Deletes counts documents which no longer correspond to a text or category.
    """
    # counts = model.CountSet()
    # If there are counts documents save in the DB with invalid titles,
    # instantiation of the Count will cause a BookNameError.
    # But in this code instantiation happens in the line 'for count in counts'
    # How do we catch that? Additionally, we need access to the bad title after
    # The error has occurred. How would we get that? Reverting to direct DB call for now.
    counts = db.counts.find()
    for count in counts:
        if count.get("title", None):
            try:
                model.get_index(count["title"])
            except BookNameError:
                print u"Old count: %s" % count["title"]
                #count.delete()
                db.counts.remove({"_id": count["_id"]})
        else:
            #TODO incomplete for Category Counts. 
            continue
            categories = count.categories
            i = model.IndexSet({"$and": [{'categories.0': categories[0]}, {"categories": {"$all": categories}}, {"categories": {"$size": len(categories)}} ]})
            if not i.count():
                print "Old category %s" % " > ".join(categories)