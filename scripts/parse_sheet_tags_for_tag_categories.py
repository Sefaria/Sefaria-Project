# -*- coding: utf-8 -*-
import csv
import django
django.setup()


from sefaria import model
from sefaria.system.database import db

cfile = "./data/private/sheet_tags_over_10.csv"


missing_terms = []
conflicting_terms = []

with open(cfile, 'rb') as tfile:
    tags = csv.reader(tfile)
    tags.next()
    for row in tags:
        (parent_tag, tag, count, tag_category) = row

        # ignore tags if they're only from a single user...
        query = {"$or": [{"tags": tag}, {"tags": parent_tag}]} if parent_tag != "" else {"tags": tag}
        owner_count = len(db.sheets.find(query).distinct("owner"))
        if owner_count < 4:
            continue





        term = model.Term()
        #case 1 - tag and parent tag both not in terms: add to list to be dealt with by content team
        if not term.load_by_title(tag) and not term.load_by_title(parent_tag):
            missing_terms.append(tag.decode('utf-8'))

        #case 2: no parent tag, but tag exists as term:
        elif not term.load_by_title(parent_tag) and term.load_by_title(tag):
            term_to_edit = term.load_by_title(tag)
            term_to_edit.category = tag_category
            term_to_edit.save()

        #case 3: parent tag exists as term, but tag does not :
        elif term.load_by_title(parent_tag) and not term.load_by_title(tag):
            term_to_edit = term.load_by_title(parent_tag)
            term_to_edit.category = tag_category
            term_to_edit.add_title(tag, "en")
            term_to_edit.save()

        #case 4: parent tag exists as term, and tag also does:
        if term.load_by_title(parent_tag) and term.load_by_title(tag):
            parent_tag_term = term.load_by_title(parent_tag)
            tag_term = term.load_by_title(tag)

            if tag_term == parent_tag_term:
                parent_tag_term.category = tag_category
                parent_tag_term.save()

            else:
                conflicting_terms.append((parent_tag, tag, parent_tag_term.get_primary_title(), tag_term.get_primary_title()))





print missing_terms
print conflicting_terms
