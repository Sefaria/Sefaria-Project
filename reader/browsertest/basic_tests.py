from framework import AtomicTest
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support.expected_conditions import title_contains, staleness_of, element_to_be_clickable, visibility_of_element_located
from selenium.webdriver.common.keys import Keys

TEMPER = 10


class RecentInToc(AtomicTest):
    suite_key = "S2 Reader"
    single_panel = False

    def run(self):
        self.s2().click_toc_category("Tanach").click_toc_text("Psalms")

        self.load_toc().click_toc_recent("Psalms 1")

        WebDriverWait(self.driver, TEMPER).until(title_contains("Psalms"))


class LoadRefAndClickSegment(AtomicTest):
    suite_key = "S2 Reader"

    def run(self):
        self.s2()
        self.driver.get(self.base_url + "/Psalms.65.5")
        WebDriverWait(self.driver, TEMPER).until(title_contains("Psalms 65:5"))

        segment = self.driver.find_element_by_css_selector('.segment[data-ref="Psalms 65:5"]')
        segment.click()
        WebDriverWait(self.driver, TEMPER).until(title_contains("Psalms 65:5 with Connections"))
        assert "Psalms.65.5?with=all" in self.driver.current_url
        malbim = self.driver.find_element_by_css_selector('.textFilter[data-name="Malbim"]')
        assert malbim


class LoadRefWithCommentaryAndClickOnCommentator(AtomicTest):
    suite_key = "S2 Reader"

    def run(self):
        self.s2()

        self.driver.get(self.base_url + "/Psalms.45.5?with=all")
        WebDriverWait(self.driver, TEMPER).until(title_contains("Psalms 45:5 with Connections"))
        rashi = self.driver.find_element_by_css_selector('.textFilter[data-name="Rashi"]')
        rashi.click()
        WebDriverWait(self.driver, TEMPER).until(staleness_of(rashi))
        assert "Psalms.45.5?with=Rashi" in self.driver.current_url, self.driver.current_url


class ClickVersionedSearchResultDesktop(AtomicTest):
    suite_key = "S2 Search"
    single_panel = False

    def run(self):
        self.s2()
        elem = self.driver.find_element_by_css_selector("input.search")
        elem.send_keys("Dogs")
        elem.send_keys(Keys.RETURN)
        WebDriverWait(self.driver, TEMPER).until(title_contains("Dogs"))
        versionedResult = self.driver.find_element_by_css_selector('a[href="/Psalms.59.7/en/The_Rashi_Ketuvim_by_Rabbi_Shraga_Silverstein?qh=Dogs"]')
        versionedResult.click()
        WebDriverWait(self.driver, TEMPER).until(staleness_of(versionedResult))
        assert "Psalms.59.7/en/The_Rashi_Ketuvim_by_Rabbi_Shraga_Silverstein" in self.driver.current_url


class ClickVersionedSearchResultMobile(AtomicTest):
    suite_key = "S2 Search"
    multi_panel = False

    def run(self):
        self.s2()
        self.driver.get(self.base_url + "/Psalms.23")
        hamburger = self.driver.find_element_by_css_selector(".readerNavMenuMenuButton")
        if hamburger:
            hamburger.click()
            wait = WebDriverWait(self.driver, TEMPER)
            wait.until(staleness_of(hamburger))
        elem = self.driver.find_element_by_css_selector("input.search")
        elem.send_keys("Dogs")
        elem.send_keys(Keys.RETURN)
        WebDriverWait(self.driver, TEMPER).until(title_contains("Dogs"))
        versionedResult = self.driver.find_element_by_css_selector('a[href="/Psalms.59.7/en/The_Rashi_Ketuvim_by_Rabbi_Shraga_Silverstein?qh=Dogs"]')
        versionedResult.click()
        WebDriverWait(self.driver, TEMPER).until(staleness_of(versionedResult))
        assert "Psalms.59.7/en/The_Rashi_Ketuvim_by_Rabbi_Shraga_Silverstein" in self.driver.current_url
