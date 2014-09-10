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
    db.links.remove({"refs": False})
    db.history.remove({"new.refs": False})
    db.history.find({"new.refs": False})


def remove_old_counts():
    """
    Deletes counts documents which no longer correspond to a text or category.
    """
    counts = model.CountSet()
    for count in counts:
        if getattr(count, "title", None):
            try:
                model.Ref(count["title"])
            except BookNameError:
                print u"Old text %s".format(count.title)
                count.delete()
        else:
            #TODO incomplete
            continue
            categories = count.categories
            i = model.IndexSet({"$and": [{'categories.0': categories[0]}, {"categories": {"$all": categories}}, {"categories": {"$size": len(categories)}} ]})
            if not i.count():
                print "Old category %s" % " > ".join(categories)