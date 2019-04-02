from sefaria.settings import SITE_PACKAGE

temp = __import__(SITE_PACKAGE + ".site_settings", fromlist=["SITE_SETTINGS"])

SITE_SETTINGS = temp.SITE_SETTINGS
