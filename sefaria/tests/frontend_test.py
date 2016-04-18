# coding=utf-8

from sefaria.settings import DEBUG
import pytest
from selenium import webdriver
from selenium.webdriver.common.keys import Keys

if DEBUG:
    server = "http://localhost:8000"
else:
    server = "http://sefaria.org"

#webdriver.Ie only works on Windows
#also webdriver.Android?
#webdriver.Safari
@pytest.fixture(scope="module",
                params=[webdriver.Firefox, webdriver.Chrome])
def driver(request):
    d = request.param()

    def fin():
        print ("Closing driver %s" % request.param)
        d.close()

    request.addfinalizer(fin)
    return d

@pytest.mark.deep
def test_simple_pages(driver):
    driver.get(server)
    assert "Sefaria" in driver.title

    driver.get(server + "/Job.5.4")
    en_title = driver.find_element_by_css_selector(".sectionTitle .en")
    he_title = driver.find_element_by_css_selector(".sectionTitle .he")

    driver.find_element_by_css_selector("#english").click()
    assert en_title.is_displayed()
    assert en_title.text == u"Job Chapter 5"
    assert not he_title.is_displayed()

    driver.find_element_by_css_selector("#hebrew").click()
    assert not en_title.is_displayed()
    assert he_title.is_displayed()
    assert he_title.text == u"איוב ה"