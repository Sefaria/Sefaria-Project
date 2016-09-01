from framework import AtomicTest
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait, Select
from selenium.webdriver.support.expected_conditions import title_contains, staleness_of, element_to_be_clickable, visibility_of_element_located, invisibility_of_element_located

from selenium.webdriver.common.keys import Keys

TEMPER = 10


class SinglePanelOnMobile(AtomicTest):
    suite_key = "Reader"
    every_build = True
    multi_panel = False

    def run(self):
        self.load_toc().click_toc_category("Tanakh").click_toc_text("Joshua")
        elems = self.driver.find_elements_by_css_selector(".readerApp.multiPanel")
        assert len(elems) == 0
        self.click_segment("Joshua 1:1")
        elems = self.driver.find_elements_by_css_selector(".readerApp .readerPanelBox")
        assert len(elems) == 1


class PagesLoad(AtomicTest):
    suite_key = "Reader"
    every_build = True

    def run(self):
        self.load_toc().click_toc_category("Midrash").click_toc_text("Midrash Tanchuma")
        self.load_ref("Psalms.104")
        self.load_sheets()


class RecentInToc(AtomicTest):
    suite_key = "Reader"
    single_panel = False
    every_build = True

    def run(self):
        self.s2().click_toc_category("Tanakh").click_toc_text("Psalms")
        self.load_toc().click_toc_recent("Psalms 1")


class LoadRefAndClickSegment(AtomicTest):
    suite_key = "Reader"
    every_build = True

    def run(self):
        self.load_ref("Psalms 65:5").click_segment("Psalms 65:5")
        assert "Psalms.65.5" in self.driver.current_url, self.driver.current_url
        assert "with=all" in self.driver.current_url, self.driver.current_url

        self.click_text_filter("Malbim")


class LoadRefWithCommentaryAndClickOnCommentator(AtomicTest):
    suite_key = "Reader"
    every_build = True

    def run(self):
        self.load_ref("Psalms 45:5", filter="all").click_text_filter("Rashi")
        assert "Psalms.45.5" in self.driver.current_url, self.driver.current_url
        assert "with=Rashi" in self.driver.current_url, self.driver.current_url


class LoadAndVerifyIndepenedentTOC(AtomicTest):
    suite_key = "Reader"
    every_build = True

    def run(self):
        titles = [
            "Genesis",  # Simple Text
            "Shabbat",  # Talmud Numbering
            "Ibn Ezra on Psalms",  # Commentary on Simple text
            "Zohar",  # Zohar, just cuz
            "Tosafot on Shabbat",  # Commentary on Talmud
            "Pesach Haggadah" # Complex text
        ]
        for title in titles:
            self.load_text_toc(title)

       # self.load_text_toc("Numbers").click_text_toc_section("Numbers 12").back().click_text_toc_section("Numbers 3").back()


class PresenceOfDownloadButtonOnTOC(AtomicTest):
    suite_key = "Reader"
    every_build = True

    def run(self):
        # Load Shabbat TOC and scroll to bottom
        self.load_text_toc("Shabbat").scroll_panel_to_bottom()

        # Check that DL Button is visible and not clickable
        visible = self.driver.execute_script(
            'var butt = $(".downloadButtonInner"); ' +\
            'var butt_bot = butt.offset().top + butt.height(); ' +\
            'var win_height = $(window).height(); ' +\
            'return win_height > butt_bot;'
        )
        assert visible, "Download button below page"
        # This isn't sufficient - it only checks if it's visible in the DOM
        #WebDriverWait(self.driver, TEMPER).until(visibility_of_element_located((By.CSS_SELECTOR, ".downloadButtonInner")))

        WebDriverWait(self.driver, TEMPER).until(invisibility_of_element_located((By.CSS_SELECTOR, '.dlVersionFormatSelect + a')))

        # Select version and format
        s1 = Select(self.driver.find_element_by_css_selector('.dlVersionTitleSelect'))
        s1.select_by_value("Wikisource Talmud Bavli/he")
        s2 = Select(self.driver.find_element_by_css_selector('.dlVersionFormatSelect'))
        s2.select_by_value("csv")

        # Check that DL button is clickable
        WebDriverWait(self.driver, TEMPER).until(visibility_of_element_located((By.CSS_SELECTOR, '.dlVersionFormatSelect + a')))


class LoadSearchFromURL(AtomicTest):
    suite_key = "Search"
    every_build = True

    def run(self):
        self.load_search_url("Passover")


class ClickVersionedSearchResultDesktop(AtomicTest):
    suite_key = "Search"
    single_panel = False

    def run(self):
        self.load_toc().search_for("Dogs")
        versionedResult = self.driver.find_element_by_css_selector('a[href="/Psalms.59.7/en/The_Rashi_Ketuvim_by_Rabbi_Shraga_Silverstein?qh=Dogs"]')
        versionedResult.click()
        WebDriverWait(self.driver, TEMPER).until(staleness_of(versionedResult))
        assert "Psalms.59.7/en/The_Rashi_Ketuvim_by_Rabbi_Shraga_Silverstein" in self.driver.current_url, self.driver.current_url


class ClickVersionedSearchResultMobile(AtomicTest):
    suite_key = "Search"
    multi_panel = False

    def run(self):
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
        assert "Psalms.59.7/en/The_Rashi_Ketuvim_by_Rabbi_Shraga_Silverstein" in self.driver.current_url, self.driver.current_url




"""
# currently broken -- requires ability to login

class SaveNewSourceSheet(AtomicTest):
    suite_key = "S2 Sheets"
    every_build = True

    def run(self):
        self.s2()
        self.driver.implicitly_wait(10)
        self.driver.get(self.base_url + "/sheets/new")
        self.driver.find_element_by_css_selector("#inlineAdd").send_keys("Gen 1.1")
        self.driver.find_element_by_css_selector("#inlineAddSourceOK").click()
        WebDriverWait(self.driver, TEMPER).until(element_to_be_clickable((By.CSS_SELECTOR, "#save")))
        saveButton = self.driver.find_element_by_css_selector('#save')
        saveButton.click()
        WebDriverWait(self.driver, TEMPER).until(title_is("New Source Sheet | Sefaria Source Sheet Builder"))
"""

"""
# Not complete

class InfiniteScrollUp(AtomicTest):
    suite_key = "Reader"
    every_build = True

    def run(self):
        self.load_ref("Job 32").scroll_to_top()


class InfiniteScrollDown(AtomicTest):
    suite_key = "Reader"
    every_build = True

    def run(self):
        self.load_ref("Job 32")

"""


