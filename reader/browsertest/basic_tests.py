from framework import AtomicTest
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support.expected_conditions import title_contains, staleness_of, element_to_be_clickable, visibility_of_element_located
from selenium.webdriver.common.keys import Keys

TEMPER = 10


class PagesLoad(AtomicTest):
    suite_key = "S2 Reader"
    every_build = True

    def run(self):
        self.s2()
        self.load_toc().click_toc_category("Midrash").click_toc_text("Midrash Tanchuma")
        self.load_ref("Psalms.104")
        self.load_sheets()


class RecentInToc(AtomicTest):
    suite_key = "S2 Reader"
    single_panel = False
    every_build = True


    def run(self):
        self.s2().click_toc_category("Tanach").click_toc_text("Psalms")
        self.load_toc().click_toc_recent("Psalms 1", until=title_contains("Psalms"))


class LoadRefAndClickSegment(AtomicTest):
    suite_key = "S2 Reader"
    every_build = True

    def run(self):
        self.s2()

        self.load_ref("Psalms 65:5").click_segment("Psalms 65:5")
        assert "Psalms.65.5?with=all" in self.driver.current_url

        self.click_text_filter("Malbim")


class LoadRefWithCommentaryAndClickOnCommentator(AtomicTest):
    suite_key = "S2 Reader"
    every_build = True

    def run(self):
        self.s2()
        self.load_ref("Psalms 45:5", filter="all").click_text_filter("Rashi")
        assert "Psalms.45.5?with=Rashi" in self.driver.current_url, self.driver.current_url


class ClickVersionedSearchResultDesktop(AtomicTest):
    suite_key = "S2 Search"
    single_panel = False

    def run(self):
        self.s2().search_for("Dogs")
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
        self.search_for("Dogs")
        versionedResult = self.driver.find_element_by_css_selector('a[href="/Psalms.59.7/en/The_Rashi_Ketuvim_by_Rabbi_Shraga_Silverstein?qh=Dogs"]')
        versionedResult.click()
        WebDriverWait(self.driver, TEMPER).until(staleness_of(versionedResult))
        assert "Psalms.59.7/en/The_Rashi_Ketuvim_by_Rabbi_Shraga_Silverstein" in self.driver.current_url

