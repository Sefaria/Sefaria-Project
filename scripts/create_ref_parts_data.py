import django
django.setup()

from sefaria.model import *

def create_non_unique_terms():
    NonUniqueTermSet().delete()
    bavli = NonUniqueTerm({
        "slug":"bavli",
        "titles": [{
            "text": "Bavli",
            "lang": "en",
            "primary": True
        },{
            "text": "בבלי",
            "lang": "he",
            "primary": True
        }]
    })
    bavli.save()

    minor_tractates = {title for title in library.get_indexes_in_category("Minor Tractates")}
    for index in library.get_indexes_in_category("Bavli", full_records=True):
        if index.title in minor_tractates: continue
        index_term = NonUniqueTerm({
            "slug": index.title,
            "titles": index.nodes.title_group.titles
        })
        index_term.save()
        index.nodes.ref_parts = [bavli.slug, index_term.slug]
        index.nodes.ref_parts_optional = [True, False]
        index.save()


if __name__ == "__main__":
    create_non_unique_terms()

"""
[
    [

    ],
    [
        "berakhot"
    ]
]
"""