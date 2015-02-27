from sefaria.model import *

coms = ("Rashi", "Tosafot")
tractates = ("Sanhedrin", "Bava Batra", "Menachot", "Arakhin", "Keritot")

for c in coms:
    for t in tractates:
        title = "%s on %s" % (c, t)
        VersionSet({"title": title}).delete()
        LinkSet(Ref(title)).delete()