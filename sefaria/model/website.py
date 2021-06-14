from . import abstract as abst
import sefaria.system.cache as scache


class WebSite(abst.AbstractMongoRecord):
	collection = 'websites'

	required_attrs = [
		"name",
		"domains",
		"is_whitelisted"
	]
	optional_attrs = [
		"bad_urls",
		"normalization_rules",
		"title_branding",
		"initial_title_branding"
	]


class WebSiteSet(abst.AbstractMongoSet):
		recordClass = WebSite


def get_website_cache():
	sites = scache.get_shared_cache_elem("websites_data")
	if sites in [None, []]:
		sites = [w.contents() for w in WebSiteSet()]
		scache.set_shared_cache_elem("websites_data", sites)
		sites = scache.get_shared_cache_elem("websites_data")
	return sites