import sefaria.model as model

ns = model.NoteSet({"public":{"$exists":False}})
for n in ns:
	if not getattr(n,"owner",None):
		n.owner = 1

ns.update({"public":False})
