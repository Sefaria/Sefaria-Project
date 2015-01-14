from sefaria.texts import *
from sefaria.model import *

"""
merge_text_versions_by_language("Aruch HaShulchan", "he", warn=True)
merge_text_versions("Wikisource", "WikiSource", "Aruch HaShulchan", "en", warn=True)

merge_text_versions_by_source("Bereishit Rabbah", "he", warn=True)
merge_text_versions_by_source("Bereishit Rabbah", "en", warn=True)
merge_text_versions("Wikisource Bereshit Rabbah", "wikisource", "Bereishit Rabbah", "he", warn=True)

merge_text_versions_by_source("Mishnah Berurah", "he", warn=True)
merge_multiple_text_versions(["Hilchos Krias Shemah and Tefillos Maariv", "Mishnah Berurah: Siman 494", "Hilchos Shabbos #1", " Mishnah Berurah 494 Tfilot on Shavuot", "Mishnah Berurah 494 Tfilot on Shavuot"], "Mishnah Berurah", "he", warn=True)
update_version_title("Hilchos Krias Shemah and Tefillos Maariv", "Mishnah Berurah from OnYourWay", "Mishnah Berurah", "he")
merge_text_versions("eu5 text", "Halachos for Donning Clothing", "Mishnah Berurah", "he", warn=True)
merge_text_versions("Wikitext", "Wiki text", "Mishnah Berurah", "he", warn=True)
"""

#An example of the new way of updating version title
merge_text_versions_by_language("Ein Yaakov", "he", warn=True)
version = Version().load({"title": "Ein Yaakov", "language": "he"})
version.versionTitle = "Vilna, 1922"
version.save()


merge_text_versions_by_language("Messilat Yesharim", "he", warn=True)
old_version = VersionSet({"title": "Messilat Yesharim", "language": "he"}).distinct("versionTitle")[0]
update_version_title(old_version, "Shechem Messilat Yesharim", "Messilat Yesharim", "he")
v = Version().load({"title": "Messilat Yesharim", "language": "he"})
v.versionSource = "http://www.shechem.org/torah/mesyesh/hindex.htm"
v.save()

merge_text_versions_by_language("Shaarei Teshuvah", "he", warn=True)
old_version = VersionSet({"title": "Shaarei Teshuvah", "language": "he"}).distinct("versionTitle")[0]
update_version_title(old_version, "Torat Emet", "Shaarei Teshuvah", "he")