from sefaria.model import *

links = LinkSet({"type": {"$in": ["Maharsha in Talmud", "Rif in Talmud", "Rosh in Talmud", "Commentary"]}})
links.update({"type": "commentary"})