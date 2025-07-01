from sefaria.settings import SITE_PACKAGE, FRONT_END_URL

temp = __import__(SITE_PACKAGE + ".site_settings", fromlist=["SITE_SETTINGS"])

SITE_SETTINGS = temp.SITE_SETTINGS
SITE_SETTINGS["FRONT_END_URL"] = FRONT_END_URL