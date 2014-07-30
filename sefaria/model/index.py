"""
index.py

Writes to MongoDB Collection: index
"""

import sefaria.model.abstract as abst


class Index(abst.AbstractMongoRecord):
    collection = 'index'
    tracked = True
    history_noun = 'index'
    criteria_field = 'title'

    required_attrs = [
        "title",
        "titleVariants",
        "categories",
        "sectionNames"
    ]
    optional_attrs = [
        "heTitle",
        "heVariants",
        "maps",
        "order",
        "length",
        "lengths",
        "transliteratedTitle",
        "maps"
    ]

    def save(self):
        self.normalize()
        #...
        super(Index, self).save()

    def normalize(self):
        self.title = self.title[0].upper() + self.title[1:]
        if getattr(self, "titleVariants", None):
            variants = [v[0].upper() + v[1:] for v in self.titleVariants]
        self.titleVariants = variants

    def validate(self, attrs=None):
        val = super(Index, self).validate(attrs)
        if "error" in val:
            return val

        # Keys that should be non empty lists
        for key in ("categories", "sectionNames"):
            if not isinstance(getattr(self, key), list) or len(getattr(self, key)) == 0:
                return {"error": "%s field must be a non empty list of strings." % key}

        # Disallow special characters in text titles
        if any((c in '.-\\/') for c in self.title):
            return {"error": "Text title may not contain periods, hyphens or slashes."}

        # Disallow special character in categories
        for cat in self.categories:
            if any((c in '.-') for c in cat):
                return {"error": "Categories may not contain periods or hyphens."}

        # Disallow special character in sectionNames
        for cat in self.sectionNames:
            if any((c in '.-\\/') for c in cat):
                return {"error": "Text Structure names may not contain periods, hyphens or slashes."}

        # Make sure all title variants are unique
        for variant in self.titleVariants:
            existing = Index().load_by_query({"titleVariants": variant})
            if existing and existing.title != self.title:
                if not getattr(self, "oldTitle", None) or existing.title != self.oldTitle:
                    return {"error": 'A text called "%s" already exists.' % variant}

        return {"ok": 1}


class IndexSet(abst.AbstractMongoSet):
    recordClass = Index