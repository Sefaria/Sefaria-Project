"""
Outputs a CSV of all links between Torah and Mishnah
with a Sefaria Link to the Mishnah
"""
torah = IndexSet({"categories": "Torah"}).distinct("title")
links = {}
for book in torah:
    links[book] = LinkSet({"$and": [{"refs": {"$regex": Ref(book).regex()}}, {"refs": {"$regex": "^Mishnah "}}]})
    for link in links[book]:
        if link.refs[0][0] == "M": 
            link.refs = [link.refs[1], link.refs[0]]
        url = "http://www.sefaria.org/%s" % link.refs[1].replace(" ", "_")
        print("%s\t%s\t%s" % (link.refs[0], link.refs[1], url))