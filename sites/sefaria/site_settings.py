# -*- coding: utf-8 -*-

SITE_SETTINGS = {
	"TORAH_SPECIFIC": True,
	"SITE_NAME": {
		"en": "Sefaria",
		"he": "ספריא"
	},
	"LIBRARY_NAME": {
		"en": "The Sefaria Library",
		"he": "האוסף של ספריא",
	},
	"SUPPORTED_TRANSLATION_LANGUAGES": ['en', 'es', 'fr', 'de'],
	"COLLECTIONS_BUCKET": "sefaria-collection-images",
	"PROFILES_BUCKET": 'sefaria-profile-pictures',
	"UGC_BUCKET": 'sheet-user-uploaded-media',
	"TOPICS_BUCKET": 'img.sefaria.org',
	"HELP_CENTER_URLS": {
		"EN_US": "https://help.sefaria.org/hc/en-us",
		"HE": "https://help.sefaria.org/hc/he",
		"GETTING_STARTED": "https://help.sefaria.org/hc/en-us/categories/13368526623132-Getting-Started"
	},
	"SHEET_REDIRECTS": {
		"en": {
			"215584": "https://help.sefaria.org/hc/en-us/sections/12756520483868-Text-Formatting-Accessibility",
			"218610": "https://help.sefaria.org/hc/en-us/sections/18613320256156-Translations",
			"231440": "https://help.sefaria.org/hc/en-us/categories/12756350371100-Donations",
			"210670": "https://help.sefaria.org/hc/en-us/categories/13368526623132-Getting-Started",
			"218612": "https://help.sefaria.org/hc/en-us/sections/12756518640668-How-to-Reuse-Download-and-Otherwise-Reproduce-Texts",
			"225828": "https://help.sefaria.org/hc/en-us/categories/12756353030044-Source-Sheets",
			"219447": "https://help.sefaria.org/hc/en-us/articles/18472472138652-Quick-Guide-Meet-the-Resource-Panel",
			"228381": "https://help.sefaria.org/hc/en-us/sections/12756518640668-How-to-Reuse-Download-and-Otherwise-Reproduce-Texts",
			"220945": "https://help.sefaria.org/hc/en-us/categories/19814642862876-Sefaria-s-Mobile-Apps",
			"233647": "https://help.sefaria.org/hc/en-us/sections/12756555356956-Study-and-Reference-Tools",
			"211565": "https://help.sefaria.org/hc/en-us/sections/12721846793116-How-to-Find-Texts",
			"393695": "https://help.sefaria.org/hc/en-us/categories/12756353030044-Source-Sheets",
			"429277": "https://help.sefaria.org/hc/en-us/articles/18472614956956-Quick-Guide-Meet-the-A-%D7%90-menu",
			"231377": "https://help.sefaria.org/hc/en-us/sections/20094169893276-All-About-Topics-Pages",
			"519205": "https://help.sefaria.org/hc/en-us/articles/18472576952988-Quick-Guide-Meet-the-Table-of-Contents",
			"274871": "https://help.sefaria.org/hc/en-us/sections/12756555356956-Study-and-Reference-Tools",
			"303276": "https://help.sefaria.org/hc/en-us/categories/12756351595932-Your-Account",
			"379494": "https://help.sefaria.org/hc/en-us/sections/12756538060956-Text-Specific-Special-Features",
			"359083": "https://help.sefaria.org/hc/en-us/sections/17430252462236-Managing-Your-Donation",
			"483970": "https://help.sefaria.org/hc/en-us/sections/18613320256156-Translations-and-Language-Preferences",
			"511573": "https://help.sefaria.org/hc/en-us/sections/18613320256156-Translations-and-Language-Preferences",
			"497893": "https://help.sefaria.org/hc/en-us/sections/12756555356956-Study-and-Reference-Tools",
			"477118": "https://help.sefaria.org/hc/en-us/sections/18472260943900-Sefaria-101-Quick-Guides-and-Sefaria-Basics",
			"212911": "https://help.sefaria.org/hc/en-us/sections/20094783356956-All-About-Source-Sheets",
			"529099": "https://help.sefaria.org/hc/en-us/sections/20235182393244-Sefaria-for-Google-Docs",
			"584561": "https://help.sefaria.org/hc/en-us/sections/20235182393244-Sefaria-for-Google-Docs",
		},
		"he": {
			"328503": "https://help.sefaria.org/hc/he/articles/20234245638428-%D7%9B%D7%99%D7%A6%D7%93-%D7%9C%D7%9E%D7%A6%D7%95%D7%90-%D7%9E%D7%99%D7%93%D7%A2-%D7%91%D7%99%D7%95%D7%92%D7%A8%D7%A4%D7%99-%D7%90%D7%95%D7%93%D7%95%D7%AA-%D7%93%D7%9E%D7%95%D7%99%D7%95%D7%AA-%D7%9E%D7%94%D7%AA%D7%9C%D7%9E%D7%95%D7%93",
			"243658": "https://help.sefaria.org/hc/he/categories/19814642862876-%D7%94%D7%A9%D7%99%D7%9E%D7%95%D7%A9-%D7%91%D7%99%D7%99%D7%A9%D7%95%D7%9E%D7%95%D7%9F-%D7%A1%D7%A4%D7%A8%D7%99%D7%90",
			"241176": "https://help.sefaria.org/hc/he/sections/12756518640668-%D7%A9%D7%97%D7%96%D7%95%D7%A8-%D7%94%D7%93%D7%A4%D7%A1%D7%94-%D7%95%D7%94%D7%A4%D7%A6%D7%AA-%D7%9E%D7%A7%D7%95%D7%A8%D7%95%D7%AA",
			"288330": "https://help.sefaria.org/hc/he/sections/12756518640668-%D7%A9%D7%97%D7%96%D7%95%D7%A8-%D7%94%D7%93%D7%A4%D7%A1%D7%94-%D7%95%D7%94%D7%A4%D7%A6%D7%AA-%D7%9E%D7%A7%D7%95%D7%A8%D7%95%D7%AA",
			"399333": "https://help.sefaria.org/hc/he/sections/20094783356956-%D7%99%D7%A6%D7%99%D7%A8%D7%AA-%D7%93%D7%A4%D7%99-%D7%9E%D7%A7%D7%95%D7%A8%D7%95%D7%AA-%D7%91%D7%A1%D7%A4%D7%A8%D7%99%D7%90",
			"242573": "https://help.sefaria.org/hc/he/articles/18490652948508-%D7%9B%D7%99%D7%A6%D7%93-%D7%9C%D7%94%D7%93%D7%A4%D7%99%D7%A1-%D7%9E%D7%A7%D7%95%D7%A8%D7%95%D7%AA-%D7%9E%D7%94%D7%A1%D7%A4%D7%A8%D7%99%D7%99%D7%94",
			"244351": "https://help.sefaria.org/hc/he/sections/12721846793116-%D7%92%D7%99%D7%A9%D7%94-%D7%9C%D7%9E%D7%A7%D7%95%D7%A8%D7%95%D7%AA",
			"615752": "https://help.sefaria.org/hc/he/sections/12756520483868-%D7%90%D7%A4%D7%A9%D7%A8%D7%95%D7%99%D7%95%D7%AA-%D7%A4%D7%95%D7%A8%D7%9E%D7%98-%D7%98%D7%A7%D7%A1%D7%98-%D7%95%D7%A0%D7%92%D7%99%D7%A9%D7%95%D7%AA",
			"239441": "https://help.sefaria.org/hc/he/sections/12756520483868-%D7%90%D7%A4%D7%A9%D7%A8%D7%95%D7%99%D7%95%D7%AA-%D7%A4%D7%95%D7%A8%D7%9E%D7%98-%D7%98%D7%A7%D7%A1%D7%98-%D7%95%D7%A0%D7%92%D7%99%D7%A9%D7%95%D7%AA",
			"288327": "https://help.sefaria.org/hc/he/articles/18472472138652-%D7%9E%D7%93%D7%A8%D7%99%D7%9A-%D7%9E%D7%94%D7%99%D7%A8-%D7%94%D7%9B%D7%99%D7%A8%D7%95-%D7%90%D7%AA-%D7%A1%D7%A8%D7%92%D7%9C-%D7%94%D7%A7%D7%99%D7%A9%D7%95%D7%A8%D7%99%D7%9D-%D7%95%D7%94%D7%9B%D7%9C%D7%99%D7%9D",
			"569973": "https://help.sefaria.org/hc/he/sections/20235182393244-%D7%AA%D7%95%D7%A1%D7%A3-%D7%A1%D7%A4%D7%A8%D7%99%D7%90-%D7%9C-Google-Docs",
			"382833": "https://help.sefaria.org/hc/he/sections/12756538060956-%D7%A4%D7%99%D7%A6-%D7%A8%D7%99%D7%9D-%D7%9C%D7%A9%D7%99%D7%9E%D7%95%D7%A9-%D7%A2%D7%9D-%D7%9E%D7%A7%D7%95%D7%A8%D7%95%D7%AA-%D7%9E%D7%A1%D7%95%D7%99%D7%9E%D7%99%D7%9D",
			"332893": "https://help.sefaria.org/hc/he/articles/18472380899484-%D7%9E%D7%93%D7%A8%D7%99%D7%9A-%D7%9E%D7%94%D7%99%D7%A8-%D7%94%D7%9B%D7%99%D7%A8%D7%95-%D7%90%D7%AA-%D7%A2%D7%9E%D7%95%D7%93-%D7%94%D7%91%D7%99%D7%AA",
			"242826": "https://help.sefaria.org/hc/he/articles/18613227644316-%D7%9B%D7%99%D7%A6%D7%93-%D7%9C%D7%90%D7%AA%D7%A8-%D7%9E%D7%A7%D7%95%D7%A8%D7%95%D7%AA-%D7%9E%D7%A7%D7%95%D7%A9%D7%A8%D7%99%D7%9D",
			"239814": "https://help.sefaria.org/hc/he/categories/12721826687772-%D7%94%D7%A9%D7%99%D7%9E%D7%95%D7%A9-%D7%91%D7%A1%D7%A4%D7%A8%D7%99%D7%90",
			"293375": "https://help.sefaria.org/hc/he/categories/20332917021212-%D7%99%D7%A6%D7%99%D7%A8%D7%AA-%D7%93%D7%A4%D7%99-%D7%9E%D7%A7%D7%95%D7%A8%D7%95%D7%AA-%D7%95%D7%A9%D7%99%D7%9E%D7%95%D7%A9-%D7%91%D7%AA%D7%95%D7%A1%D7%A4%D7%99%D7%9D-%D7%9C%D7%93%D7%A4%D7%93%D7%A4%D7%9F",
			"288326": "https://help.sefaria.org/hc/he/sections/12756555356956-%D7%9B%D7%9C%D7%99%D7%9D-%D7%9C%D7%9C%D7%99%D7%9E%D7%95%D7%93-%D7%91%D7%A1%D7%A4%D7%A8%D7%99%D7%90",
		}
	}
}