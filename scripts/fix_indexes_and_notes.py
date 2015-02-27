import sefaria.model as model
from sefaria.system.database import db
from sefaria.clean import remove_old_counts

# Remove duplicate 'Sefer Abudraham'

db.index.remove({"title": "Sefer Abudraham "})
db.index.remove({"title": "Tiferet Yisrael "})
db.index.remove({"title": "Igrot Moshe "})
db.index.remove({"title": "The Sabbath, Heschel  "})
db.index.remove({"title": "Sifre Devarim "})

remove_old_counts()

texts = model.IndexSet({})
for t in texts:
    if t.title != t.title.strip():
        t.title = t.title.strip()
        t.save()

ns = model.NoteSet({"public": {"$exists": False}})
for n in ns:
    if not getattr(n, "owner", None):
        n.owner = 1

ns.update({"public": False})


# Remove "sectionCounts" field form sectionCounts
db.counts.update({}, {"$unset": {"sectionCounts": ""}}, multi=True)

# Rebuild counts docs, so they get the allVersionCounts field
model.refresh_all_states()