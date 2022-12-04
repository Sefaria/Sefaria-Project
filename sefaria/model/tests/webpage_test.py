import pytest
from sefaria.model import *
from sefaria.model.webpage import WebPage, get_webpages_for_ref

title_good_url = "Dvar Torah"


@pytest.fixture(scope='module')
def create_good_web_page():
	data_good_url = {'url': 'http://blogs.timesofisrael.com/dvar-torah2',
									 'title': title_good_url,
									 'description': 'A Dvar Torah on Times of Israel',
									 'refs': ["Haamek Davar on Genesis, Kidmat Ha'Emek 1", 'Shulchan Aruch, Orach Chaim 7:1']}

	result, webpage = WebPage().add_or_update_from_linker(data_good_url)
	yield {"result": result, "webpage": webpage, "data": data_good_url}
	WebPage().load(data_good_url["url"]).delete()


@pytest.fixture(scope='module')
def create_web_page_wout_desc():
	data_good_url = {'url': 'http://blogs.timesofisrael.com/dvar-torah4',
									 'title': title_good_url+" without description",
									 'refs': ["Haamek Davar on Genesis, Kidmat Ha'Emek 2", 'Genesis 3']}

	result, webpage = WebPage().add_or_update_from_linker(data_good_url)
	yield {"result": result, "webpage": webpage, "data": data_good_url}
	webpage.delete()


@pytest.fixture(scope='module')
def create_web_page_wout_site():
	data = {'url': 'http://notarealsite.org/123', 'title': "This is a good title", "refs": ["Genesis 2"]}
	result, webpage = WebPage().add_or_update_from_linker(data)
	yield {'result': result, 'webpage': webpage, 'data': data}
	webpage.delete()

def test_add_bad_domain_from_linker():
	#localhost:8000 should not be added to the linker, so make sure attempting to do so fails

	data = {'url': 'http://localhost:8000/static/test/linker_test.html',
					'title': 'Linker Test Page',
					'description': 'A Page We Do Not Want',
					'refs': ["Haamek Davar on Genesis, Kidmat Ha'Emek 1", 'Shulchan Aruch, Orach Chaim 7:1']}

	result, _ = WebPage().add_or_update_from_linker(data)
	assert result == "excluded"

def test_add_no_refs_from_linker():
	# blogs.timesofisrael.com/random should not be added to the linker, because it contains no refs
	# even though it's a good URL

	data = {'url': 'http://blogs.timesofisrael.com/random',
					'title': 'Random Blog',
					'description': 'A Page We Do Not Want',
					'refs': []}

	result, _ = WebPage().add_or_update_from_linker(data)
	assert result == "excluded"


def test_add_bad_title_from_linker():
	# http://rabbisacks.com/archives should not be added because it has a title we do not want

	data = {'url': 'http://rabbisacks.org/archives',
					'title': 'Page 1 of 2',
					'description': 'A Page We Do Not Want',
					'refs': ["Genesis 1:1"]}

	result, _ = WebPage().add_or_update_from_linker(data)
	assert result == "excluded"


def test_add_webpage_without_website(create_web_page_wout_site):
	# this should be possible even though no corresponding domain exists in a WebSite object
	result, webpage, data = create_web_page_wout_site["result"], create_web_page_wout_site["webpage"], create_web_page_wout_site["data"]
	assert result == "saved"


def test_add_and_update_good_url_from_linker(create_good_web_page):
	#blogs.timesofisrael.com is a whitelisted site with refs and good title so it should be added to the linker,
	#so make sure attempting to do so succeeds
	result, webpage, data = create_good_web_page["result"], create_good_web_page["webpage"], create_good_web_page["data"]
	assert result == "saved"
	linker_hits = webpage.linkerHits

	# now, we simply update an existing site with different refs and make sure it updated
	data['refs'] = ["Genesis 3:3", 'Exodus 3:10']

	result, webpage = WebPage().add_or_update_from_linker(data, add_hit=True)
	assert result == "saved"
	assert set(WebPage().load(data["url"]).refs) == set(["Genesis 3:3", 'Exodus 3:10'])
	assert WebPage().load(data["url"]).linkerHits == linker_hits + 1


def test_add_and_update_with_same_data(create_good_web_page):
	# create a page and then try to add_or_update it with same data and assert it fails
	result, webpage, data = create_good_web_page["result"], create_good_web_page["webpage"], create_good_web_page["data"]
	assert result == "saved"
	result, _ = WebPage().add_or_update_from_linker(data)
	assert result == "excluded"


def test_update_blank_title_from_linker(create_good_web_page):
	result, webpage, data = create_good_web_page["result"], create_good_web_page["webpage"], create_good_web_page["data"]
	print(webpage.contents())
	assert result == "saved"

	data["title"] = ""

	result, _ = WebPage().add_or_update_from_linker(data)
	assert result == "saved"
	print(WebPage().load(data["url"]).contents())
	assert WebPage().load(data["url"]).title == title_good_url



def test_add_search_URL():
	urls = ["https://opensiddur.org/search/", "https://opensiddur.org/search?q=prayer", "https://opensiddur.org/search"]
	for url in urls:
		linker_data = {'url': url,
		 'title': '"On Prayer," by Abraham Joshua Heschel (1969) • the Open Siddur Project ✍ פְּרוֺיֶּקט הַסִּדּוּר הַפָּתוּחַ',
		 'description': 'Rabbi Dr. Abraham Joshua Heschel\'s speech, "On Prayer," delivered at an inter-religious convocation held under the auspices of the U.S. Liturgical Conference in Milwaukee, Wisconsin, on August 28, 1969. His talk was printed in the journal Conservative Judaism v.25:1 Fall 1970, p.1-12.   . . .',
		 'refs': ['Psalms 1–41', 'Psalms 42–72', 'Psalms 73–89', 'Psalms 90–106', 'Psalms 107–150', 'Psalms 130:1',
				  'Psalms 63:2-4', 'Psalms 42:2-4']}

		result, _ = WebPage.add_or_update_from_linker(linker_data)
		assert result == "excluded"


def test_page_wout_description(create_web_page_wout_desc):
	result, webpage, data = create_web_page_wout_desc["result"], create_web_page_wout_desc["webpage"], create_web_page_wout_desc["data"]
	assert result == "saved"

	data["description"] = "here is a desc"
	assert WebPage().add_or_update_from_linker(data)[0] == "saved"

	assert WebPage().add_or_update_from_linker(data)[0] == "excluded"


def test_get_webpages_for_ref():
	results = get_webpages_for_ref("Rashi on Genesis 1:1")
	assert "title" in results[0]
	assert "url" in results[0]
	assert "refs" in results[0]
