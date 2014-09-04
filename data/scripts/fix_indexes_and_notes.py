import sefaria.model as model
from sefaria.system.database import db

# Remove duplicate 'Sefer Abudraham'

db.index.remove({"title": "Sefer Abudraham "})
db.index.remove({"title": "Tiferet Yisrael "})
db.index.remove({"title": "Igrot Moshe "})

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
