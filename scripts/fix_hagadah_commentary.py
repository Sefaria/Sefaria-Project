from sefaria.model import *
from sefaria.helper.text import *
from sefaria.helper.link import *

# Kos Shel Eliyahu######
#two Versions. different parts of the content each. correct the title of the worng one and make the version title different so it can be merged.
kos_version = Version().load({"versionTitle": "Rabbi Mark Greenspan", "title": "Kos Shel Eliyahu on Haggadah", "language": "en"})
kos_version.title = "Kos Shel Eliyahu on Pesach Haggadah"
kos_version.versionTitle = kos_version.versionTitle + " B"
kos_version.save()
merge_text_versions("Rabbi Mark Greenspan", "Rabbi Mark Greenspan B", "Kos Shel Eliyahu on Pesach Haggadah", "en")
#old_links = LinkSet({'refs.0': {'$regex': '^Pesach Haggadah'}, 'refs.1': {'$regex': '^Kos Shel Eliyahu on Haggadah'}})
#redo the links
rebuild_commentary_links("Kos Shel Eliyahu on Pesach Haggadah", 8646)
rebuild_commentary_links("Kos Shel Eliyahu on Haggadah", 8646) #should also work to remove all the wrong ones
#####

#Yismach Yisrael######
rebuild_commentary_links("Yismach Yisrael on Pesach Haggadah", 8646)
rebuild_commentary_links("Yismach Yisrael on Haggadah", 8646) #will delete the old ones
#####

#Ephod Bad
rebuild_commentary_links("Ephod Bad on Pesach Haggadah", 8646)
rebuild_commentary_links("Ephod Bad on Haggadah", 8646) #will delete the old ones
#####

#Maase Nissim
Index().load({'title': "Maaseh Nissim on Haggadah" }).delete() #delete errant index record. The rest is fine
rebuild_commentary_links("Maaseh Nissim on Pesach Haggadah", 8646)
rebuild_commentary_links("Maaseh Nissim on Haggadah", 8646)

#Maarechet Heidenheim
#already ok. nothing to do.


