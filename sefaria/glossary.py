"""
glossary.py - Handling custom dictionary / glossary / biography entries

Writes to MongoDB Collection: terms
"""
import string
from random import sample

import counts
from sefaria.utils import hebrew
from sefaria.model import *
from sefaria.system.database import db


db.terms.remove()
db.terms.ensure_index([("term", 1), ("lang", 1)], unique=True)
db.terms.ensure_index("term", unique=True)
db.terms.ensure_index("occurrences")


def count_terms(query={}, lang=None):
    #todo: move to object model.  Maybe.  What's this doing?
    """
    Counts all terms in texts matching query, lang
    Saves results to terms collection in db.
    """
    terms = {}
    bavli_names = db.index.find(query).distinct("title")
    query = {"title": {"$in": bavli_names}}
    refs = counts.generate_refs_list(query)  #library.ref_list() needs query argument
    lookup_lang = "he" if lang == "ar" else lang

    for ref in refs:
        print ref
        #text = texts.get_text(ref, commentary=False)
        text = TextFamily(Ref(ref), commentary=False).contents()
        for i, line in enumerate(text.get(lookup_lang, [])):
            # strip punctuation
            for c in string.punctuation:
                line = line.replace(c,"")
            these_terms = line.split(" ")
            for term in these_terms:
                line_ref = "%s:%d" % (ref, i+1)
                term = hebrew.strip_nikkud(term)
                if term in terms:
                    terms[term]["occurrences"] += 1
                    terms[term]["refs"].add(line_ref)
                else:
                    terms[term] = {
                        "term": term,
                        "occurrences": 1,
                        "language": lang,
                        "refs": set([line_ref])
                    }

    for term in terms:
        print term
        # only include up to 20 random ref samples
        sample_size = len(terms[term]["refs"]) if len(terms[term]["refs"]) < 20 else 20
        terms[term]["refs"] = list(sample(terms[term]["refs"], sample_size))
        db.terms.save(terms[term])


def count_bavli_terms():
    count_terms(query={"categories.1": "Bavli"}, lang="ar")