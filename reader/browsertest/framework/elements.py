
# -*- coding: utf-8 -*-

from .config import TEMPER, SAUCE_CORE_CAPS, SAUCE_MAX_THREADS, LOCAL_URL, LOCAL_SELENIUM_CAPS
from sefaria.model import *
from pathos.multiprocessing import ProcessingPool as Pool
import os
import inspect
import traceback
import sys

import urllib.parse
from urllib3.exceptions import MaxRetryError

from selenium import webdriver
from appium import webdriver as appium_webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support.expected_conditions import title_contains, presence_of_element_located, \
    element_to_be_clickable, _find_element, visibility_of_element_located, visibility_of_any_elements_located
from selenium.webdriver.common.keys import Keys
from selenium.common.exceptions import NoSuchElementException, NoAlertPresentException, TimeoutException, WebDriverException, \
    ElementClickInterceptedException, StaleElementReferenceException
# http://selenium-python.readthedocs.io/waits.html
# http://selenium-python.readthedocs.io/api.html#module-selenium.webdriver.support.expected_conditions

import time # import stand library below name collision in sefaria.model


class AbstractTest(object):
    every_build = False     # Run this test on every build?
    daily = False           # Run this test daily?
    weekly = False          # Run this test weekly?

    single_panel = True     # Run this test on mobile?
    multi_panel = True      # Run this test on desktop?

    # Only use one of the below.
    include = []  # List of platforms (using cap_to_short_string) to include.  If this is present, only these platforms are included
    exclude = []  # List of platforms (using cap_to_short_string) to exclude.

    def __init__(self, url, cap, verbose=False, **kwargs):
        """
        :param driver:
        :param url:
        :param cap:
        :param verbose:
        :param kwargs:
        """
        self.base_url = url
        self.cap = cap
        self.isVerbose = verbose
        self._validate()
        self.driver = None

    def set_driver(self, driver):
        self.driver = driver

    def _validate(self):
        if not self.multi_panel and not self.single_panel:
            raise Exception("Tests must run on at least one of mobile or desktop")
        if len(self.include) and len(self.exclude):
            raise Exception("Only one of the 'include' and 'exclude' parameters can be used in a given test")

    def name(self):
        return"{} / {}".format(Trial.cap_to_string(self.cap), self.__class__.__name__)

    def __str__(self):
        return self.name()

    def should_run(self, mode):
        if (mode == "multi_panel" and not self.multi_panel) or (mode == "single_panel" and not self.single_panel):
            return False
        if len(self.include) and Trial.cap_to_short_string(self.cap) not in self.include:
            return False
        if len(self.exclude) and Trial.cap_to_short_string(self.cap) in self.exclude:
            return False
        return True

    def fail(self, msg):
        self.carp(msg, always=True)
        return SingleTestResult(self.__class__, self.cap, False, msg)

    def succeed(self):
        return SingleTestResult(self.__class__, self.cap, True)

    def run(self):
        self.carp("\n{}\n".format(str(self)), always=True)
        self.driver.execute_script('"**** Enter {} ****"'.format(self.name()))

        try:
            self.setup()
        except Exception:
            return self.fail("Exception in {}.setup()\n{}".format(self.name(), traceback.format_exc()))
        try:
            self.body()
        except Exception as e:
            try:
                self.recover_exception(e)
            except Exception:
                return self.fail("Exception in {}.body()\n{}".format(self.name(), traceback.format_exc()))
        # this code is unreachable -- should it be deleted?
        try:
            self.driver.execute_script('"**** Exit {} ****"'.format(self.name()))
            self.teardown()
        except Exception:
            return self.fail("Exception in {}.teardown()\n{}".format(self.name(), traceback.format_exc()))

        return self.succeed()

    def setup(self):
        pass

    def body(self):
        raise Exception("body() needs to be defined for each test.")

    def teardown(self):
        pass

    def recover_exception(self, e):
        """
        Runs max once per test to try to repair expected exceptions
        Responsible for re-running body()
        Throw exceptions from this method will not cause this method to re-run.  It will register as test failure.
        By default, does no work, and rethrows exception.
        :param e:
        :return:
        """
        raise e

    def carp(self, msg, short_msg="", always=False):
        sys.stdout.write(msg if self.isVerbose or always else short_msg)
        sys.stdout.flush()


class SefariaTest(AbstractTest):
    # Component methods
    # Methods that begin with "nav_to_" assume that the site is loaded, and do not reload a page.
    # Methods that begin with "load_" start with a page load.

    def recover_exception(self, e):
        if isinstance(e, ElementClickInterceptedException):
            if self.close_modal_popup():
                self.carp("{} - Closed modal. Restarting\n".format(self.name()))
                self.body()
            else:
                raise e
        else:
            raise e

    def setup(self):
        """
        Runs before body of test is run
        :return:
        """
        #self.driver.maximize_window()
        #todo: don't try to resize on mobile.  It errors.
        try:
            self.driver.set_window_size(900, 1100)
        except WebDriverException:
            pass
        self.driver.get(self.base_url + self.initial_url)
        self.close_modal_popup()
        self.click_accept_cookies()

    def is_element_visible_in_viewport(self, element) -> bool:
        return self.driver.execute_script("var elem = arguments[0],            " 
                                     "  box = elem.getBoundingClientRect(),    " 
                                     "  cx = box.left + box.width / 2,         " 
                                     "  cy = box.top + box.height / 2,         " 
                                     "  e = document.elementFromPoint(cx, cy); " 
                                     "  for (; e; e = e.parentElement) {       " 
                                     "    if (e === elem)                      " 
                                     "      return true;                       " 
                                     "  }                                      " 
                                     "return false;                            "
                                     , element)

    def catch_js_error(self):
        error_strings = [
            "RangeError",
            "ReferenceError",
            "SyntaxError",
            "TypeError",
            "Uncaught Error",
            "Uncaught (in promise) Error",
        ]

        js_console = self.driver.get_log("browser")
        # This is cranky on many webdrivers.  It appears to only work on Chrome.
        # See e.g. https://github.com/mozilla/geckodriver/issues/330

        for msg in js_console:
            if any(error in msg["message"] for error in error_strings):
                raise Exception(f'JavaScript Error: {msg["message"]}')
    
    #  Shortcuts
    ############

    def back(self):
        # These may not work as expected...
        self.driver.back()
        return self

    def forward(self):
        # These may not work as expected...
        self.driver.forward()
        return self

    def click(self, selector):
        self.wait_until_clickable(selector)
        self.driver.find_element_by_css_selector(selector).click()
        return self

    def wait_until_visible(self, selector, temper=TEMPER):
        WebDriverWait(self.driver, temper).until(visibility_of_element_located((By.CSS_SELECTOR, selector)))
        return self.driver.find_element_by_css_selector(selector)

    def wait_until_clickable(self, selector, temper=TEMPER):
        WebDriverWait(self.driver, temper).until(element_to_be_clickable((By.CSS_SELECTOR, selector)))
        return self.driver.find_element_by_css_selector(selector)

    def wait_until_present(self, selector):
        WebDriverWait(self.driver, TEMPER).until(presence_of_element_located((By.CSS_SELECTOR, selector)))
        return self.driver.find_element_by_css_selector(selector)

    def wait_for_connections(self, temper=TEMPER*2):
        WebDriverWait(self.driver, temper).until(element_to_be_clickable((By.CSS_SELECTOR, ".linkCountDot")))

    def wait_until_title_contains(self, text):
        WebDriverWait(self.driver, TEMPER).until(title_contains(text))

    def wait_until_title_does_not_contain(self, text):
        WebDriverWait(self.driver, TEMPER).until_not(title_contains(text))

    def get_element(self, selector):
        return self.driver.find_element_by_css_selector(selector)

    def load_url(self, url, test_selector, temper=TEMPER):
        """
        Load any URL and wait until `test_selector` is present
        """
        self.driver.get(urllib.parse.urljoin(self.base_url, url))
        WebDriverWait(self.driver, temper).until(presence_of_element_located((By.CSS_SELECTOR, test_selector)))
        # self.catch_js_error()
        return self

    def load_toc(self, my_temper=None):
        temper = my_temper or TEMPER  # This is used at startup, which can be sluggish on iPhone.
        self.load_url("/texts", ".navBlockTitle")
        return self

    def click_element_by_link_text(self, link_txt):
        self.driver.execute_script("scroll(250, 0)")
        self.driver.execute_script("scroll(0, 250)")
        WebDriverWait(self.driver, TEMPER).until(
            element_to_be_clickable((By.LINK_TEXT, link_txt))
        )
        obj_to_click = self.driver.find_element_by_link_text(link_txt)
        obj_to_click.click()

    #  Scrolling
    ##############

    def scroll_to_css_selector(self, selector):
        # This scrolls forward.  Do we need to test and try to scroll back also?
        self.driver.execute_script(
            "var a = document.querySelector('{}'); a.scrollIntoView({{block: 'center', inline: 'nearest'}});".format(selector)
        )
        time.sleep(.5)
        return self

    def scroll_to_css_selector_and_click(self, selector):
        self.scroll_to_css_selector(selector)
        self.click(selector)
        time.sleep(.5)    # Takes some time to reload, and not sure what next page is
        return self

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
            "var a = document.getElementsByClassName('textColumn')[0]; a.scrollTop = a.scrollHeight; setTimeout(function() { a.scrollTop = a.scrollHeight - 1000; }, 100); setTimeout(function() { a.scrollTop = a.scrollHeight - 400; }, 100);"
        )
        return self

    def scroll_reader_panel_to_top(self):
        """Scrolls the first text panel to the top"""
        # todo
        return self

    def scroll_content_to_position(self, pixels):
        self.driver.execute_script(
            "var a = document.getElementsByClassName('content')[0]; a.scrollTop = {}".format(pixels)
        )
        return self

    def get_content_scroll_position(self):
        return self.driver.execute_script("var a = document.getElementsByClassName('content')[0]; return a.scrollTop;")

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

    # Initial Setup
    ################

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

    # Login
    #########

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
        self.click("button#login-submit-button")
        self.wait_until_title_does_not_contain("Log in")
        self.wait_until_clickable(".header .home")
        return self

    def is_logged_in(self):
        try:
            self.driver.find_element_by_css_selector('.accountLinks .my-profile, .mobileAccountLinks a[href="/my/profile"]')
            return True
        except NoSuchElementException:
            return False

    # Navigating in App
    ###################

    def nav_to_profile(self):
        if not self.is_logged_in():
            self.login_user()
        self.open_mobile_navigation_menu_if_needed()
        try: 
            self.click('.accountLinks .my-profile')
            self.wait_until_clickable("#my-profile-link")
            self.click("#my-profile-link")
        except:
            self.click('.mobileAccountLinks a[href="/my/profile"]')
        self.wait_until_clickable(".profile-summary")

        return self

    def nav_to_new_sheet(self):
        self.nav_to_profile()
        self.click('a[href="/sheets/new"]')
        self.wait_until_clickable("#inlineAdd")
        return self

    def nav_to_login(self):
        self.open_mobile_navigation_menu_if_needed()
        self.click(".loginLink")
        self.wait_until_clickable("#id_email")
        return self

    def nav_to_toc(self):
        """
        This method can be called from many different initial states.
        It tries a few different things to get out of the current state, back to a dependable base toc.
        :return:
        """
        if self.driver.current_url == urllib.parse.urljoin(self.base_url, "/texts") or self.driver.current_url.startswith(urllib.parse.urljoin(self.base_url,"/texts") + "?"):
            return self

        # If text options are open, close them
        try:
            mask = self.driver.find_element_by_css_selector('.mask')
            self.driver.execute_script("arguments[0].click();", mask)
        except NoSuchElementException:
            pass

        try:
            self.click('.header .home')
        except (TimeoutException, NoSuchElementException): # mobile
            try:
                self.open_mobile_navigation_menu()
            except:
                try:
                    # Mobile browsers could be in a state where a window needs to be closed.
                    self.click('.readerNavMenuCloseButton').click('.readerNavMenuMenuButton').click(".textsPageLink")
                except NoSuchElementException:
                    # Mobile browsers could be in a state where commentary panel is open
                    self.click('.segment').click('.readerNavMenuMenuButton').click(".textsPageLink")
                finally:
                    self.open_mobile_navigation_menu()
            self.click('.mobileNavMenu .textsPageLink')
        self.wait_until_clickable(".navBlockTitle")
        return self

    def nav_to_history(self):
        self.login_user()
        self.open_mobile_navigation_menu_if_needed()
        self.click('a[href="/texts/saved"]')
        self.wait_until_clickable("h1")
        self.click('a[href="/texts/history"]')
        self.wait_until_clickable(".storyTitle")
        return self

    def search_ref(self, ref):
        if isinstance(ref, str):
            ref = Ref(ref)
        assert isinstance(ref, Ref)
        self.type_in_search_box(ref.normal())
        time.sleep(.5)  # Old page may have an element that matches the selector below.  Wait for it to go away.
        self.wait_until_clickable(".textColumn .textRange .segment")
        self.wait_for_connections()
        #WebDriverWait(self.driver, TEMPER).until(visibility_of_any_elements_located((By.CSS_SELECTOR, ".linkCountDot")))
        time.sleep(.5)  # Something takes a moment here.  Not sure what to wait for.
        return self

    def browse_to_ref(self, ref):
        if isinstance(ref, str):
            ref = Ref(ref)
        assert isinstance(ref, Ref)

        index = ref.index
        categories = self._get_clickpath_from_categories(index.categories)
        self.nav_to_book_page(categories, index.title)

        # Logic for what is displayed lives on SchemaNode under TextTableOfContentsNavigation
        section_ref = ref.section_ref()
        index_node = ref.index_node
        assert isinstance(index_node, SchemaNode)

        self.click_text_toc_section(section_ref)
        return self

    def click_toc_category(self, category_name):
        # Assume that category link is already present on screen (or soon will be)
        self.wait_until_visible('.navBlockTitle[data-cat="{}"]'.format(category_name))
        self.scroll_to_css_selector_and_click('.navBlockTitle[data-cat="{}"]'.format(category_name))
        elem = self.driver.find_element_by_css_selector("h1 > span.en")
        assert elem.get_attribute('innerHTML') == category_name, f"elem innerHTML == {elem.get_attribute('innerHTML')} != {category_name}"  # use get_attribute in case element is visible due to hebrew interface
        return self

    def click_toc_text(self, text_name):
        # Assume that text link is already present on screen (or soon will be)
        selector = '.navBlockTitle[href="/{}"]'.format(Ref(text_name).url())
        self.scroll_to_css_selector_and_click(selector)
        self.wait_until_visible(".tocContent")
        return self

    def click_history_item(self, tref):
        # Assume that text link is already present on screen (or soon will be)
        self.click('.savedHistoryList a[href="/{}"]'.format(Ref(tref).url()))
        self.wait_until_clickable('.segment')

    def click_resources_on_sidebar(self):
        self.click('.connectionsHeaderTitle')

    def click_sidebar_button(self, name):
        self.click('a.toolsButton[data-name="{}"]'.format(name))

    def click_sidebar_nth_version_button(self, n):
        self.get_sidebar_nth_version_button(n).click()

    def get_sidebar_nth_version_button_text(self, n):
        return self.get_sidebar_nth_version_button(n).text

    def get_sidebar_nth_version_button(self, n):
        slctr = f"#panel-1 > div.readerContent > div > div > div > div > div:nth-child(1) >div:nth-child({n+1}) > div.versionSelect > a.selectButton"
        return self.get_element(slctr)

    def type_in_mailing_list_email(self, str):
        self.type_in_text_box_by_id('mailingListEmail', str)

    def type_in_text_box_by_id(self, obj_id, txt_to_type):
        WebDriverWait(self.driver, TEMPER).until(
            element_to_be_clickable((By.CSS_SELECTOR, "#" + obj_id))
        )
        txt_box = self.driver.find_element_by_css_selector("#" + obj_id)
        txt_box.clear()
        txt_box.send_keys(txt_to_type)

    def click_ivrit_link(self): # Named '..ivrit..' as the link's in Hebrew. Below - a method with '..hebrew..' (that calls this one), in case it's easier to locate that way
        try:
            # if logged out, first click to open dropdown
            self.driver.find_element_by_css_selector('.header a.interfaceLinks-button')
            self.click('.header a.interfaceLinks-button')
            self.click_element_by_link_text('עברית')
        except NoSuchElementException:
            # must be logged in
            self.click('#siteLanguageHebrew')

    def click_hebrew_link(self):
        self.click_ivrit_link()

    def click_english_link(self):
        try:
            # if logged out, first click to open dropdown
            self.driver.find_element_by_css_selector('.header a.interfaceLinks-button')
            self.click('.header a.interfaceLinks-button')
            self.click_element_by_link_text('English')
        except NoSuchElementException:
            # must be logged in
            self.click('#siteLanguageEnglish')

    def open_mobile_navigation_menu(self):
        self.click(".menuButton, .readerNavMenuMenuButton")

    def open_mobile_navigation_menu_if_needed(self):
        try:
            self.get_element(".menuButton, .readerNavMenuButton")
            self.open_mobile_navigation_menu()
        except NoSuchElementException:
            pass

    def toggle_on_text_settings(self):
        self.click('#panel-0 .readerControls .readerOptions')

    def toggle_language_english(self):
        self.click('#panel-0 div.readerOptionsPanel div.toggleSet.language div.toggleOption.english')

    def toggle_language_bilingual(self):
        self.click('#panel-0 div.readerOptionsPanel div.toggleSet.language div.toggleOption.bilingual')

    def toggle_language_hebrew(self):
        self.click('#panel-0 div.readerOptionsPanel div.toggleSet.language div.toggleOption.hebrew')

    def toggle_bilingual_layout_stacked(self):
        self.click('#panel-0 div.readerOptionsPanel div.toggleSet.biLayout div.toggleOption.stacked')

    def toggle_bilingual_layout_heLeft(self):
        self.click('#panel-0 div.readerOptionsPanel div.toggleSet.biLayout div.toggleOption.heLeft')

    def toggle_bilingual_layout_heRight(self):
        self.click('#panel-0 div.readerOptionsPanel div.toggleSet.biLayout div.toggleOption.heRight')

    def toggle_fontSize_smaller(self):
        self.click('#panel-0 div.readerOptionsPanel div.toggleSet.fontSize div.toggleOption.smaller')

    def toggle_fontSize_larger(self):
        self.click('#panel-0 div.readerOptionsPanel div.toggleSet.fontSize div.toggleOption.larger')

    def toggle_aliyotTorah_aliyotOn(self):
        self.click('#panel-0 div.readerOptionsPanel div.toggleSet.aliyotTorah div.toggleOption.aliyotOn')

    def toggle_aliyotTorah_aliyotOff(self):
        self.click('#panel-0 div.readerOptionsPanel div.toggleSet.aliyotTorah div.toggleOption.aliyotOff')

    def toggle_vowels_none(self):
        self.click('#panel-0 div.readerOptionsPanel div.toggleSet.vowels div.toggleOption.none')

    def toggle_vowels_partial(self):
        self.click('#panel-0 div.readerOptionsPanel div.toggleSet.vowels div.toggleOption.partial')

    def toggle_vowels_all(self):
        self.click('#panel-0 div.readerOptionsPanel div.toggleSet.vowels div.toggleOption.all')

    def get_nth_section_english(self, n):
        selector = '#panel-0 > div.readerContent div.textRange.basetext > div.text > div > span:nth-child(' + str(n) + ') .segmentText > span.en'
        return self.get_element(selector)

    def get_nth_section_hebrew(self, n):
        selector = '#panel-0 > div.readerContent div.textRange.basetext > div.text > div > span:nth-child(' + str(n) + ') .segmentText > span.he'
        return self.get_element(selector)

    def has_hebrew_text(self):
        selector = '#panel-0 > div.readerContent div.textRange.basetext > div.text .segmentText > span.he'
        return len(self.driver.find_elements_by_css_selector(selector)) > 0

    def has_english_text(self):
        selector = '#panel-0 > div.readerContent div.textRange.basetext > div.text .segmentText > span.en'
        return len(self.driver.find_elements_by_css_selector(selector)) > 0

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

    def get_font_size(self):
        size = self.get_nth_section_hebrew(1).value_of_css_property("font-size")
        return float(size.replace('px',''))

    def get_current_url(self):
        return self.driver.current_url

    def is_object_displayed(self, css_selector):
        try:
            aliyot = self.driver.find_element_by_css_selector(css_selector)
            return True # would through an exception otherwise, handled below
        except NoSuchElementException:
            return False

    def is_aliyot_toggleSet_displayed(self):
        return self.is_object_displayed("div[class='toggleSet aliyotTorah']")

    def is_vocalization_toggleSet_displayed(self):
        return self.is_object_displayed("div[class='toggleSet vowels']")

    def get_content_panel(self):
        return self.get_element("#panel-0")

    def click_sidebar_entry(self, data_name):
        selector = "div[class='categoryFilter'][data-name='" + data_name + "']"
        try:
            self.click(selector)
        except:
            self.click("a[data-name='More']")
            self.click(selector)

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

    @staticmethod
    def _get_clickpath_from_categories(cats):
        """
        Returns the category clickpath, from TOC root, for cats as presented on an Index
        :param cats:
        :return:
        """
        # The logic that we're following here was implemented on TextCategoryContents
        # It is no replaced with `isPrimary` flag on Category objects.
        # Cats which normally would nest, but are special cased to be subcats.
        special_subcats = ["Mishneh Torah", "Shulchan Arukh", "Tur", "Sefer Yetzirah"]

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
    def load_ref(self, ref, filter=None, lang=None, wait_for_connections=False):
        """
        takes string ref or object Ref
        :param ref:
        :param filter: "all", "Rashi", etc
        :return:
        """
        if isinstance(ref, str):
            ref = Ref(ref)
        assert isinstance(ref, Ref)
        url = urllib.parse.urljoin(self.base_url, ref.url())

        if filter is not None:
            url += "&with={}".format(filter)
        if lang is not None:
            url += "&lang={}".format(lang)

        self.driver.get(url.replace("&", "?", 1))

        if filter == "all":
            self.wait_until_clickable(".categoryFilter")
        elif filter is not None:
            # Filters load slower than the main page
            self.wait_until_clickable(".filterSet > .textRange")
        else:
            self.wait_until_clickable(".textColumn .textRange .segment")
        
        if wait_for_connections:
            self.wait_for_connections()

        self.set_modal_cookie()
        return self

    def nav_to_book_page(self, cats, text_title):
        """
        :param cats: list of categories to click before text is visible (may not be entire category path to text)
        :param text: name of text to click
        :return:
        """
        self.nav_to_toc()
        for cat in cats:
            self.click_toc_category(cat)
        self.click_toc_text(text_title)
        return self

    def load_book_page(self, ref):
        if isinstance(ref, str):
            ref = Ref(ref)
        assert isinstance(ref, Ref)
        self.load_url(ref.url(), ".tocContent")
        self.wait_until_clickable(".tocContent > :not(.loadingMessage)")
        self.set_modal_cookie()
        return self

    def click_text_toc_section(self, ref):
        if isinstance(ref, str):
            ref = Ref(ref)
        assert isinstance(ref, Ref)
        url = urllib.parse.quote(ref.url())
        self.scroll_to_css_selector_and_click('.sectionLink[href="/{}"], .schema-node-toc[href="/{}"]'.format(url, url))
        self.wait_until_clickable('.segment')
        return self

    def click_text_toc_schema_node(self, ref):
        if isinstance(ref, str):
            ref = Ref(ref)
        assert isinstance(ref, Ref)
        self.scroll_to_css_selector_and_click('.schema-node-toc[href="/{}"] > span'.format(urllib.parse.quote(ref.url())))
        return self

    def click_segment(self, ref):
        if isinstance(ref, str):
            ref = Ref(ref)
        assert isinstance(ref, Ref)
        self._perform_segment_click(ref)
        # Todo: put a data-* attribute on .filterSet, for the multi-panel case
        # Note below will fail if there are no connections
        self.wait_until_clickable(".categoryFilter", temper=TEMPER*2),
        return self

    def _perform_segment_click(self, ref):
        selector = '.segment[data-ref="{}"]'.format(ref.normal())
        self.click(selector)

    def click_segment_to_close_commentary(self, ref):
        if isinstance(ref, str):
            ref = Ref(ref)
        assert isinstance(ref, Ref)
        self._perform_segment_click(ref)

    def find_category_filter(self, name):
        selector = '.categoryFilter[data-name="{}"]'.format(name)
        try:
            self.wait_until_clickable(selector)
        except:
            self.click("a[data-name='More']")
            self.wait_until_clickable(selector)
        return self.driver.find_element_by_css_selector(selector)

    def find_text_filter(self, name):
        selector = '.textFilter[data-name="{}"]'.format(name)
        self.wait_until_clickable(selector)
        return self.driver.find_element_by_css_selector(selector)

    def click_category_filter(self, name):
        f = self.find_category_filter(name)
        assert f, "Can not find text filter {}".format(name)
        f.click()
        self.wait_until_clickable('.categoryFilterGroup.withBooks')
        return self

    def click_text_filter(self, name):
        f = self.find_text_filter(name)
        assert f, "Can not find text filter {}".format(name)
        f.click()
        self.wait_until_clickable('.recentFilterSet')
        return self

    def load_search_url(self, query=None):
        url = "/search"
        if query is not None:
            url += "?q={}".format(query)
        self.load_url(url, ".type-button-title")
        self.set_modal_cookie()
        return self

    def search_for(self, query):
        # This one is for searches that produce search results, not navigations
        self.open_mobile_navigation_menu_if_needed()
        self.wait_until_clickable("#searchInput")
        elem = self.driver.find_element_by_css_selector("#searchInput")
        elem.send_keys(query)
        elem.send_keys(Keys.RETURN)
        # todo: does this work for a second search?
        self.wait_until_clickable(".result")
        return self

    # todo: the #searchInput isn't always present on mobile.  The button to open it isn't always predsent either.  Probably need to nav to toc in that case.
    def type_in_search_box(self, query):
        self.open_mobile_navigation_menu_if_needed()
        self.wait_until_clickable("#searchInput")
        elem = self.driver.find_element_by_css_selector("#searchInput")
        elem.send_keys(query)
        elem.send_keys(Keys.RETURN)
        return self

    def load_topics(self):
        self.load_url("/topics", ".navBlockTitle")
        self.set_modal_cookie()
        return self

    def load_topic_page(self, slug):
        self.load_url("/topics/" + slug, ".storyTitle")
        return self

    def load_gardens(self):
        self.load_url("/garden/jerusalem", "#filter-1 g.row")
        self.wait_until_clickable(".dc-grid-item .result-text .en")
        self.driver.get(urllib.parse.urljoin(self.base_url, "/garden/jerusalem"))
        return self

    def load_home(self):
        self.load_url("/", ".header")
        return self

    def load_people(self):
        self.load_url("/people", ".gridBoxItem")
        self.load_url("/person/Meir%20Abulafia", ".topicDescription")
        return self

    def load_my_profile(self):
        self.load_url("/my/profile", ".profile-page")
        return self

    def load_notifications(self):
        self.load_url("/notifications", ".notification")
        return self

    def load_edit(self, ref, lang, version):
        if isinstance(ref, str):
            ref = Ref(ref)
        assert isinstance(ref, Ref)

        url = "/edit/{}/{}/{}".format(ref, lang, version.replace(" ", "_"))

        self.load_url(url, "#newVersion")
        return self

    def load_add(self, ref):
        if isinstance(ref, str):
            ref = Ref(ref)
        assert isinstance(ref, Ref)
 
        self.load_url("/add/{}".format(ref.url()), "#newVersion")
        return self

    def enable_new_editor(self):
        self.driver.get(self.base_url + "/enable_new_editor")

    def disable_new_editor(self):
        self.driver.get(self.base_url + "/disable_new_editor")

    def new_sheet_in_editor(self):
        self.load_url("/sheets/new", ".editorContent")
        return self

    def load_existing_sheet(self, sheetID):
        self.load_url("/sheets/" + sheetID, ".editorContent")
        return self

    def nav_to_end_of_editor(self):
        self.click(".editorContent")
        self.driver.switch_to.active_element.send_keys(Keys.CONTROL, Keys.END)
        return self

    def delete_sheet_content(self, direction):
        elem = self.driver.switch_to.active_element
        if direction == "back":
            elem.send_keys(Keys.BACKSPACE)
        else:
            elem.send_keys(Keys.DELETE)

    def type_lorem_ipsum_text(self, language):
        paragraph = {
            "en": "Proin elit arcu, rutrum commodo, vehicula tempus, commodo a, risus. Curabitur nec arcu. Donec sollicitudin mi sit amet mauris. Nam elementum quam ullamcorper ante. Etiam aliquet massa et lorem. Mauris dapibus lacus auctor risus. Aenean tempor ullamcorper leo. Vivamus sed magna quis ligula eleifend adipiscing. Duis orci. Aliquam sodales tortor vitae ipsum. Aliquam nulla. Duis aliquam molestie erat. Ut et mauris vel pede varius sollicitudin. Sed ut dolor nec orci tincidunt interdum. Phasellus ipsum. Nunc tristique tempus lectus.",
            "he": " לורם איפסום דולור סיט אמט, קונסקטורר אדיפיסינג אלית קולורס מונפרד אדנדום סילקוף, מרגשי ומרגשח. עמחליף סחטיר בלובק. תצטנפל בלינדו למרקל אס לכימפו, דול, צוט ומעיוט - לפתיעם ברשג - ולתיעם גדדיש. קוויז דומור ליאמום בלינך רוגצה. לפמעט מוסן מנת. קולורס מונפרד אדנדום סילקוף, מרגשי ומרגשח. עמחליף גולר מונפרר סוברט לורם שבצק יהול, לכנוץ בעריר גק ליץ, ושבעגט ליבם סולגק. בראיט ולחת צורק מונחף, בגורמי מגמש. תרבנך וסתעד לכנו סתשם השמה - לתכי מורגם בורק? לתיג ישבעס."
        }
        elem = self.driver.switch_to.active_element
        elem.send_keys(paragraph[language])
        elem.send_keys(Keys.RETURN)
        elem.send_keys(Keys.RETURN)
        time.sleep(1) #sheet won't save until there's a brief pause
        return self

    def add_source(self, ref):
        elem = self.driver.switch_to.active_element
        elem.send_keys(ref)
        elem.send_keys(Keys.RETURN)
        time.sleep(1) #sheet won't save until there's a brief pause
        return self

    def toggle_sheet_edit_view(self):
        WebDriverWait(self.driver, TEMPER).until(element_to_be_clickable((By.CSS_SELECTOR, "div.rightButtons button")))
        button = self.driver.find_element_by_css_selector("div.rightButtons button")
        button.click()
        return self

    def get_sheet_html(self):
        sheet_selector = '.editorContent'
        sheet = self.driver.find_element_by_css_selector(sheet_selector)
        sheet_html = sheet.get_attribute('innerHTML')
        return sheet_html


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

    def _results_as_matrix(self):
        self._aggregate()
        # sorted_test_classes = self._sorted_test_classes()
        test_classes = list({res.test_class for res in self._test_results})

        caps = list({Trial.cap_to_short_string(res.cap) for res in self._test_results})

        def text_result(test, cap):
            res = self._indexed_tests.get((test, cap))
            if res is None:
                return "s"
            if res.success is True:
                return "."
            if res.success is False:
                return "Fail"

        results = [[""] * (len(caps) + 1)] + \
                  [[" ** "] + caps]
        for test in test_classes:
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

        # if passed_tests < total_tests:
        #     for failed_test in [t for t in self._test_results if not t.success]:
        #         ret += "\n\n{}\n".format(str(failed_test))

        return ret


SAUCE_USERNAME = ""
SAUCE_ACCESS_KEY = ""


class Trial(object):
    global SAUCE_USERNAME, SAUCE_ACCESS_KEY 
    default_local_driver = webdriver.Chrome
    # default_local_driver = webdriver.Firefox
    # default_local_driver = webdriver.Safari

    def __init__(self, platform="local", build=None, tests=None, caps=None, parallel=None, verbose=False, seleniumServerHostname="", targetApplicationUrl=""):
        """
        :param caps: If local: webdriver classes, if remote, dictionaries of capabilities
        :param platform: "sauce", "local", "travis"
        :return:
        BASE_URL refers to the target application
        """
        global SAUCE_USERNAME, SAUCE_ACCESS_KEY
        assert platform in ["sauce", "local", "travis", "githubnew", "localselenium"]
        if platform == "travis":
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
            SAUCE_USERNAME = os.getenv('SAUCE_USERNAME')
            SAUCE_ACCESS_KEY = os.getenv('SAUCE_ACCESS_KEY')
            self.is_local = False
            self.BASE_URL = os.getenv('CI_URL')
            self.caps = caps if caps else SAUCE_CORE_CAPS
        elif platform == "githubnew":
            SAUCE_USERNAME = os.getenv('SAUCE_USERNAME')
            SAUCE_ACCESS_KEY = os.getenv('SAUCE_ACCESS_KEY')
            self.BASE_URL = os.getenv('CI_URL')
            self.caps = caps if caps else SAUCE_CORE_CAPS
            self.is_local = False
            platform = "sauce"
        elif platform == "localselenium": # local selenium, remote application
            self.BASE_URL = os.getenv('CI_URL')
            self.caps = caps if caps else LOCAL_SELENIUM_CAPS
            self.is_local = True # 'is_local' refers to the application location

        self.isVerbose = verbose
        self.platform = platform
        self.build = build
        self.tests = get_every_build_tests(get_all_tests()) if tests is None else tests
        self._results = TestResultSet()
        self.parallel = parallel if parallel is not None else False if self.is_local else True
        if self.parallel:
            self.thread_count = SAUCE_MAX_THREADS

    def _get_driver(self, cap=None):
        """
        :param cap: If remote, cap is a dictionary of capabilities.
                    If local, it's a webdriver class
        :return:
        """
        if self.platform == "local":
            cap = cap if cap else self.default_local_driver
            if isinstance(cap, appium_webdriver.Remote) or isinstance(cap, webdriver.chrome.webdriver.WebDriver):
                driver = cap
            else:
                driver = cap()
        elif self.platform == "sauce":
            assert cap is not None

            MAX_ATTEMPTS = 3
            attempt = 0
            while attempt < MAX_ATTEMPTS:
                try:
                    if cap.get("appiumVersion") is not None:
                        driver = appium_webdriver.Remote(
                            command_executor='https://{}:{}@ondemand.us-west-1.saucelabs.com:443/wd/hub'.format(SAUCE_USERNAME, SAUCE_ACCESS_KEY),
                            desired_capabilities=cap)
                    else:
                        driver = webdriver.Remote(
                            command_executor='https://{}:{}@ondemand.us-west-1.saucelabs.com:443/wd/hub'.format(SAUCE_USERNAME, SAUCE_ACCESS_KEY),
                            desired_capabilities=cap)
                    break
                except MaxRetryError:
                    attempt += 1

        elif self.platform == "localselenium":
            assert cap is not None

            # LOCAL_SELENIUM_URL should be in the following format:
            # LOCAL_SELENIUM_URL=http://localhost:4444/wd/hub
            # LOCAL_SELENIUM_URL=http://$SELENIUM_HOST:$SELENIUM_PORT/wd/hub

            # restrict capabilities to just Firefox to start
            command_executor = os.getenv("LOCAL_SELENIUM_URL")
            driver = webdriver.Remote(
                command_executor=command_executor,
                desired_capabilities=cap
            )
        else:
            raise Exception("Unrecognized platform: {}".format(self.platform))

        return driver

    def _test_one(self, test_class, cap):
        """

        :param test_class:
        :param cap:
        :return:
        """
        MAX_TEST_RUNS = 2
        driver = None
        if self.is_local:
            if isinstance(cap, appium_webdriver.Remote):
                mode = "single_panel"
            else:
                mode = "multi_panel"  # Assuming that local isn't single panel
        else:
            mode = cap.get("sefaria_mode")
            cap['sauce:options'] = {
                "build": self.build,
                "name": "{} on {}".format(test_class.__name__, self.cap_to_string(cap)),
                #  "tags": ["tag1", "tag2", "tag3"]
            }

        try:
            result = None
            tries = 0
            while (result is None or not result.success) and tries < MAX_TEST_RUNS:
                tries += 1
                if tries > 1:
                    self.carp("Retrying {}/{}  ({}/{})".format(test_class.__name__,  Trial.cap_to_string(cap), tries, MAX_TEST_RUNS))

                test_instance = test_class(self.BASE_URL, cap, mode=mode, verbose=self.isVerbose)
                if not test_instance.should_run(mode):
                    return None

                driver = self._get_driver(cap)
                test_instance.set_driver(driver)
                result = test_instance.run()

                if self.platform == "sauce":
                    try:
                        self.set_sauce_result(driver, result.success)
                    except WebDriverException:      # Sometimes an earlier test infrastructure fail makes this throw
                        pass
                if not self.is_local:   # driver will not restart locally                       
                    driver.quit()       

            return result

        except Exception as e:
            # Test errors are caught before this.
            # An exception at this level means that the infrastructure erred.
            print(e)
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

        tresults = []  # list of SingleTestResult instances
        if self.parallel:
            p = Pool(self.thread_count)
            l = len(caps)
            try:
                self.carp("[_test_on_all] current class {}".format(test_class))
                tresults = p.map(_test_one_worker, list(zip([self] * l, [test_class] * l, caps)))
            except Exception:
                msg = traceback.format_exc()
                self.carp("{} - Exception\n{}\n".format(test_class.__name__, msg), always=True)
                tresults += [SingleTestResult(test_class, caps[0], False, msg)]
        else:
            for cap in caps:
                tresults.append(self._test_one(test_class, cap))

        result_set.include(tresults)
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
                "{} {} on {}".format(cap.get('browserName'), cap.get("browserVersion"), cap.get('platform')))  # sauce desktop

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


def get_all_tests():
    return get_subclasses(AbstractTest)



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
