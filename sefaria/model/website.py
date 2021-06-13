from . import abstract as abst


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
