# -*- coding: utf-8 -*-

from .config import TEMPER, SAUCE_CAPS, SAUCE_CORE_CAPS, SAUCE_MAX_THREADS, BS_CAPS, BS_MAX_THREADS, BS_KEY, BS_USER, LOCAL_URL, REMOTE_URL
from sefaria.model import *
from pathos.multiprocessing import ProcessingPool as Pool
import random
import os
import inspect
import http.client
import base64
import json
import traceback
import sys

from selenium import webdriver
from appium import webdriver as appium_webdriver
from selenium.webdriver.common.touch_actions import TouchActions
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support.expected_conditions import title_contains, presence_of_element_located, staleness_of,\
        element_to_be_clickable, visibility_of_element_located, invisibility_of_element_located, \
    text_to_be_present_in_element, _find_element, StaleElementReferenceException, visibility_of_any_elements_located
from selenium.webdriver.common.keys import Keys
from selenium.common.exceptions import NoSuchElementException, NoAlertPresentException, WebDriverException
# http://selenium-python.readthedocs.io/waits.html
# http://selenium-python.readthedocs.io/api.html#module-selenium.webdriver.support.expected_conditions

import time # import stand library below name collision in sefaria.model


class AbstractTest(object):
    every_build = False  # Run this test on every build?
    single_panel = True  # run this test on mobile?
    multi_panel = True  # run this test on desktop?

    # Only use one of the below.
    include = []  # List of platforms (using cap_to_short_string) to include.  If this is present, only these platforms are included
    exclude = []  # List of platforms (using cap_to_short_string) to exclude.

    def __init__(self, driver, url, cap, root_test=False, verbose=False, **kwargs):
        """

        :param driver:
        :param url:
        :param cap:
        :param root_test: Is this test being run alone (or as a parent of others)?
        :param verbose:
        :param kwargs:
        """
        self.base_url = url
        self.driver = driver
        self.cap = cap
        self.isVerbose = verbose
        self.is_root = root_test

    def name(self):
        return"{} / {}".format(Trial.cap_to_string(self.cap), self.__class__.__name__)

    @classmethod
    def _should_run(cls, mode, cap):
        if (mode == "multi_panel" and not cls.multi_panel) or (mode == "single_panel" and not cls.single_panel):
            return False
        if len(cls.include) and Trial.cap_to_short_string(cap) not in cls.include:
            return False
        if len(cls.exclude) and Trial.cap_to_short_string(cap) in cls.exclude:
            return False
        return True

    def should_run(self, mode):
        pass

    def run(self):
        pass

    def carp(self, msg, short_msg="", always=False):
        sys.stdout.write(msg if self.isVerbose or always else short_msg)
        sys.stdout.flush()

    # Component methods
    # Methods that begin with "nav_to_" assume that the site is loaded, and do not reload a page.
    # Methods that begin with "load_" start with a page load.

    def set_modal_cookie(self):
        # set cookie to avoid popup interruption
        # We now longer set the welcomeToS2LoggedOut message by default.
        # TODO is this method still needed?
        pass
        # self.driver.add_cookie({"name": "welcomeToS2LoggedOut", "value": "true"})

    def set_cookies_cookie(self):
        # set cookie to avoid popup interruption
        # We now longer set the welcomeToS2LoggedOut message by default.
        # TODO is this method still needed?
        self.driver.add_cookie({"name": "cookiesNotificationAccepted", "value": "1", 'path' : '/'})

    def click_accept_cookies(self):
        try:
            elem = self.driver.find_element_by_css_selector(".cookiesNotification .button")
            elem.click()
        except NoSuchElementException:
            pass

    def login_user(self):
        password = os.environ["SEFARIA_TEST_PASS"]
        user = os.environ["SEFARIA_TEST_USER"]
        self._login(user, password)
        return self

    def login_superuser(self):
        user = os.environ["SEFARIA_SUPERUSER"]
        password = os.environ["SEFARIA_SUPERPASS"]
        self._login(user, password)
        return self

    def _login(self, user, password):
        if self.is_logged_in():
            return self
        self.nav_to_login()
        elem = self.driver.find_element_by_css_selector("#id_email")
        elem.send_keys(user)
        elem = self.driver.find_element_by_css_selector("#id_password")
        elem.send_keys(password)
        self.driver.find_element_by_css_selector("button").click()
        WebDriverWait(self.driver, TEMPER).until_not(title_contains("Log in"))
        time.sleep(3)    # Takes some time to reload, and not sure what next page is
        return self

    def nav_to_account(self):
        if self.is_logged_in():
            self.driver.find_element_by_css_selector('.accountLinks .my-profile').click()
        else:
            raise Exception("Can't nav to account.  Not logged in.")
        return self

    def nav_to_sheets(self):
        self.nav_to_account()
        WebDriverWait(self.driver, TEMPER).until(element_to_be_clickable((By.CSS_SELECTOR, ".profile-summary")))
        time.sleep(5)
        try:
            el = self.driver.find_element_by_css_selector('.sheet-header .resourcesLink')
        except NoSuchElementException:
            el = self.driver.find_element_by_css_selector('.emptyList .resourcesLink')
        el.click()
        WebDriverWait(self.driver, TEMPER).until(element_to_be_clickable((By.ID, "inlineAdd")))
        return self

    def nav_to_login(self):
        el = self.driver.find_element_by_css_selector('.accountLinks .loginLink')
        el.click()
        WebDriverWait(self.driver, TEMPER).until(element_to_be_clickable((By.CSS_SELECTOR, "#id_email")))
        return self

    def is_logged_in(self):
        try:
            self.driver.find_element_by_css_selector('.accountLinks .my-profile')
            return True
        except NoSuchElementException:
            return False

    # TOC
    def nav_to_toc(self):
        """
        This method can be called from many different initial states.
        It tries a few differnt things to get out of the current state, back to a dependable base toc.
        :return:
        """
        if self.driver.current_url == self.base_url + "/texts" or self.driver.current_url.startswith(self.base_url + "/texts?"):
            return self

        # If text options are open, close them
        try:
            mask = self.driver.find_element_by_css_selector('.mask')
            self.driver.execute_script("arguments[0].click();", mask)
        except NoSuchElementException:
            pass

        # Maybe deep in a commentary list
        while True:
            try:
                self.driver.find_element_by_css_selector('.connectionsHeaderTitle.active').click()
            except NoSuchElementException:
                break

        try:
            self.driver.find_element_by_css_selector('.headerNavSection .library, .readerNavMenuMenuButton').click()
        except NoSuchElementException:
            try:
                # Mobile browsers could be in a state where a window needs to be closed.
                self.driver.find_element_by_css_selector('.readerNavMenuCloseButton').click()
                self.driver.find_element_by_css_selector('.headerNavSection .library, .readerNavMenuMenuButton').click()
            except NoSuchElementException:
                # Mobile browsers could be in a state where commentary panel is open
                self.driver.find_element_by_css_selector('.segment').click()
                self.driver.find_element_by_css_selector('.headerNavSection .library, .readerNavMenuMenuButton').click()

        WebDriverWait(self.driver, TEMPER).until(element_to_be_clickable((By.CSS_SELECTOR, ".readerNavCategory")))
        return self

    def nav_to_history(self):
        self.nav_to_toc()
        el = self.driver.find_element_by_css_selector('a[href="/texts/history"]')
        el.click()
        WebDriverWait(self.driver, TEMPER).until(element_to_be_clickable((By.CSS_SELECTOR, ".recentItem")))
        return self

    def load_toc(self, my_temper=None):
        my_temper = my_temper or TEMPER  # This is used at startup, which can be sluggish on iPhone.
        self.driver.get(self.base_url + "/texts")
        WebDriverWait(self.driver, my_temper).until(element_to_be_clickable((By.CSS_SELECTOR, ".readerNavCategory")))
        self.set_modal_cookie()
        return self

    def click_toc_category(self, category_name):
        # Assume that category link is already present on screen (or soon will be)

        # These CSS selectors could fail if the category is a substring of another possible category
        WebDriverWait(self.driver, TEMPER).until(
            presence_of_element_located((By.CSS_SELECTOR,'.readerNavCategory[data-cat*="{}"], .catLink[data-cats*="{}"]'.format(category_name, category_name)))
        )
        i = 0
        while i < 3:
            try:
                e = self.driver.find_element_by_css_selector('.readerNavCategory[data-cat*="{}"], .catLink[data-cats*="{}"]'.format(category_name,category_name))
                e.click()
                break
            except (StaleElementReferenceException, NoSuchElementException) as e:
                i += 1
                time.sleep(.25)
                continue

        WebDriverWait(self.driver, TEMPER).until(
            one_of_these_texts_present_in_element((By.CSS_SELECTOR, "h1 > span.en, h2 > span.en"), [category_name, category_name.upper()])
        )
        return self

    def click_toc_text(self, text_name):
        # Assume that text link is already present on screen (or soon will be)
        selector = '.refLink[data-ref^="{}"]'.format(text_name)
        WebDriverWait(self.driver, TEMPER).until(
            presence_of_element_located((By.CSS_SELECTOR, selector))
        )
        WebDriverWait(self.driver, TEMPER).until(
            element_to_be_clickable((By.CSS_SELECTOR, selector))
        )
        p1 = self.driver.find_element_by_css_selector(selector)
        p1.click()

        WebDriverWait(self.driver, TEMPER).until(
            element_to_be_clickable((By.CSS_SELECTOR, '.segment'))
        )
        return self

    def click_toc_recent(self, tref):
        # Assume that text link is already present on screen (or soon will be)
        WebDriverWait(self.driver, TEMPER).until(
            element_to_be_clickable((By.CSS_SELECTOR, '.recentItem[data-ref="{}"]'.format(tref)))
        )
        recent = self.driver.find_element_by_css_selector('.recentItem[data-ref="{}"]'.format(tref))
        recent.click()
        WebDriverWait(self.driver, TEMPER).until(element_to_be_clickable((By.CSS_SELECTOR, '.segment')))

    def click_source_title(self):
        title_selector = 'div.readerTextToc > div > a'
        WebDriverWait(self.driver, TEMPER).until(
            element_to_be_clickable((By.CSS_SELECTOR, title_selector))
        )
        ttl = self.driver.find_element_by_css_selector(title_selector)
        ttl.click()

    def click_chapter(self, cptr):
        chapter_selector = 'div.content div.tocLevel div div div a:nth-child('+ cptr + ')'
        WebDriverWait(self.driver, TEMPER).until(
            element_to_be_clickable((By.CSS_SELECTOR, chapter_selector))
        )
        ttl = self.driver.find_element_by_css_selector(chapter_selector)
        ttl.click()

    def click_sefaria(self):
        time.sleep(.5)
        sefaria_img_selector = '#s2 > div > div.header > div > div.headerHomeSection > a > img'
        WebDriverWait(self.driver, TEMPER).until(
            element_to_be_clickable((By.CSS_SELECTOR, sefaria_img_selector))
        )
        sefaria_img = self.driver.find_element_by_css_selector(sefaria_img_selector)
        sefaria_img.click()

    def click_get_started(self):
        btn_selector = '#homeCover > a > div > span.int-en'
        WebDriverWait(self.driver, TEMPER).until(
            element_to_be_clickable((By.CSS_SELECTOR, btn_selector))
        )
        btn = self.driver.find_element_by_css_selector(btn_selector)
        btn.click()

    def click_explore_lib(self):
        explore_lib_selector = '#homeLearn > div > div.textBox > a > div > span.int-en'
        WebDriverWait(self.driver, TEMPER).until(
            element_to_be_clickable((By.CSS_SELECTOR, explore_lib_selector))
        )
        explore_lib = self.driver.find_element_by_css_selector(explore_lib_selector)
        explore_lib.click()

    def click_start_learning_nth_btn(self, btn):
        nth_btn_selector = '#homeLearn > div > div.imageBox > a:nth-child(' + btn + ') > span.int-en'
        WebDriverWait(self.driver, TEMPER).until(
            element_to_be_clickable((By.CSS_SELECTOR, nth_btn_selector))
        )
        nth_btn = self.driver.find_element_by_css_selector(nth_btn_selector)
        nth_btn.click()

    def click_parasha(self):
        self.click_start_learning_nth_btn('1')

    def click_daf_yomi(self):
        self.click_start_learning_nth_btn('2')

    def click_haggadah(self):
        self.click_start_learning_nth_btn('3')

    def click_pirkei_avot(self):
        self.click_start_learning_nth_btn('4')

    def click_midrash_rabbah(self):
        self.click_start_learning_nth_btn('5')

    def click_shulchan_arukh(self):
        self.click_start_learning_nth_btn('6')

    def click_start_a_sheet(self):
        self.click_object_by_css_selector('#homeSheets > div > div.textBox > a:nth-child(3) > div > span.int-en')

    def click_commentary_on_sidebar(self):
        self.click_sidebar_entry('Commentary')

    def click_tanakh_on_sidebar(self):
        self.click_sidebar_entry('Tanakh')

    def click_targum_on_sidebar(self):
        self.click_sidebar_entry('Targum')

    def click_mishnah_on_sidebar(self):
        self.click_sidebar_entry('Mishnah')

    def click_talmud_on_sidebar(self):
        self.click_sidebar_entry('Talmud')

    def click_midrash_on_sidebar(self):
        self.click_sidebar_entry('Midrash')

    def click_halakhah_on_sidebar(self):
        self.click_sidebar_entry('Halakhah')

    def click_kabbalah_on_sidebar(self):
        self.click_sidebar_entry('Kabbalah')

    def click_philosophy_on_sidebar(self):
        self.click_sidebar_entry('Philosophy')

    def click_chasidut_on_sidebar(self):
        self.click_sidebar_entry('Chasidut')

    def click_musar_on_sidebar(self):
        self.click_sidebar_entry('Musar')

    def click_other_on_sidebar(self):
        self.click_sidebar_entry('Other')

    def click_grammar_on_sidebar(self):
        self.click_sidebar_entry('Grammar')

    def click_resources_on_sidebar(self):
        self.click_object_by_css_selector('.connectionsHeaderTitle')

    def click_other_text_on_sidebar(self):
        self.click_object_by_css_selector('a.toolsButton:nth-child(1) > span:nth-child(2)')

    def click_sheets_on_sidebar(self):
        self.click_object_by_css_selector('a.toolsButton:nth-child(2) > span:nth-child(2)')

    def click_notes_on_sidebar(self):
        self.click_object_by_css_selector('a.toolsButton:nth-child(3) > span:nth-child(2)')
        try:
            self.close_join_sefaria_popup()
        except NoSuchElementException:
            # you're signed in which means you opened notes. go back to resources
            self.click_resources_on_sidebar()

    def click_about_on_sidebar(self):
        self.click_object_by_css_selector('a.toolsButton:nth-child(4) > span:nth-child(2)')

    def click_versions_on_sidebar(self):
        self.click_object_by_css_selector('a.toolsButton:nth-child(5) > span:nth-child(2)')

    def click_webpages_on_sidebar(self):
        self.click_object_by_css_selector('a.toolsButton:nth-child(7) > span:nth-child(2)')

    def click_tools_on_sidebar(self):
        self.click_object_by_css_selector('a.toolsButton:nth-child(8) > span:nth-child(2)')

    def click_share_on_sidebar(self):
        self.click_object_by_css_selector('a.toolsButton:nth-child(1) > span:nth-child(2)')

    def click_add_translation_on_sidebar(self):
        self.click_object_by_css_selector('a.toolsButton:nth-child(2) > span:nth-child(2)')

    def click_add_connection_on_sidebar(self):
        self.click_object_by_css_selector('a.toolsButton:nth-child(3) > span:nth-child(2)')

    def close_join_sefaria_popup(self):
        self.driver.find_element_by_css_selector('#interruptingMessage #interruptingMessageClose')
        self.click_object_by_css_selector('#interruptingMessage #interruptingMessageClose')

    def close_popup_with_accept(self):
        try:
            alert = self.driver.switch_to.alert
            alert.accept()
        except NoAlertPresentException:
            print('A <<NoAlertPresentException>> was thrown')
            pass

    def click_explore_sheets(self):
        self.click_object_by_css_selector('#homeSheets > div > div.textBox > a.inAppLink > div > span.int-en')

    def click_source_sheet_img(self):
        self.click_object_by_css_selector('#homeSheets > div > div.imageBox.bordered > a > img')

    def click_link_explorer_img(self):
        self.click_object_by_css_selector('#homeExplore > div > div.imageBox.bordered > a > img')

    def click_explore_connections(self):
        self.click_object_by_css_selector('#homeExplore > div > div.textBox > a > div > span.int-en')

    def click_learn_more_for_educators(self):
        self.click_object_by_css_selector('#homeEducators > div > div.textBox > a > div > span.int-en')

    def click_educators_img(self):
        self.click_object_by_css_selector('#homeEducators > div > div.imageBox.bordered > a > img')

    def click_more_metrics(self):
        self.click_object_by_css_selector('#moreMetrics > div > span.int-en')

    def click_make_a_donation(self):
        self.click_object_by_css_selector('#homeHelp > div > a > div > span.int-en')

    def click_subscribe(self):
        self.click_object_by_css_selector('#subscribe > span.int-en')

    def get_subscribe_msg(self):
        msg = self.get_object_txt_by_id('subscribeMsg')
        return msg

    def click_sidebar_nth_version_button(self, n):
        self.get_sidebar_nth_version_button(n).click()

    def get_sidebar_nth_version_button_text(self, n):
        return self.get_sidebar_nth_version_button(n).text

    def get_sidebar_nth_version_button(self, n):
        slctr = "#panel-1 > div.readerContent > div > div > div > div > div:nth-child(1) > div:nth-child(" + str(n+1) + ") > div.versionDetails > a.selectButton"
        return self.get_object_by_css_selector(slctr)

    def get_object_by_css_selector(self, selector):
        WebDriverWait(self.driver, TEMPER).until(
            element_to_be_clickable((By.CSS_SELECTOR, selector))
        )
        return self.driver.find_element_by_css_selector(selector)

    def type_in_mailing_list_email(self, str):
        self.type_in_text_box_by_id('mailingListEmail', str)

    def click_footer_link_by_id(self, link_id):
        WebDriverWait(self.driver, TEMPER).until(
            element_to_be_clickable((By.ID, link_id))
        )
        link = self.driver.find_element_by_id(link_id)
        link.click()

    def type_in_text_box_by_id(self, obj_id, txt_to_type):
        WebDriverWait(self.driver, TEMPER).until(
            element_to_be_clickable((By.ID, obj_id))
        )
        txt_box = self.driver.find_element_by_id(obj_id)
        txt_box.clear()
        txt_box.send_keys(txt_to_type)

    def get_object_by_id(self, obj_id):
        WebDriverWait(self.driver, TEMPER).until(
            element_to_be_clickable((By.ID, obj_id))
        )
        obj_to_return = self.driver.find_element_by_id(obj_id)
        return obj_to_return

    def click_library(self):
        self.click_object_by_css_selector('.headerNavSection .library, .readerNavMenuMenuButton')

    def click_what_in_sefaria_link(self):
        self.click_object_by_css_selector('div.section:nth-child(1) > a:nth-child(2) > span:nth-child(1)')

    def click_help_link(self):
        self.click_object_by_css_selector('div.section:nth-child(1) > a:nth-child(3) > span:nth-child(1)')

    def click_FAQ_link(self):
        self.click_object_by_css_selector('div.section:nth-child(1) > a:nth-child(4) > span:nth-child(1)')

    def click_Team_link(self):
        self.click_object_by_css_selector('div.section:nth-child(1) > a:nth-child(5) > span:nth-child(1)')

    def click_terms_of_use_link(self):
        self.click_object_by_css_selector('div.section:nth-child(1) > a:nth-child(6) > span:nth-child(1)')

    def click_privacy_policy_link(self):
        self.click_object_by_css_selector('div.section:nth-child(1) > a:nth-child(7) > span:nth-child(1)')

    def click_teach_with_sefaria_link(self):
        self.click_object_by_css_selector('#footerInner > div:nth-child(2) > a:nth-child(2) > span:nth-child(1)')

    def click_source_sheets_link(self):
        self.click_object_by_css_selector('#footerInner > div:nth-child(2) > a:nth-child(3) > span:nth-child(1)')

    def click_visualizations_link(self):
        self.click_object_by_css_selector('#footerInner > div:nth-child(2) > a:nth-child(4) > span:nth-child(1)')

    def click_authors_link(self):
        self.click_object_by_css_selector('#footerInner > div:nth-child(2) > a:nth-child(5) > span:nth-child(1)')

    def click_new_additions_link(self):
        self.click_object_by_css_selector('#footerInner > div:nth-child(2) > a:nth-child(6) > span:nth-child(1)')

    def click_get_involved_link(self):
        self.click_object_by_css_selector('#footerInner > div:nth-child(3) > a:nth-child(2) > span:nth-child(1)')

    def click_API_docs_link(self):
        self.click_object_by_css_selector('#footerInner > div:nth-child(3) > a:nth-child(3) > span:nth-child(1)')

    def click_fork_us_on_GitHub_link(self):
        self.click_object_by_css_selector('#footerInner > div:nth-child(3) > a:nth-child(4) > span:nth-child(1)')

    def click_download_our_data_link(self):
        self.click_object_by_css_selector('#footerInner > div:nth-child(3) > a:nth-child(5) > span:nth-child(1)')

    def click_donate_link(self):
        self.click_object_by_css_selector('#footerInner > div:nth-child(4) > a:nth-child(2) > span:nth-child(1)')

    def click_supporters_link(self):
        self.click_object_by_css_selector('#footerInner > div:nth-child(4) > a:nth-child(3) > span:nth-child(1)')

    def click_contribute_link(self):
        self.click_object_by_css_selector('#footerInner > div:nth-child(4) > a:nth-child(4) > span:nth-child(1)')

    def click_jobs_link(self):
        self.click_object_by_css_selector('#footerInner > div:nth-child(4) > a:nth-child(5) > span:nth-child(1)')

    def click_sidebar_facebook_link(self):
        self.click_object_by_css_selector('a.toolsButton:nth-child(2) > span:nth-child(2)')

    def click_facebook_link(self):
        self.click_object_by_css_selector('.last > a:nth-child(4) > span:nth-child(1)')

    def click_twitter_link(self):
        self.click_object_by_css_selector('.last > a:nth-child(5) > span:nth-child(1)')

    def click_sidebar_twitter_link(self):
        self.click_object_by_css_selector('a.toolsButton:nth-child(3) > span:nth-child(2)')

    def click_youtube_link(self):
        self.click_object_by_css_selector('.last > a:nth-child(7) > span:nth-child(1)')

    def click_blog_link(self):
        self.click_object_by_css_selector('.last > a:nth-child(8) > span:nth-child(1)')

    def click_instagram_link(self):
        self.click_object_by_css_selector('.last > a:nth-child(10) > span:nth-child(1)')

    def click_email_link(self):
        self.click_object_by_css_selector('.last > a:nth-child(11) > span:nth-child(1)')

    def click_sidebar_email_link(self):
        self.click_object_by_css_selector('a.toolsButton:nth-child(4) > span:nth-child(2)')

    def click_ivrit_link(self): # Named '..ivrit..' as the link's in Hebrew. Below - a method with '..hebrew..' (that calls this one), in case it's easier to locate that way
        self.click_object_by_link_text('עברית')

    def click_hebrew_link(self):
        self.click_ivrit_link()

    def click_english_link(self):
        self.click_object_by_link_text('English')

    def toggle_on_text_settings(self):
        self.click_object_by_css_selector('#panel-0 .readerControls .readerOptions')

    def toggle_off_text_settings(self):
        self.click_object_by_css_selector("#panel-0 .leftButtons > a")

    def toggle_language_english(self):
        self.click_object_by_css_selector('#panel-0 div.readerOptionsPanel div.toggleSet.language div.toggleOption.english')

    def toggle_language_bilingual(self):
        self.click_object_by_css_selector('#panel-0 div.readerOptionsPanel div.toggleSet.language div.toggleOption.bilingual')

    def toggle_language_hebrew(self):
        self.click_object_by_css_selector('#panel-0 div.readerOptionsPanel div.toggleSet.language div.toggleOption.hebrew')

    def toggle_bilingual_layout_stacked(self):
        self.click_object_by_css_selector('#panel-0 div.readerOptionsPanel div.toggleSet.biLayout div.toggleOption.stacked')

    def toggle_bilingual_layout_heLeft(self):
        self.click_object_by_css_selector('#panel-0 div.readerOptionsPanel div.toggleSet.biLayout div.toggleOption.heLeft')

    def toggle_bilingual_layout_heRight(self):
        self.click_object_by_css_selector('#panel-0 div.readerOptionsPanel div.toggleSet.biLayout div.toggleOption.heRight')

    def toggle_fontSize_smaller(self):
        self.click_object_by_css_selector('#panel-0 div.readerOptionsPanel div.toggleSet.fontSize div.toggleOption.smaller')

    def toggle_fontSize_larger(self):
        self.click_object_by_css_selector('#panel-0 div.readerOptionsPanel div.toggleSet.fontSize div.toggleOption.larger')

    def toggle_aliyotTorah_aliyotOn(self):
        self.click_object_by_css_selector('#panel-0 div.readerOptionsPanel div.toggleSet.aliyotTorah div.toggleOption.aliyotOn')

    def toggle_aliyotTorah_aliyotOff(self):
        self.click_object_by_css_selector('#panel-0 div.readerOptionsPanel div.toggleSet.aliyotTorah div.toggleOption.aliyotOff')

    def toggle_vowels_none(self):
        self.click_object_by_css_selector('#panel-0 div.readerOptionsPanel div.toggleSet.vowels div.toggleOption.none')

    def toggle_vowels_partial(self):
        self.click_object_by_css_selector('#panel-0 div.readerOptionsPanel div.toggleSet.vowels div.toggleOption.partial')

    def toggle_vowels_all(self):
        self.click_object_by_css_selector('#panel-0 div.readerOptionsPanel div.toggleSet.vowels div.toggleOption.all')

    def get_nth_section_english(self, n):
        selector = '#panel-0 > div.readerContent div.textRange.basetext > div.text > div > span:nth-child(' + str(n) + ') > div.segment > p.en'
        return self.get_nth_section(selector)

    def get_nth_section_hebrew(self, n):
        selector = '#panel-0 > div.readerContent div.textRange.basetext > div.text > div > span:nth-child(' + str(n) + ') > div.segment > p.he'
        return self.get_nth_section(selector)

    def get_content_layout_direction(self):
        panel = self.get_content_panel()
        panel_class = panel.get_attribute('class')
        if 'Right' in panel_class:
            return 'right'
        elif 'Left' in panel_class:
            return 'left'
        elif 'stacked' in panel_class:
            return 'stacked'

    def get_content_language(self):
        content_lang = self.get_content_panel()
        content_lang_class = content_lang.get_attribute('class')
        if 'bilingual' in content_lang_class:
            return 'bilingual'
        elif 'hebrew' in content_lang_class:
            return 'hebrew'
        elif 'english' in content_lang_class:
            return 'english'

    def get_login_link_text(self):
        ret = self.get_object_by_css_selector('#s2 div.headerInner div.headerLinksSection a.login.loginLink').text
        return ret

    def get_signup_link_text(self):
        ret = self.get_object_by_css_selector('#s2 div.headerInner div.headerLinksSection a.login.signupLink').text
        return ret

    def get_what_is_sefaria_link_text(self):
        ret = self.get_object_by_css_selector('#footerInner > div:nth-child(1) > a:nth-child(2)').text
        return ret

    def get_teach_with_sefaria_link_text(self):
        ret = self.get_object_by_css_selector('#footerInner > div:nth-child(2) > a:nth-child(2)').text
        return ret

    def get_get_involved_link_text(self):
        ret = self.get_object_by_css_selector('#footerInner > div:nth-child(3) > a:nth-child(2)').text
        return ret

    def get_donate_link_text(self):
        ret = self.get_object_by_css_selector('#footerInner > div:nth-child(4) > a:nth-child(2)').text
        return ret

    def get_facebook_link_text(self):
        ret = self.get_object_by_css_selector('#footerInner > div.section.last.connect > a:nth-child(4)').text
        return ret

    def get_sefaria_lib_title(self):
        return self.get_object_by_css_selector('#panel-undefined h1, .singlePanel h1').text

    def get_font_size(self):
        size = self.get_nth_section_hebrew(1).value_of_css_property("font-size")
        return float(size.replace('px',''))

    def get_current_url(self):
        return self.driver.current_url

    def get_current_content_title(self):
        return self.get_object_by_css_selector('#panel-0 div.readerControls.fullPanel div.readerTextToc > div > a').text

    def is_aliyot_displayed(self):
        time.sleep(.5)
        return self.is_object_displayed("#panel-0 > div.readerContent > div > div:nth-child(3) > div.text > div > span:nth-child(4) > div.parashahHeader.aliyah")

    def is_aliyot_toggleSet_displayed(self):
        return self.is_object_displayed("div[class='toggleSet aliyotTorah']")

    def is_vocalization_toggleSet_displayed(self):
        return self.is_object_displayed("div[class='toggleSet vowels']")

    def is_sidebar_browse_title_displayed(self):
        return self.is_object_displayed('#panel-1 > div > div.content > div > div:nth-child(2) > h2 > span.int-en')

    def is_sidebar_calendar_title_displayed(self):
        return self.is_object_displayed('#panel-1 > div > div.content > div > div:nth-child(3) > h2 > span.int-en')

    def is_object_displayed(self, css_selector):
        try:
            aliyot = self.driver.find_element_by_css_selector(css_selector)
            return True # would through an exception otherwise, handled below
        except NoSuchElementException:
            return False

    def get_content_panel(self):
        selector = '#panel-0'
        WebDriverWait(self.driver, TEMPER).until(
            presence_of_element_located((By.CSS_SELECTOR, selector))
        )
        elm = self.driver.find_element_by_css_selector(selector)
        return elm

    def get_nth_section(self, selector):
        WebDriverWait(self.driver, TEMPER).until(
            presence_of_element_located((By.CSS_SELECTOR, selector))
        )
        section = self.driver.find_element_by_css_selector(selector)
        return section

    def click_object_by_css_selector(self, selector):
        WebDriverWait(self.driver, TEMPER).until(
            presence_of_element_located((By.CSS_SELECTOR, selector))
        )
        btn = self.driver.find_element_by_css_selector(selector)
        btn.click()

    def click_object_by_id(self, id):
        WebDriverWait(self.driver, TEMPER).until(
            presence_of_element_located((By.ID, id))
        )
        obj_to_click = self.driver.find_element_by_id(id)
        obj_to_click.click()

    def get_object_txt_by_id(self, id):
        WebDriverWait(self.driver, TEMPER).until(
            presence_of_element_located((By.ID, id))
        )
        obj = self.driver.find_element_by_id(id)
        return obj.text

    def get_object_by_link_text(self, link_txt):
        WebDriverWait(self.driver, TEMPER).until(
            element_to_be_clickable((By.LINK_TEXT, link_txt))
        )
        ret = self.driver.find_element_by_link_text(link_txt)
        return ret

    def click_object_by_link_text(self, link_txt):
        self.driver.execute_script("scroll(250, 0)")
        self.driver.execute_script("scroll(0, 250)")
        WebDriverWait(self.driver, TEMPER).until(
            element_to_be_clickable((By.LINK_TEXT, link_txt))
        )
        obj_to_click = self.driver.find_element_by_link_text(link_txt)
        obj_to_click.click()

    def click_sidebar_entry(self, data_name):
        selector = "div[class='categoryFilter'][data-name='" + data_name + "']"
        WebDriverWait(self.driver, TEMPER).until(
            presence_of_element_located((By.CSS_SELECTOR, selector))
        )
        sidebar_entry = self.driver.find_element_by_css_selector(selector)
        sidebar_entry.click()

    def click_android_app(self):
        self.click_object_by_css_selector('#homeMobile > div > div.textBox > a:nth-child(3) > div > span.int-en')

    def click_ios_app(self):
        self.click_object_by_css_selector('#iOSButton > div > span.int-en')

    def close_tab_and_return_to_prev_tab(self):
        self.driver.switch_to_window(self.driver.window_handles[1])
        self.driver.close()
        self.driver.switch_to_window(self.driver.window_handles[0])

    def get_newly_opened_tab_url(self):
        self.driver.switch_to_window(self.driver.window_handles[1])
        time.sleep(2)#page needs to load, as this should work for any page - no specific element to wait on
        new_url = self.driver.current_url
        self.driver.switch_to_window(self.driver.window_handles[0])
        return new_url

    def get_section_txt(self, vrs):
        verse_selector = '#panel-0 div.readerContent div.textRange.basetext > div.text > div > span:nth-child(' + vrs + ') > div > p.he'
        WebDriverWait(self.driver, TEMPER).until(
            element_to_be_clickable((By.CSS_SELECTOR, verse_selector))
        )
        verse = self.driver.find_element_by_css_selector(verse_selector)
        verse_txt = verse.get_attribute('innerHTML')
        return verse_txt

    def click_masechet_and_chapter(self, masechet, cptr):
        #The Masechtot and Chapters 1 based index
        masechet_selector = 'div.content div div:nth-child(3) div div.tocContent div.tocLevel div:nth-child(' + masechet + ') span span.en i'
        chapter_selector = 'div.content div div:nth-child(3) div div.tocContent div.tocLevel div:nth-child(' + masechet + ') div a:nth-child(' + cptr + ')'

        WebDriverWait(self.driver, TEMPER).until(
            element_to_be_clickable((By.CSS_SELECTOR, masechet_selector))
        )
        masechet_arrow = self.driver.find_element_by_css_selector(masechet_selector)
        masechet_arrow.click()

        WebDriverWait(self.driver, TEMPER).until(
            element_to_be_clickable((By.CSS_SELECTOR, chapter_selector))
        )
        chapter = self.driver.find_element_by_css_selector(chapter_selector)
        chapter.click()

    # Text Panel
    def click_toc_from_text_panel(self):
        self.driver.find_element_by_css_selector(".readerTextTocBox a").click()
        WebDriverWait(self.driver, TEMPER).until(
            element_to_be_clickable((By.CSS_SELECTOR, ".tocContent > :not(.loadingMessage)")))

    def search_ref(self, ref):
        if isinstance(ref, str):
            ref = Ref(ref)
        assert isinstance(ref, Ref)
        self.type_in_search_box(ref.normal())
        time.sleep(.5)  # Old page may have an element that matches the selector below.  Wait for it to go away.
        WebDriverWait(self.driver, TEMPER).until(
            element_to_be_clickable((By.CSS_SELECTOR, ".textColumn .textRange .segment")))
        WebDriverWait(self.driver, TEMPER).until(visibility_of_any_elements_located((By.CSS_SELECTOR, ".linkCountDot")))
        time.sleep(.5)  # Something takes a moment here.  Not sure what to wait for.
        return self

    def browse_to_ref(self, ref):
        if isinstance(ref, str):
            ref = Ref(ref)
        assert isinstance(ref, Ref)

        index = ref.index
        categories = self._get_clickpath_from_categories(index.categories)
        self.nav_to_text_toc(categories, index.title)

        # Logic for what is displayed lives on SchemaNode under TextTableOfContentsNavigation
        section_ref = ref.section_ref()
        index_node = ref.index_node
        assert isinstance(index_node, SchemaNode)

        if index.is_complex() and index_node.parent != index.nodes:
            ancestors = index_node.ancestors()
            for ancestor in ancestors[1:]:
                self.open_text_toc_menu(ancestor.ref())

        self.click_text_toc_section(section_ref)
        return self

    @staticmethod
    def _get_clickpath_from_categories(cats):
        """
        Returns the category clickpath, from TOC root, for cats as presented on an Index
        :param cats:
        :return:
        """
        # The logic that we're following here is implemented on ReaderNavigationCategoryMenuContents
        # Cats which normally would nest, but are special cased to be subcats.
        special_subcats = ["Mishneh Torah", "Shulchan Arukh", "Maharal"]

        click_cats = []
        for i, cat in enumerate(cats):
            if i == 0:
                click_cats += [cat]
            if cat in special_subcats:
                click_cats += [cat]
            if cat == "Commentary":
                click_cats += [cats[i + 1]]

        return click_cats

    # Todo: handle the case when the loaded page has different URL - because of scroll
    def load_ref(self, ref, filter=None, lang=None):
        """
        takes string ref or object Ref
        :param ref:
        :param filter: "all", "Rashi", etc
        :return:
        """
        if isinstance(ref, str):
            ref = Ref(ref)
        assert isinstance(ref, Ref)
        url = self.base_url + "/" + ref.url()
        if filter is not None:
            url += "&with={}".format(filter)
        if lang is not None:
            url += "&lang={}".format(lang)
        self.driver.get(url.replace("&", "?", 1))
        if filter == "all":
            WebDriverWait(self.driver, TEMPER).until(element_to_be_clickable((By.CSS_SELECTOR, ".categoryFilter")))
        elif filter is not None:
            # Filters load slower than the main page
            WebDriverWait(self.driver, TEMPER).until(element_to_be_clickable((By.CSS_SELECTOR, ".filterSet > .textRange")))
        else:
            WebDriverWait(self.driver, TEMPER).until(
                element_to_be_clickable((By.CSS_SELECTOR, ".textColumn .textRange .segment")))
            WebDriverWait(self.driver, TEMPER).until(visibility_of_any_elements_located((By.CSS_SELECTOR, ".linkCountDot")))
        self.set_modal_cookie()
        return self

    def nav_to_text_toc(self, cats, text_title):
        """
        :param cats: list of categories to click before text is visible (may not be entire category path to text)
        :param text: name of text to click
        :return:
        """
        self.nav_to_toc()
        for cat in cats:
            self.click_toc_category(cat)
        self.click_toc_text(text_title)
        self.click_toc_from_text_panel()
        return self

    def load_text_toc(self, ref):
        if isinstance(ref, str):
            ref = Ref(ref)
        assert isinstance(ref, Ref)
        url = self.base_url + "/" + ref.url()
        self.driver.get(url)
        WebDriverWait(self.driver, TEMPER).until(
            element_to_be_clickable((By.CSS_SELECTOR, ".tocContent > :not(.loadingMessage)")))
        self.set_modal_cookie()
        return self

    def click_text_toc_section(self, ref):
        if isinstance(ref, str):
            ref = Ref(ref)
        assert isinstance(ref, Ref)
        p1 = self.driver.find_element_by_css_selector('.sectionLink[data-ref="{}"], .schema-node-toc[data-ref="{}"]'.format(ref.normal(), ref.normal()))
        p1.click()
        WebDriverWait(self.driver, TEMPER).until(
            element_to_be_clickable((By.CSS_SELECTOR, '.segment'))
        )
        return self

    def open_text_toc_menu(self, ref):
        if isinstance(ref, str):
            ref = Ref(ref)
        assert isinstance(ref, Ref)
        p1 = self.driver.find_element_by_css_selector('.schema-node-toc[data-ref="{}"]>span'.format(ref.normal()))
        p1.click()
        time.sleep(.5)    # Takes some time to reload, and not sure what next page is
        return self

    # todo:
    def load_refs(self):
        pass

    def click_segment(self, ref):
        if isinstance(ref, str):
            ref = Ref(ref)
        assert isinstance(ref, Ref)
        self._perform_segment_click(ref)
        # Todo: put a data-* attribute on .filterSet, for the multi-panel case
        # Note below will fail if there are no connections
        WebDriverWait(self.driver, TEMPER).until(element_to_be_clickable((By.CSS_SELECTOR, ".categoryFilter")))
        return self

    def click_segment_to_close_commentary(self, ref):
        if isinstance(ref, str):
            ref = Ref(ref)
        assert isinstance(ref, Ref)
        self._perform_segment_click(ref)

    def _perform_segment_click(self, ref):
        selector = '.segment[data-ref="{}"]'.format(ref.normal())
        WebDriverWait(self.driver, TEMPER).until(presence_of_element_located((By.CSS_SELECTOR, selector)))
        segment = self.driver.find_element_by_css_selector(selector)
        segment.click()

    # Basic navigation
    def back(self):
        # These may not work as expected...
        self.driver.back()
        return self

    def forward(self):
        # These may not work as expected...
        self.driver.forward()
        return self

    # Scrolling
    def scroll_window_down(self, pixels):
        self.driver.execute_script("window.scrollBy(0,{});".format(pixels))
        return self

    def scroll_window_up(self, pixels):
        self.driver.execute_script("window.scrollBy(0,{});".format(-pixels))
        return self

    def scroll_window_to_bottom(self):
        self.driver.execute_script("window.scrollTo(0, document.body.scrollHeight);")
        return self

    def scroll_reader_panel_down(self, pixels):
        # todo: untested
        # todo: handle multiple panels
        self.driver.execute_script(
            "var a = document.getElementsByClassName('textColumn')[0]; a.scrollTop = a.scrollTop + {};".format(pixels)
        )
        return self

    def scroll_reader_panel_up(self, pixels):
        # todo: untested
        # todo: handle multiple panels
        self.driver.execute_script(
            "var a = document.getElementsByClassName('textColumn')[0]; a.scrollTop = a.scrollTop - {};".format(pixels)
        )
        return self

    def scroll_reader_panel_to_bottom(self):
        # todo: untested
        # todo: handle multiple panels
        # jiggle the screen after scrolling to coerce the next section to load
        self.driver.execute_script(
            "var a = document.getElementsByClassName('textColumn')[0]; a.scrollTop = a.scrollHeight; setTimeout(function() { a.scrollTop = a.scrollHeight - 700; }, 100);"
        )
        return self

    def scroll_reader_panel_to_top(self):
        """Scrolls the first text panel to the top"""
        # todo
        return self

    def scroll_to_segment(self, ref):
        if isinstance(ref, str):
            ref = Ref(ref)
        assert isinstance(ref, Ref)
        # todo
        return self

    def scroll_nav_panel_to_bottom(self):
        # todo: handle multiple panels
        self.driver.execute_script(
            "var a = document.getElementsByClassName('content')[0]; a.scrollTop = a.scrollHeight;"
        )
        return self

    # Connections Panel
    def find_category_filter(self, name):
        WebDriverWait(self.driver, TEMPER).until(
            element_to_be_clickable((By.CSS_SELECTOR, '.categoryFilter[data-name="{}"]'.format(name))))
        return self.driver.find_element_by_css_selector('.categoryFilter[data-name="{}"]'.format(name))

    def find_text_filter(self, name):
        WebDriverWait(self.driver, TEMPER).until(
            element_to_be_clickable((By.CSS_SELECTOR, '.textFilter[data-name="{}"]'.format(name))))
        return self.driver.find_element_by_css_selector('.textFilter[data-name="{}"]'.format(name))

    def click_category_filter(self, name):
        f = self.find_category_filter(name)
        assert f, "Can not find text filter {}".format(name)
        f.click()
        WebDriverWait(self.driver, TEMPER).until(
            element_to_be_clickable((By.CSS_SELECTOR, '.categoryFilterGroup.withBooks'))
        )
        return self

    def click_text_filter(self, name):
        f = self.find_text_filter(name)
        assert f, "Can not find text filter {}".format(name)
        f.click()
        WebDriverWait(self.driver, TEMPER).until(
            element_to_be_clickable((By.CSS_SELECTOR, '.recentFilterSet'))
        )
        return self

    # Search
    def load_search_url(self, query=None):
        url = self.base_url + "/search"
        if query is not None:
            url += "?q={}".format(query)
        self.driver.get(url)
        WebDriverWait(self.driver, TEMPER).until(element_to_be_clickable((By.CSS_SELECTOR, ".type-button-title")))
        self.set_modal_cookie()
        return self

    def search_for(self, query):
        # This one is for searches that produce search results, not navigations
        WebDriverWait(self.driver, TEMPER).until(element_to_be_clickable((By.CSS_SELECTOR, "#searchInput")))
        elem = self.driver.find_element_by_css_selector("#searchInput")
        elem.send_keys(query)
        elem.send_keys(Keys.RETURN)
        # todo: does this work for a second search?
        WebDriverWait(self.driver, TEMPER).until(element_to_be_clickable((By.CSS_SELECTOR, ".result")))
        return self

    def type_in_search_box(self, query):
        WebDriverWait(self.driver, TEMPER).until(element_to_be_clickable((By.CSS_SELECTOR, "#searchInput")))
        elem = self.driver.find_element_by_css_selector("#searchInput")
        elem.send_keys(query)
        elem.send_keys(Keys.RETURN)
        return self

    def load_sheets(self):
        self.driver.get(self.base_url + "/sheets")
        WebDriverWait(self.driver, TEMPER).until(element_to_be_clickable((By.CSS_SELECTOR, ".readerSheetsNav")))
        self.set_modal_cookie()
        return self

    def load_gardens(self):
        self.driver.get(self.base_url + "/garden/jerusalem")
        WebDriverWait(self.driver, TEMPER).until(
            element_to_be_clickable((By.CSS_SELECTOR, "#filter-1 g.row")))  # individual filter row
        WebDriverWait(self.driver, TEMPER).until(
            element_to_be_clickable((By.CSS_SELECTOR, ".dc-grid-item .result-text .en")))  # individual result text
        return self

    def load_home(self):
        self.driver.get(self.base_url + "/?home")
        WebDriverWait(self.driver, TEMPER).until(element_to_be_clickable((By.CSS_SELECTOR, ".header")))
        return self

    def load_people(self):
        self.driver.get(self.base_url + "/people")
        WebDriverWait(self.driver, TEMPER).until(element_to_be_clickable((By.CSS_SELECTOR, ".author")))

        self.driver.get(self.base_url + "/person/Meir%20Abulafia")
        WebDriverWait(self.driver, TEMPER).until(element_to_be_clickable((By.CSS_SELECTOR, "#place-map")))
        return self

    def load_notifications(self):
        self.driver.get(self.base_url + "/notifications")
        WebDriverWait(self.driver, TEMPER).until(
            element_to_be_clickable((By.CSS_SELECTOR, ".notificationsList > .notification")))
        return self

    def load_private_sheets(self):
        self.driver.get(self.base_url + "/sheets/private")
        WebDriverWait(self.driver, TEMPER).until(element_to_be_clickable((By.CSS_SELECTOR, ".sheet")))
        return self

    def load_private_groups(self):
        self.driver.get(self.base_url + "/my/groups")
        WebDriverWait(self.driver, TEMPER).until(presence_of_element_located((By.CSS_SELECTOR, ".groupsList")))
        return self

    # Editing
    def load_translate(self, ref):
        if isinstance(ref, str):
            ref = Ref(ref)
        assert isinstance(ref, Ref)
        url = self.base_url + "/translate/" + ref.url()
        self.driver.get(url)
        WebDriverWait(self.driver, TEMPER).until(element_to_be_clickable((By.CSS_SELECTOR, "#newVersion")))
        return self

    def load_edit(self, ref, lang, version):
        if isinstance(ref, str):
            ref = Ref(ref)
        assert isinstance(ref, Ref)
        url = self.base_url + "/edit/" + ref.url() + "/" + lang + "/" + version.replace(" ", "_")
        self.driver.get(url)
        WebDriverWait(self.driver, TEMPER).until(element_to_be_clickable((By.CSS_SELECTOR, "#newVersion")))
        return self

    def load_add(self, ref):
        if isinstance(ref, str):
            ref = Ref(ref)
        assert isinstance(ref, Ref)
        url = self.base_url + "/add/" + ref.url()
        self.driver.get(url)
        WebDriverWait(self.driver, TEMPER).until(element_to_be_clickable((By.CSS_SELECTOR, "#newVersion")))
        return self


class TestSuite(AbstractTest):
    def __init__(self, driver, url, cap, seed=None, mode=None, root_test=True, **kwargs):
        super(TestSuite, self).__init__(driver, url, cap, root_test=root_test, **kwargs)
        self.mode = mode
        self.tests = [t(self.driver, self.base_url, self.cap) for t in get_ordered_atomic_tests(seed) if t.suite_class == self.__class__ and t._should_run(self.mode, self.cap)]
        self.result_set = TestResultSet()

    def __str__(self):
        return self.name()

    def should_run(self, mode):
        return len(self.tests)

    def long_name(self):
        return "{}\n{}".format(self.name(), self.tests_string())

    def tests_string(self):
        return ", ".join([t.__class__.__name__ for t in self.tests])

    def setup(self):
        pass

    def teardown(self):
        pass

    def run(self):
        self.carp("\n{}\n".format(str(self)), always=True)

        try:
            self.setup()
        except Exception:
            msg = "Exception in {}.setup()\n{}".format(self.name(), traceback.format_exc())
            self.carp(msg, always=True)
            return SingleTestResult(self.__class__, self.cap, False, msg)

        max = None
        for i, test in enumerate(self.tests):
            self.carp(" * Enter {}:{}\n".format(self.name(), test.__class__.__name__))
            result = test.run()
            result.order = i
            result.suite = self
            self.result_set.include(result)
            max = i

        try:
            self.teardown()
        except Exception:
            msg = "Exception in {}.teardown()\n{}".format(self.name(), traceback.format_exc())
            self.carp(msg, always=True)
            result = SingleTestResult(self.__class__, self.cap, False, msg)
            result.order = max + 1
            result.suite = self
            self.result_set.include(result)

        return self.result_set


class AtomicTest(AbstractTest):
    """
    Abstract Class
    AtomicTests are designed to be composed in any order, so as to test a wide range of orders of events
    A concrete AtomicTest implements the run method.
    """
    suite_class = None  # A subclass of TestSuite

    def __init__(self, driver, url, cap, root_test=False, **kwargs):
        super(AtomicTest, self).__init__(driver, url, cap, root_test=root_test, **kwargs)
        if not self.suite_class:
            raise Exception("Missing required variable - suite_class")
        if not issubclass(self.suite_class, TestSuite):
            raise Exception("suite_class must be a child of TestSuite")
        if not self.multi_panel and not self.single_panel:
            raise Exception("Tests must run on at least one of mobile or desktop")
        if len(self.include) and len(self.exclude):
            raise Exception("Only one of the 'include' and 'exclude' parameters can be used in a given test")

    def should_run(self, mode):
        return self._should_run(mode, self.cap)

    def setup(self):
        """
        Only run when test is root.  Can be overridden at test class level.
        :return:
        """
        #self.driver.maximize_window()
        try:
            self.driver.set_window_size(900, 1100)
        except WebDriverException:
            pass
        self.load_toc()

    def teardown(self):
        """
        Only run when test is root
        :return:
        """
        pass

    def run(self):
        err = None
        if self.is_root:
            try:
                self.setup()
            except Exception:
                msg = "Exception in {}.setup()\n{}".format(self.name(), traceback.format_exc())
                self.carp(msg, always=True)
                return SingleTestResult(self.__class__, self.cap, False, msg)

        try:
            self.carp("{} - Starting\n".format(self.name()))
            self.driver.execute_script('"**** Enter {} ****"'.format(self.name()))
            self.body()
            self.driver.execute_script('"**** Exit {} ****"'.format(self.name()))
        except Exception:
            err = traceback.format_exc()
            result = SingleTestResult(self.__class__, self.cap, False, err)
        else:
            result = SingleTestResult(self.__class__, self.cap, True)

        if self.is_root:
            try:
                self.teardown()
            except Exception:
                msg = "Exception in {}.teardown()\n{}".format(self.name(), traceback.format_exc())
                self.carp(msg, always=True)

        self.carp("{} - {}\n".format(result.word_status(), self.name()), always=not result.success)
        if err:
            self.carp(err, always=True)

        return result

    def body(self):
        raise Exception("body() needs to be defined for each test.")

"""

                    Test Running Infrastructure

        Result Codes:
        . - pass
        F - Fail
        A - Abort
        E - Error
        / - Partial fail (for suites)

"""


class AbstractTestResult(object):
    def word_status(self):
        pass

    def letter_status(self):
        pass

    @property
    def message(self):
        return ""

    @property
    def success(self):
        return ""

    @property
    def cap(self):
        return ""


class SingleTestResult(AbstractTestResult):
    def __init__(self, test_class, cap, success, message=""):
        assert isinstance(success, bool)
        assert issubclass(test_class, AbstractTest)

        self.test_class = test_class
        self.className = self.test_class.__name__
        self.order = 0  # Used to track run order on a suite
        self.suite = None
        self._cap = cap
        self._success = success
        self._message = message

    def __str__(self):
        return "{} - {} on {}{}".format(
            self.word_status(),
            self.className,
            Trial.cap_to_string(self.cap),
            ": \n{}".format(self.message) if self.message else ""
        )

    def order_id(self):
        ret = ''
        if self.suite is not None:
            ret += self.suite.__class__.__name__
        ret += format(self.order, '03')
        return ret

    def word_status(self):
        return "Passed" if self.success else "Failed"

    def letter_status(self):
        return "." if self.success else "F"

    @property
    def message(self):
        return self._message

    @property
    def success(self):
        return self._success

    @property
    def cap(self):
        return self._cap


class TestResultSet(AbstractTestResult):
    def __init__(self, results=None):
        """
        :param results: list of SingleTestResult objects, or a list of lists
        :return:
        """
        self._aggregated = False
        self._test_results = [] if results is None else results
        assert (isinstance(t, SingleTestResult) for t in self._test_results)
        self._indexed_tests = {}

    def __str__(self):
        return "\n\n" + "\n".join([str(r) for r in self._test_results]) + "\n\n"

    @property
    def message(self):
        return ""

    @property
    def success(self):
        return not bool(self.number_failed())

    @property
    def cap(self):
        # Contained test results can have different caps, but in some contexts, they all have the same one.
        # Use carefully
        if len(self._test_results):
            return self._test_results[0].cap
        else:
            return ""

    def include(self, result):
        self._aggregated = False
        if isinstance(result, SingleTestResult):
            self._test_results.append(result)
        elif isinstance(result, list):
            for res in result:
                if res is not None:
                    self.include(res)
        elif isinstance(result, TestResultSet):
            self._test_results += result._test_results

    def word_status(self):
        p = self.number_passed()
        f = self.number_failed()
        if p and f:
            return "Mixed"
        elif p:
            return "Passed"
        elif f:
            return "Failed"
        else:
            return "Empty"

    def letter_status(self):
        p = self.number_passed()
        f = self.number_failed()
        if p and f:
            return "/"
        elif p:
            return "."
        elif f:
            return "F"
        else:
            return "0"

    def number_passed(self):
        return len([t for t in self._test_results if t.success])

    def number_failed(self):
        return len([t for t in self._test_results if not t.success])

    def _aggregate(self):
        if not self._aggregated:
            for res in self._test_results:
                self._indexed_tests[(res.test_class, Trial.cap_to_short_string(res.cap))] = res
            self._aggregated = True

    def _sorted_test_classes(self):
        test_classes = {res.test_class for res in self._test_results}

        # all tests for each class
        tests_per_class = {cls: [r for r in self._test_results if r.test_class == cls] for cls in test_classes}

        # map of class to rank
        class_rank = {cls: max([t.order_id() for t in tests_per_class[cls]]) for cls in test_classes}
        sorted_classes = sorted(test_classes, key=class_rank.get)
        return sorted_classes

    def _results_as_matrix(self):
        self._aggregate()
        sorted_test_classes = self._sorted_test_classes()

        caps = list({Trial.cap_to_short_string(res.cap) for res in self._test_results})

        def text_result(test, cap):
            res = self._indexed_tests.get((test, cap))
            if res is None:
                return "s"
            if res.success is True:
                return "."
            if res.success is False:
                return "Fail"

        current_suite = None

        results = []
        for test in sorted_test_classes:
            if getattr(test, "suite_class", None) and test.suite_class != current_suite:
                results += [[""] * (len(caps) + 1)]
                results += [[" ** " + test.suite_class.__name__] + caps]
                current_suite = test.suite_class
            results += [[test.__name__] + [text_result(test, cap) for cap in caps]]
        return results

    def report(self):
        ret = "\n"

        # http://stackoverflow.com/a/13214945/213042
        matrix = self._results_as_matrix()
        s = [[str(e) for e in row] for row in matrix]
        lens = [max(list(map(len, col))) for col in zip(*s)]
        fmt = ' '.join('{{:{}}}'.format(x) for x in lens)
        table = [fmt.format(*row) for row in s]
        ret += '\n'.join(table)

        total_tests = len(self._test_results)
        passed_tests = self.number_passed()
        percentage_passed = (float(passed_tests) / total_tests) * 100 if total_tests > 0 else 0
        ret += "\n\n{}/{} - {:.0f}% passed\n".format(passed_tests, total_tests, percentage_passed)

        if passed_tests < total_tests:
            for failed_test in [t for t in self._test_results if not t.success]:
                ret += "\n\n{}\n".format(str(failed_test))

        return ret


class Trial(object):

    default_local_driver = webdriver.Chrome
    # default_local_driver = webdriver.Firefox
    # default_local_driver = webdriver.Safari
    def __init__(self, platform="local", build=None, tests=None, caps=None, parallel=None, verbose=False):
        """
        :param caps: If local: webdriver classes, if remote, dictionaries of capabilities
        :param platform: "sauce", "bstack", "local", "travis"
        :return:
        """
        assert platform in ["sauce", "bstack", "local", "travis"]
        if platform == "travis":
            global SAUCE_USERNAME, SAUCE_ACCESS_KEY
            SAUCE_USERNAME = os.getenv('SAUCE_USERNAME')
            SAUCE_ACCESS_KEY = os.getenv('SAUCE_ACCESS_KEY')
            self.BASE_URL = LOCAL_URL
            self.caps = caps if caps else SAUCE_CORE_CAPS
            for cap in self.caps:
                cap["tunnelIdentifier"] = os.getenv('TRAVIS_JOB_NUMBER')
            self.is_local = False
            platform = "sauce"  # After this initial setup - use the sauce platform
        elif platform == "local":
            self.is_local = True
            self.BASE_URL = LOCAL_URL
            self.caps = caps if caps else [self.default_local_driver]
        elif platform == "sauce":
            self.is_local = False
            self.BASE_URL = LOCAL_URL
            self.caps = caps if caps else SAUCE_CORE_CAPS
        else:
            self.is_local = False
            self.BASE_URL = REMOTE_URL
            self.caps = caps if caps else BS_CAPS
        self.isVerbose = verbose
        self.platform = platform
        self.build = build
        self.tests = get_every_build_tests(get_suites()) if tests is None else tests
        self.seed = random.random()
        self._results = TestResultSet()
        self.parallel = parallel if parallel is not None else False if self.is_local else True
        if self.parallel:
            self.thread_count = BS_MAX_THREADS if self.platform == "bstack" else SAUCE_MAX_THREADS

    def _get_driver(self, cap=None):
        """
        :param cap: If remote, cap is a dictionary of capabilities.
                    If local, it's a webdriver class
        :return:
        """
        if self.platform == "local":
            cap = cap if cap else self.default_local_driver
            if isinstance(cap, appium_webdriver.Remote):
                driver = cap
            else:
                driver = cap()
        elif self.platform == "sauce":
            assert cap is not None
            if cap.get("appiumVersion") is not None:
                driver = appium_webdriver.Remote(
                    command_executor='http://{}:{}@ondemand.saucelabs.com:80/wd/hub'.format(SAUCE_USERNAME, SAUCE_ACCESS_KEY),
                    desired_capabilities=cap)
            else:
                driver = webdriver.Remote(
                    command_executor='http://{}:{}@ondemand.saucelabs.com:80/wd/hub'.format(SAUCE_USERNAME, SAUCE_ACCESS_KEY),
                    desired_capabilities=cap)
        elif self.platform == "bstack":
            assert cap is not None
            driver = webdriver.Remote(
                command_executor='http://{}:{}@hub.browserstack.com:80/wd/hub'.format(BS_USER, BS_KEY),
                desired_capabilities=cap)
        else:
            raise Exception("Unrecognized platform: {}".format(self.platform))

        return driver

    def _test_one(self, test_class, cap):
        """

        :param test_class:
        :param cap:
        :return:
        """
        driver = None
        if self.is_local:
            if isinstance(cap, appium_webdriver.Remote):
                mode = "single_panel"
            else:
                mode = "multi_panel"  # Assuming that local isn't single panel
        else:
            mode = cap.get("sefaria_mode")
            cap.update({
                'name': "{} on {}".format(test_class.__name__, self.cap_to_string(cap)),
                'build': self.build,
            })

        try:
            driver = self._get_driver(cap)
            test_instance = test_class(driver, self.BASE_URL, cap, root_test=True, mode=mode, seed=self.seed, verbose=self.isVerbose)

            if not test_instance.should_run(mode):
                return None

            result = test_instance.run()

            if self.platform == "sauce":
                self.set_sauce_result(driver, result.success)

            if not self.is_local:
                driver.quit()
            return result

        except Exception as e:
            # Test errors are caught before this.
            # An exception at this level means that the infrastructure erred.

            msg = traceback.format_exc()
            if self.isVerbose:
                self.carp("{} / {} - Aborted\n{}\n".format(test_class.__name__, Trial.cap_to_string(cap), msg))
            else:
                self.carp("A")

            if driver is not None:
                try:
                    driver.quit()
                except Exception as e2:
                    pass
            return SingleTestResult(test_class, cap, False, msg)

    def _test_on_all(self, test_class, _caps=None):
        """
        Given a test, test it on all browsers
        :param test_class:
        :param _caps: Used on recursive run to retest failing caps
        :return:
        """
        result_set = TestResultSet()
        caps = _caps or self.caps
        self.carp("\n{}: ".format(test_class.__name__))
        exception_thrown = False
        is_first_test = _caps is None
        is_second_test = _caps is not None

        tresults = []  # list of AbstractTest instances
        if self.parallel:
            p = Pool(self.thread_count)
            l = len(caps)
            try:
                tresults = p.map(_test_one_worker, list(zip([self] * l, [test_class] * l, caps)))
            except Exception:
                msg = traceback.format_exc()
                self.carp("{} - Exception\n{}\n".format(test_class.__name__, msg), always=True)
                tresults += [SingleTestResult(test_class, caps[0], False, msg)]
                exception_thrown = True
        else:
            for cap in caps:
                tresults.append(self._test_one(test_class, cap))

        result_set.include([t for t in tresults if t and t.success])
        failing_results = [t for t in tresults if t and not t.success]

        # test failures twice, in order to avoid false failures
        if exception_thrown and is_first_test:
            self.carp("\nRetesting all configurations on {}: ".format(test_class.__name__), always=True)
            second_test_results = self._test_on_all(test_class, caps)
            result_set.include(second_test_results)
        elif len(failing_results) > 0 and is_first_test:
            self.carp("\nRetesting {} configurations on {}: ".format(len(failing_results), test_class.__name__), always=True)
            second_test_results = self._test_on_all(test_class, [t.cap for t in failing_results])
            result_set.include(second_test_results)
        elif is_second_test:
            result_set.include(failing_results)
        return result_set

    def run(self):
        for test in self.tests:
            self._results.include(self._test_on_all(test))
        return self

    def results(self):
        return self._results

    def carp(self, msg, short_msg="", always=False):
        sys.stdout.write(msg if self.isVerbose or always else short_msg)
        sys.stdout.flush()

    @staticmethod
    def set_sauce_result(driver, result):
        sauce_result = "passed" if result else "failed"
        driver.execute_script("sauce:job-result={}".format(sauce_result))

        """
        base64string = base64.encodebytes(b'%s:%s' % (SAUCE_USERNAME, SAUCE_ACCESS_KEY))[:-1]

        def set_test_status(jobid, passed=True):
            body_content = json.dumps({"passed": passed})
            connection = http.client.HTTPConnection("saucelabs.com")
            connection.request('PUT', '/rest/v1/%s/jobs/%s' % (SAUCE_USERNAME, jobid),
                               body_content,
                               headers={"Authorization": "Basic %s" % base64string})
            result = connection.getresponse()
            return result.status == 200

        set_test_status(driver.session_id, passed=result)
        return result
        """

    @staticmethod
    def cap_to_string(cap):
        if inspect.isclass(cap):
            return cap.__module__.split(".")[-2]
        if isinstance(cap, webdriver.Remote):
            cap = cap.capabilities
        return (cap.get("deviceName") or  # sauce mobile
                cap.get("device") or  # browserstack mobile
                ("{} {} on {} {}".format(cap.get("browser"), cap.get("browser_version"), cap.get("os"), cap.get("os_version")) if cap.get("browser") else  # browserstack desktop
                "{} {} on {}".format(cap.get('browserName'), cap.get("version"), cap.get('platform'))))  # sauce desktop

    @staticmethod
    def cap_to_short_string(cap):
        if inspect.isclass(cap):
            return cap.__module__.split(".")[-2]
        if isinstance(cap, webdriver.Remote):
            cap = cap.capabilities
        return cap.get("sefaria_short_name")


#  This function is used to get around the limitations of multiprocessing.Pool.map - that it will not take a method as first argument
#  http://www.rueckstiess.net/research/snippets/show/ca1d7d90
def _test_one_worker(arg, **kwargs):
    return Trial._test_one(*arg, **kwargs)


def get_subclasses(c):
    subclasses = c.__subclasses__()
    for d in list(subclasses):
        subclasses.extend(get_subclasses(d))

    return subclasses


def get_atomic_tests():
    return get_subclasses(AtomicTest)


def get_ordered_atomic_tests(seed):
    test_classes = get_atomic_tests()
    random.shuffle(test_classes, lambda: seed)
    return test_classes


def get_suites():
    return get_subclasses(TestSuite)


# Not used
def get_mobile_tests(tests):
    return [t for t in tests if t.mobile]


# Not used
def get_desktop_tests(tests):
    return [t for t in tests if t.desktop]


# Not used
def get_multiplatform_tests(tests):
    return [t for t in tests if t.desktop and t.mobile]


def get_every_build_tests(tests):
    return [t for t in tests if t.every_build]


# The following util method highlights (blinks) a Webdriver on the page, helpful for figuring out what a code line does.
# A relevant use case would be to recognize an element on browser-1 when it can't be found on browser-2. Just switch locally to
# the other browser (by changing the value of default_local_driver above), run up to the point of failure (using a breakpoint), and from the Evaluate Expression
# window run something like:
#           highlight(self.driver.find_element_by_css_selector('.categoryFilter'))
def highlight(element):
    driver = element._parent
    def apply_style(s):
        driver.execute_script("arguments[0].setAttribute('style', arguments[1]);",
                              element, s)
    original_style = element.get_attribute('style')
    apply_style("background: yellow; border: 2px solid red;")
    time.sleep(.3)
    apply_style(original_style)


class one_of_these_texts_present_in_element(object):
    """ An expectation for checking if the given text is present in the
    specified element.
    locator, text
    """

    def __init__(self, locator, text_):
        assert isinstance(text_, list)
        self.locator = locator
        self.text = text_

    def __call__(self, driver):
        try:
            element_text = _find_element(driver, self.locator).text
            return any([t in element_text for t in self.text])
        except StaleElementReferenceException:
            return False
