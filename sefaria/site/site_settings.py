from sefaria.settings import SITE_PACKAGE

temp = __import__(SITE_PACKAGE + ".site_settings", fromlist=["TORAH_SPECIFIC"])

TORAH_SPECIFIC = temp.TORAH_SPECIFIC
