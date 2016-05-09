from framework import AtomicTest
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support.expected_conditions import title_contains, staleness_of, element_to_be_clickable, visibility_of_element_located
from selenium.webdriver.common.keys import Keys

class RecentInToc(AtomicTest):
    suite_key = "S2 Reader"
    mobile = False

    def run(self, driver):
        driver.get(self.base_url + "/texts")

        driver.find_element_by_class_name('readerNavCategory[data-cat="Tanach"]').click()  # The "Tanach" category is first
        WebDriverWait(driver, 10).until(title_contains("Tanach"))

        p1 = driver.find_element_by_css_selector('.refLink[data-ref="Psalms 1"]')
        p1.click()
        WebDriverWait(driver, 10).until(title_contains("Psalms"))

        driver.get(self.base_url + "/texts")
        WebDriverWait(driver, 10).until(title_contains("Texts"))

        recent = driver.find_element_by_css_selector('.recentItem[data-ref="Psalms 1"]')
        recent.click()
        WebDriverWait(driver, 10).until(title_contains("Psalms"))


class LoadRefAndClickSegment(AtomicTest):
    suite_key = "S2 Reader"
    
    def run(self, driver):
        driver.get(self.base_url + "/Psalms.65.5")
        WebDriverWait(driver, 10).until(title_contains("Psalms 65:5"))

        segment = driver.find_element_by_css_selector('.segment[data-ref="Psalms 65:5"]')
        segment.click()
        WebDriverWait(driver, 10).until(title_contains("Psalms 65:5 with Connections"))
        assert "Psalms.65.5?with=all" in driver.current_url
        rashi = driver.find_element_by_css_selector('.textFilter[data-name="Malbim"]')
        assert rashi


class LoadRefWithCommentaryAndClickOnCommentator(AtomicTest):
    suite_key = "S2 Reader"

    def run(self, driver):
        driver.get(self.base_url + "/Psalms.45.5?with=all")
        assert "Psalms 45:5 with Connections" in driver.title, driver.title
        rashi = driver.find_element_by_css_selector('.textFilter[data-name="Rashi"]')
        rashi.click()
        WebDriverWait(driver, 10).until(staleness_of(rashi))
        assert "Psalms.45.5?with=Rashi" in driver.current_url, driver.current_url


class ClickVersionedSearchResultMobile(AtomicTest):
    suite_key = "S2 Search"
    mobile = False

    def run(self, driver):
        driver.get(self.base_url + "/s2")
        elem = driver.find_element_by_css_selector("input.search")
        elem.send_keys("Dogs")
        elem.send_keys(Keys.RETURN)
        WebDriverWait(driver, 10).until(title_contains("Dogs"))
        versionedResult = driver.find_element_by_css_selector('a[href="/Psalms.59.7/en/The_Rashi_Ketuvim_by_Rabbi_Shraga_Silverstein?qh=Dogs"]')
        versionedResult.click()
        WebDriverWait(driver, 10).until(staleness_of(versionedResult))
        assert "Psalms.59.7/en/The_Rashi_Ketuvim_by_Rabbi_Shraga_Silverstein" in driver.current_url


class ClickVersionedSearchResultDesktop(AtomicTest):
    suite_key = "S2 Search"
    desktop = False

    def run(self, driver):
        driver.get(self.base_url + "/s2")
        hamburger = driver.find_element_by_css_selector(".readerNavMenuMenuButton")
        if hamburger:
            hamburger.click()
            wait = WebDriverWait(driver, 10)
            wait.until(staleness_of("hamburger"))
        elem = driver.find_element_by_css_selector("input.search")
        elem.send_keys("Dogs")
        elem.send_keys(Keys.RETURN)
        WebDriverWait(driver, 10).until(title_contains("Dogs"))
        versionedResult = driver.find_element_by_css_selector('a[href="/Psalms.59.7/en/The_Rashi_Ketuvim_by_Rabbi_Shraga_Silverstein?qh=Dogs"]')
        versionedResult.click()
        WebDriverWait(driver, 10).until(staleness_of(versionedResult))
        assert "Psalms.59.7/en/The_Rashi_Ketuvim_by_Rabbi_Shraga_Silverstein" in driver.current_url
