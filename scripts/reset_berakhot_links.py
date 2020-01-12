from sefaria.model import *
from helper.link import add_links_from_text
from sefaria.system.database import db
from sefaria.utils.talmud import section_to_daf

# Find links that were generated from a Berakhot text
oids = db.texts.find({"title": "Berakhot"}).distinct("_id")
tanakh_links = LinkSet({"source_text_oid": {"$in": oids}})

tanakh_links.delete()

berakhot = Version().load({"title": "Berakhot", "versionTitle": "Wikisource Talmud Bavli"})

for i in range(len(berakhot.chapter)):
    ref = "Berakhot %s" % section_to_daf(i+1)
    print("Scanning %s" % ref)
    add_links_from_text(ref, berakhot.language, berakhot.chapter[i], berakhot._id, 1)