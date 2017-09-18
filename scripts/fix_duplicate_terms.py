# -*- coding: utf-8 -*-

from sefaria.model import *
from bson.objectid import ObjectId

from sefaria.system.database import db

duplicates = db.term.aggregate(
    [
        {
            "$unwind": {
                "path": "$titles",
                "includeArrayIndex" : "arrayIndex",
                "preserveNullAndEmptyArrays" : False
            }
        },
        {
            "$unwind": {
                "path" : "$titles.text",
                "includeArrayIndex": "arrayIndex",
                "preserveNullAndEmptyArrays": False
            }
        },
        {
            "$project": {"_id": '$_id', "name":'$name', "text": '$titles.text', "lang": '$titles.lang', "scheme": '$scheme'}
        },
        {
            "$group": {"_id": '$text',
              "count": {"$sum": 1},
              "lang": {"$first": '$lang'},
              "ids": {"$addToSet": '$_id'},
              "names": {"$addToSet": '$name'},
              "schemes": {"$addToSet": '$scheme'}
            }
        },
        {
            "$project": {'duplicated_title': '$_id',
                      'primary_term_titles':'$names',
                      'unique_obj_ids': '$ids',
                      'count': '$count',
                      'lang': '$lang',
                      'schemes': '$schemes'}
        },
        {
            "$match": {"count" : {"$gt": 1} }
        },
    ]
)

primary_titles = {
        u'פרשה': 'Parasha',
        'Gra': 'Gra',
        u'רס"ג': 'Saadia Gaon',
        u'שער': 'Gate',
        u'פסוק': 'Verse',
        u'סעיף': 'Seif',
        u'גר"א': 'Gra',
        u'חלק': 'Section',
        'Rasag': 'Saadia Gaon',
        u'משנה': 'Mishnah',
        'Gate': 'Gate',
        u'הלכה': 'Halakhah',
        u'סדר טהרות': 'Seder Tahorot',
        u'תפילה': 'Liturgy',
        u'סעיף קטן': 'Seif Katan',
        u'מסכתות קטנות': 'Minor Tractates',
        u'מסכת': 'Tractate',
        u'ספר': 'Book',
        u'פסקה': 'Paragraph',
        u'פירוש': 'Comment',
        u'פרק': 'Chapter'
    }


def merge_terms_into_one(primary_term, other_terms):
    if isinstance(primary_term, Term):
        new_term = Term({
            "name": primary_term.name,
            "scheme": primary_term.scheme,
            "titles": [
                {
                    "lang": "en",
                    "text": primary_term.get_primary_title(),
                    "primary": True
                },
                {
                    "lang": "he",
                    "text": primary_term.get_primary_title('he'),
                    "primary": True
                }
            ]
        })
    else:
        new_term = Term({
            "name": primary_term["en"],
            "scheme": other_terms[0].scheme,
            "titles": [
                {
                    "lang": "en",
                    "text": primary_term["en"],
                    "primary": True
                },
                {
                    "lang": "he",
                    "text": primary_term["he"],
                    "primary": True
                }
            ]
        })
    for term in other_terms:
        titles = term.get_titles_object()
        for t in titles:
            new_term.add_title(t["text"], t["lang"]) #this step should eliminate duplicates.

        # print "Deleting Term {}".format(term.get_primary_title())
        term.delete()

    # print "Saving Term {}".format(new_term.get_primary_title())
    new_term.save()




old_ids_to_new_hash = {}
for i, dup in enumerate(duplicates['result'],1):
    if dup['duplicated_title'] in primary_titles:
        primary_term = Term().load({'name': primary_titles[dup['duplicated_title']]})
        if not primary_term: #one case where we want an entirely new primary.
            primary_term = {'en': primary_titles[dup['duplicated_title']], 'he': dup['duplicated_title']}
    else:
        primary_term = Term().load_by_id(ObjectId(dup['unique_obj_ids'][0]))

    terms_to_merge = [Term().load_by_id(toid) for toid in dup['unique_obj_ids']] #this will also include the primary
    terms_to_merge = [t for t in terms_to_merge if t is not None]
    # print u"Merging terms for {}".format(dup['duplicated_title'])
    if primary_term is not None and len(terms_to_merge) > 0: #might have been merged in already.
        merge_terms_into_one(primary_term, terms_to_merge)
    #if len(dup['schemes']) > 1:
        # print "This term had multiple schemes: {}".format(dup["schemes"])
    # print "{})====================================================".format(i)


def get_new_primary_term(title):
    sterm = Term().load({'name': title})
    if not sterm:
        sterm = Term().load_by_title(title)
    return sterm.get_primary_title() if sterm else title



cats = db.category.find({})
for cat in cats:
    if "sharedTitle" in cat and cat['sharedTitle'] is not None:
        new_shared_title = get_new_primary_term(cat['sharedTitle'])
        if new_shared_title != cat['sharedTitle']:
            # print "normalizing category with shared title {} to {}".format(cat['sharedTitle'], new_shared_title)
            cat['sharedTitle'] = new_shared_title
            cat['lastPath'] = new_shared_title
            cat['path'][-1] = new_shared_title

    for i, cpath in enumerate(cat['path']):
        cat['path'][i] = get_new_primary_term(cpath)

    db.category.save(cat, w=1)



idxs = IndexSet()
for idx in idxs:
    for i, cpath in enumerate(idx.categories):
        idx.categories[i] = get_new_primary_term(cpath)
    if getattr(idx, "collective_title", None):
        idx.collective_title = get_new_primary_term(idx.collective_title)

    leaf_nodes = idx.nodes.get_leaf_nodes()
    for leaf in leaf_nodes:
        if getattr(leaf, "sectionNames", None):
            for j, section in enumerate(leaf.sectionNames):
                new_section = get_new_primary_term(section)
                if new_section != section:
                    leaf.sectionNames[j]=new_section
                    #print u"Changed Index {}:{}:{} to {}".format(idx.title, leaf.primary_title(), section, new_section)
    idx.save(override_dependencies=True)


library.rebuild(include_toc=True)





