from sefaria.settings import SITE_PACKAGE

__temp = __import__(SITE_PACKAGE + ".urls", fromlist=["site_urlpatterns"])
site_urlpatterns = __temp.site_urlpatterns
