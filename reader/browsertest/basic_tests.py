from framework import AtomicTest, wait_for_page_load, click_and_wait_for_change, click_and_expect


class RecentInToc(AtomicTest):
    def run(self, driver):
        driver.get(self.base_url + "/texts")

        driver.find_element_by_class_name('readerNavCategory[data-cat="Tanach"]').click()  # The "Tanach" category is first
        assert "Tanach" in driver.title

        p1 = driver.find_element_by_css_selector('.refLink[data-ref="Psalms 1"]')
        click_and_wait_for_change(p1)
        assert "Psalms" in driver.title

        driver.get(self.base_url + "/texts")
        assert "Texts" in driver.title

        recent = driver.find_element_by_css_selector('.recentItem[data-ref="Psalms 1"]')
        assert recent
        click_and_wait_for_change(recent)
        assert "Psalms" in driver.title


class LoadRefAndClickSegment(AtomicTest):
    def run(self, driver):
        driver.get(self.base_url + "/Psalms.65.5")
        assert "Psalms 65:5" in driver.title
        segment = driver.find_element_by_css_selector('.segment[data-ref="Psalms 65:5"]')
        click_and_expect(segment, driver, ".textFilter")
        assert "Psalms.65.5?with=all" in driver.current_url
        assert "Psalms 65:5 with Connections" in driver.title


class LoadRefWithCommentaryAndClickOnCommentator(AtomicTest):
    def run(self, driver):
        driver.get(self.base_url + "/Psalms.45.5?with=all")
        assert "Psalms 45:5 with Connections" in driver.title, driver.title
        rashi = driver.find_element_by_css_selector('.textFilter[data-name="Rashi"]')
        click_and_wait_for_change(rashi)
        assert "Psalms.45.5?with=Rashi" in driver.current_url, driver.current_url
