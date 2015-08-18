from sefaria.system.database import db

ls = db.links.find({"refs":{"$regex":"Yodea"}})
print ls.count()
for l in ls:
    print "...".join(l["refs"])
    l["refs"] = [r.replace("?","") for r in l["refs"]]
    print "...".join(l["refs"])
    db.links.save(l)

hs = db.history.find({"ref":{"$regex":"Yodea"}})
for h in hs:
    print h["ref"]
    h["ref"] = h["ref"].replace("?", "")
    print h["ref"]
    db.history.save(h)

hs = db.history.find({"new.refs":{"$regex":"Yodea"}})
for h in hs:
    print "...".join(h["new"]["refs"])
    h["new"]["refs"] = [r.replace("?", "") for r in h["new"]["refs"]]
    print "...".join(h["new"]["refs"])
    db.history.save(h)
