from sefaria.model import *

links = LinkSet({"type": {"$in": ["Maharsha in Talmud", "Rif in Talmud", "Rosh in Talmud"]}})
links.update({"type": "commentary"}).save()