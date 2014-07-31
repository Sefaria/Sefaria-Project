"""
index.py

Writes to MongoDB Collection: index
"""

from sefaria.model import abstract

# all of the below needed for cascade of title change.  Likely needs refactor
from sefaria.model import text, link, note, history, count


class Index(abstract.AbstractMongoRecord):
    collection = 'index'
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

    def _normalize(self):
        self.title = self.title[0].upper() + self.title[1:]
        if getattr(self, "titleVariants", None):
            variants = [v[0].upper() + v[1:] for v in self.titleVariants]
            self.titleVariants = variants

        # Ensure primary title is listed among title variants
        if self.title not in self.titleVariants:
            self.titleVariants.append(self.title)

        if getattr(self, "heTitle", None) is None:
            if getattr(self, "heTitleVariants", None) is None:
                self.heTitleVariants = [self.heTitle]
            elif self.heTitle not in self.titleVariants:
                self.heTitleVariants.append(self.heTitle)

    def _validate(self, attrs=None):
        val = super(Index, self)._validate(attrs)
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


class IndexSet(abstract.AbstractMongoSet):
    recordClass = Index

'''
def update_text_title(old, new):
	"""
	Update all dependant documents when a text's primary title changes, inclduing:
		* titles on index documents (if not updated already)
		* titles of stored text versions
		* refs stored in links
		* refs stored in history
		* refs stores in notes
		* titles stored on text counts
		* titles in text summaries  - TODO
		* titles in top text counts
		* reset indices and parsed cache
	"""
	index = get_index(old)
	if "error" in index:
		return index

	# Special case if old is a Commentator name
	if index["categories"][0] == "Commentary" and "commentaryBook" not in index:
		commentary_text_titles = get_commentary_texts_list()
		old_titles = [title for title in commentary_text_titles if title.find(old) == 0]
		old_new = [(title, title.replace(old, new, 1)) for title in old_titles]
		for pair in old_new:
			update_text_title(pair[0], pair[1])

	update_title_in_index(old, new)
	update_title_in_texts(old, new)
	update_title_in_links(old, new)
	update_title_in_notes(old, new)
	update_title_in_history(old, new)
	update_title_in_counts(old, new)

	global indices, parsed
	indices = {}
	parsed = {}


def update_title_in_index(old, new):
	i = db.index.find_one({"title": old})
	if i:
		i["title"] = new
		i["titleVariants"].remove(old)
		i["titleVariants"].append(new)
		db.index.save(i)


def update_title_in_texts(old, new):
	versions = db.texts.find({"title": old})
	for v in versions:
		v["title"] = new
		db.texts.save(v)


def update_title_in_links(old, new):
	"""
	Update all stored links to reflect text title change.
	"""
	pattern = r'^%s(?= \d)' % re.escape(old)
	links = db.links.find({"refs": {"$regex": pattern}})
	for l in links:
		l["refs"] = [re.sub(pattern, new, r) for r in l["refs"]]
		db.links.save(l)


def update_title_in_history(old, new):
	"""
	Update all history entries which reference 'old' to 'new'.
	"""
	pattern = r'^%s(?= \d)' % re.escape(old)
	text_hist = db.history.find({"ref": {"$regex": pattern}})
	for h in text_hist:
		h["ref"] = re.sub(pattern, new, h["ref"])
		db.history.save(h)

	db.history.update({"title": old}, {"$set": {"title": new}}, upsert=False, multi=True)

	link_hist = db.history.find({"new": {"refs": {"$regex": pattern}}})
	for h in link_hist:
		h["new"]["refs"] = [re.sub(pattern, new, r) for r in h["new"]["refs"]]
		db.history.save(h)


def update_title_in_notes(old, new):
	"""
	Update all stored links to reflect text title change.
	"""
	pattern = r'^%s(?= \d)' % old
	notes = db.notes.find({"ref": {"$regex": pattern}})
	for n in notes:
		n["ref"] = re.sub(pattern, new, n["ref"])
		db.notes.save(n)


def update_title_in_counts(old, new):
	c = db.counts.find_one({"title": old})
	if c:
		c["title"] = new
		db.counts.save(c)
'''