from sefaria.texts import *

versions = db.texts.find({"title": "Pele Yoetz"}).distinct("versionTitle")
v1 = versions[0]
merge_multiple_text_versions(versions, "Pele Yoetz", "he")
update_version_title(v1, "Torat Emet", "Pele Yoetz", "he")