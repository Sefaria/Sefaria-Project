# -*- coding: utf-8 -*-

from sefaria.model import *
from sefaria.system.database import db



def make_explicit_commentary_index(title):
    idx = library.get_index(title)
    if not isinstance(idx, CommentaryIndex):
        print "{} is not an old style commentary".format(idx.title)
    other_categories = [c for c in idx.b_index.categories if c not in idx.categories]
    new_idx = {
        'title': idx.title,
        'categories': [idx.categories[1], idx.categories[0]] + idx.categories[2:],  # the same as the display order
        'schema': idx.schema,
        'dependence' : 'commentary',
        'authors' : getattr(idx, "authors", None),
        'base_text_titles': [idx.commentaryBook],
        'work_title': idx.commentator,
        'auto_linking_scheme': 'commentary_increment_base_text_depth',
        'related_categories': other_categories
    }

    Index(new_idx).save()
    return idx.c_index.title

def del_old_commentator(index):
    #delete commentator index record
    getattr(db, 'index').remove({"_id": index._id})

"""GET THE TITLES, replicates logic from library.get_commentary_version_titles() due to be refactored """
commentator_titles  = IndexSet({"categories.0": "Commentary"}).distinct('title')
commentary_re = ur"^({}) on ".format("|".join(commentator_titles))
query = {"title": {"$regex": commentary_re}}
titles = VersionSet(query).distinct("title")
""" ---- """


#titles = library.get_commentary_version_titles()
num_old_commentary_titles = len(titles)
commentators = set(library.get_commentator_titles())
commentators_with_text = []

#make_explicit_commentary_index('Rabbeinu Gershom on Makkot')

print "Converting CommentaryIndex records to Index records."
for c in titles:
    print c
    commentator = make_explicit_commentary_index(c)
    commentators_with_text.append(commentator)

print "Done converting."
print "The following commentators have no text in the system: {}.".format(commentators.difference(commentators_with_text))

malformed_commentators = []
for comm_title in commentators:
    if ' on ' in comm_title:
        malformed_commentators.append(comm_title)
    # not using library.get_index() because it trips up on the malformed titles with 'on' in them
    idx = Index().load({'title': comm_title})
    del_old_commentator(idx)

print "The following were bad commentator names: {}".format(malformed_commentators)

new_indices = IndexSet({'dependence' : {'$exists': True}})

assert new_indices.count() == num_old_commentary_titles
