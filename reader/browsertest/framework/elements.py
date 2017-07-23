# -*- coding: utf-8 -*-
from config import *
from sefaria.model import *
from random import shuffle
from multiprocessing import Pool
import os
import inspect
import httplib
import base64
import json
import traceback
import sys
from selenium import webdriver
from appium import webdriver as appium_webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait

# http://selenium-python.readthedocs.io/waits.html
# http://selenium-python.readthedocs.io/api.html#module-selenium.webdriver.support.expected_conditions
from selenium.webdriver.support.expected_conditions import title_contains, presence_of_element_located, staleness_of, element_to_be_clickable, visibility_of_element_located
from selenium.webdriver.common.keys import Keys


class AtomicTest(object):
    """
    Abstract Class
    AtomicTests are designed to be composed in any order, so as to test a wide range of orders of events
    A concrete AtomicTest implements the run method.
    """
    suite_key = None
    single_panel = True  # run this test on mobile?
    multi_panel = True  # run this test on desktop?

    every_build = False  # Run this test on every build?

    # Only use one of the below.
    include = []  # List of platforms (using cap_to_short_string) to include.  If this is present, only these platforms are included
    exclude = []  # List of platforms (using cap_to_short_string) to exclude.

    def __init__(self, driver, url):
        self.base_url = url
        self.driver = driver
        if not self.suite_key:
            raise Exception("Missing required variable - test_suite")
        if not self.multi_panel and not self.single_panel:
            raise Exception("Tests must run on at least one of mobile or desktop")
        if len(self.include) and len(self.exclude):
            raise Exception("Only one of the 'include' and 'exclude' parameters can be used in a given test")

    def set_modal_cookie(self):
        #set cookie to avoid popup interruption
        self.driver.add_cookie({"name": "welcomeToS2LoggedOut", "value": "true"})

    def run(self):
        raise Exception("AtomicTest.run() needs to be defined for each test.")

    # Component methods

    def login_user(self):
        password = os.environ["SEFARIA_TEST_PASS"]
        user = os.environ["SEFARIA_TEST_USER"]
        self._login(user, password)
        return self

    def login_superuser(self):
        password = os.environ["SEFARIA_SUPERUSER"]
        user = os.environ["SEFARIA_SUPERPASS"]
        self._login(user, password)
        return self

    def _login(self, user, password):
        self.driver.get(self.base_url + "/login")
        WebDriverWait(self.driver, TEMPER).until(element_to_be_clickable((By.CSS_SELECTOR, "#id_email")))
        elem = self.driver.find_element_by_css_selector("#id_email")
        elem.send_keys(user)
        elem = self.driver.find_element_by_css_selector("#id_password")
        elem.send_keys(password)
        self.driver.find_element_by_css_selector("button").click()
        WebDriverWait(self.driver, TEMPER).until_not(title_contains("Login"))

    # TOC
    def load_toc(self):
        self.driver.get(self.base_url + "/texts")
        WebDriverWait(self.driver, TEMPER).until(element_to_be_clickable((By.CSS_SELECTOR, ".readerNavCategory")))
        self.set_modal_cookie()
        return self

    def click_toc_category(self, category_name):
        WebDriverWait(self.driver, TEMPER).until(
            element_to_be_clickable((By.CSS_SELECTOR, '.readerNavCategory[data-cat="{}"]'.format(category_name)))
        )
        self.driver.find_element_by_css_selector('.readerNavCategory[data-cat="{}"]'.format(category_name)).click()
        WebDriverWait(self.driver, TEMPER).until(
            element_to_be_clickable((By.CSS_SELECTOR, '.refLink'))
        )
        return self

    def click_toc_text(self, text_name):
        WebDriverWait(self.driver, TEMPER).until(
            element_to_be_clickable((By.CSS_SELECTOR, '.refLink[data-ref^="{}"]'.format(text_name)))
        )
        p1 = self.driver.find_element_by_css_selector('.refLink[data-ref^="{}"]'.format(text_name))
        p1.click()

        WebDriverWait(self.driver, TEMPER).until(
            element_to_be_clickable((By.CSS_SELECTOR, '.segment'))
        )
        return self

    def click_toc_recent(self, tref):
        WebDriverWait(self.driver, TEMPER).until(
            element_to_be_clickable((By.CSS_SELECTOR, '.recentItem[data-ref="{}"]'.format(tref)))
        )
        recent = self.driver.find_element_by_css_selector('.recentItem[data-ref="{}"]'.format(tref))
        recent.click()
        WebDriverWait(self.driver, TEMPER).until(element_to_be_clickable((By.CSS_SELECTOR, '.segment')))

    # Text Panel
    # Todo: handle the case when the loaded page has different URL - because of scroll
    def load_ref(self, ref, filter=None, lang=None):
        """
        takes string ref or object Ref
        :param ref:
        :param filter: "all", "Rashi", etc
        :return:
        """
        if isinstance(ref, basestring):
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
            WebDriverWait(self.driver, TEMPER).until(element_to_be_clickable((By.CSS_SELECTOR, ".textColumn .textRange .segment")))
            WebDriverWait(self.driver, TEMPER).until(element_to_be_clickable((By.CSS_SELECTOR, ".linkCountDot")))
        self.set_modal_cookie()
        return self

    def load_text_toc(self, ref):
        if isinstance(ref, basestring):
            ref = Ref(ref)
        assert isinstance(ref, Ref)
        url = self.base_url + "/" + ref.url()
        self.driver.get(url)
        WebDriverWait(self.driver, TEMPER).until(element_to_be_clickable((By.CSS_SELECTOR, ".tocContent > :not(.loadingMessage)")))
        self.set_modal_cookie()
        return self

    def click_text_toc_section(self, ref):
        if isinstance(ref, basestring):
            ref = Ref(ref)
        assert isinstance(ref, Ref)
        p1 = self.driver.find_element_by_css_selector('.sectionLink[data-ref^="{}"]'.format(ref.url()))
        p1.click()
        WebDriverWait(self.driver, TEMPER).until(
            element_to_be_clickable((By.CSS_SELECTOR, '.segment'))
        )
        return self

    #todo:
    def load_refs(self):
        pass

    def click_segment(self, ref):
        if isinstance(ref, basestring):
            ref = Ref(ref)
        assert isinstance(ref, Ref)
        selector = '.segment[data-ref="{}"]'.format(ref.normal())
        WebDriverWait(self.driver, TEMPER).until(element_to_be_clickable((By.CSS_SELECTOR, selector)))
        segment = self.driver.find_element_by_css_selector(selector)
        segment.click()
        # Todo: put a data-* attribute on .filterSet, for the multi-panel case
        # Note below will fail if there are no connections
        WebDriverWait(self.driver, TEMPER).until(element_to_be_clickable((By.CSS_SELECTOR, ".categoryFilter")))
        return self

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
        #todo: untested
        #todo: handle multiple panels
        self.driver.execute_script(
            "var a = document.getElementsByClassName('textColumn')[0]; a.scrollTop = a.scrollTop() + {};".format(pixels)
        )
        return self

    def scroll_reader_panel_up(self, pixels):
        #todo: untested
        #todo: handle multiple panels
        self.driver.execute_script(
            "var a = document.getElementsByClassName('textColumn')[0]; a.scrollTop = a.scrollTop - {};".format(pixels)
        )
        return self

    def scroll_reader_panel_to_bottom(self):
        #todo: untested
        #todo: handle multiple panels
        self.driver.execute_script(
            "var a = document.getElementsByClassName('textColumn')[0]; a.scrollTop = a.scrollHeight;"
        )
        return self

    def scroll_reader_panel_to_top(self):
        """Scrolls the first text panel to the top"""
        #todo
        return self

    def scroll_to_segment(self, ref):
        if isinstance(ref, basestring):
            ref = Ref(ref)
        assert isinstance(ref, Ref)
        #todo
        return self

    def scroll_nav_panel_to_bottom(self):
        # todo: handle multiple panels
        self.driver.execute_script(
            "var a = document.getElementsByClassName('content')[0]; a.scrollTop = a.scrollHeight;"
        )
        return self

    # Connections Panel
    def find_category_filter(self, name):
        WebDriverWait(self.driver, TEMPER).until(element_to_be_clickable((By.CSS_SELECTOR, '.categoryFilter[data-name="{}"]'.format(name))))
        return self.driver.find_element_by_css_selector('.categoryFilter[data-name="{}"]'.format(name))

    def find_text_filter(self, name):
        WebDriverWait(self.driver, TEMPER).until(element_to_be_clickable((By.CSS_SELECTOR, '.textFilter[data-name="{}"]'.format(name))))
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
        WebDriverWait(self.driver, TEMPER).until(element_to_be_clickable((By.CSS_SELECTOR, ".type-button-total")))
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

    #Source Sheets
    def load_sheets(self):
        self.driver.get(self.base_url + "/sheets")
        WebDriverWait(self.driver, TEMPER).until(element_to_be_clickable((By.CSS_SELECTOR, ".readerSheetsNav")))
        self.set_modal_cookie()
        return self
    
"""

                    Test Running Infrastructure

"""


class TestResult(object):
    def __init__(self, test, cap, success, message=""):
        assert isinstance(test, AtomicTest) or inspect.isclass(cap)
        assert isinstance(success, bool)
        self.cap = cap
        self.test = test
        self.success = success
        self.message = message

    def __str__(self):
        return "{} - {} on {}{}".format(
            "Pass" if self.success else "Fail",
            self.test.__class__.__name__,
            Trial.cap_to_string(self.cap),
            ": \n{}".format(self.message) if self.message else ""
        )


class ResultSet(object):
    def __init__(self, results=None):
        """
        :param results: list of TestResult objects, or a list of lists
        :return:
        """
        self._aggregated = False
        self._test_results = [] if results is None else results
        assert (isinstance(t, TestResult) for t in self._test_results)
        self._indexed_tests = {}

    def __str__(self):
        return "\n\n" + "\n".join([str(r) for r in self._test_results]) + "\n\n"

    def _aggregate(self):
        if not self._aggregated:
            for res in self._test_results:
                self._indexed_tests[(res.test.__class__, Trial.cap_to_short_string(res.cap))] = res.success
            self._aggregated = True

    def _results_as_matrix(self):
        self._aggregate()
        tests = list({res.test.__class__ for res in self._test_results})
        caps = list({Trial.cap_to_short_string(res.cap) for res in self._test_results})

        def text_result(test, cap):
            r = self._indexed_tests.get((test, cap), "s")
            if r is True:
                return "."
            if r is False:
                return "Fail"
            return r

        results = [[test.__name__] + [text_result(test, cap) for cap in caps] for test in tests]
        results = [[""] + caps] + results
        return results

    def number_passed(self):
        return len([t for t in self._test_results if t.success])

    def number_failed(self):
        return len([t for t in self._test_results if not t.success])

    def report(self):
        ret = "\n"

        # http://stackoverflow.com/a/13214945/213042
        matrix = self._results_as_matrix()
        s = [[str(e) for e in row] for row in matrix]
        lens = [max(map(len, col)) for col in zip(*s)]
        fmt = ' '.join('{{:{}}}'.format(x) for x in lens)
        table = [fmt.format(*row) for row in s]
        ret += '\n'.join(table)

        total_tests = len(self._test_results)
        passed_tests = self.number_passed()
        percentage_passed = (float(passed_tests) / total_tests) * 100
        ret += "\n\n{}/{} - {:.0f}% passed\n".format(passed_tests, total_tests, percentage_passed)
        return ret

    def include(self, result):
        self._aggregated = False
        if isinstance(result, TestResult):
            self._test_results.append(result)
        elif isinstance(result, list):
            for res in result:
                self.include(res)


class Trial(object):
    """
    Result Codes:
    . - pass
    F - Fail
    A - Abort
    """
    default_local_driver = webdriver.Chrome

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
            self.tests = get_every_build_tests(get_atomic_tests()) if tests is None else tests
            self.is_local = False
            platform = "sauce"  # After this initial setup - use the sauce platform
        elif platform == "local":
            self.is_local = True
            self.BASE_URL = LOCAL_URL
            self.caps = caps if caps else [self.default_local_driver]
            self.tests = get_atomic_tests() if tests is None else tests
        elif platform == "sauce":
            self.is_local = False
            self.BASE_URL = LOCAL_URL
            self.caps = caps if caps else SAUCE_CORE_CAPS
            self.tests = get_atomic_tests() if tests is None else tests
        else:
            self.is_local = False
            self.BASE_URL = REMOTE_URL
            self.caps = caps if caps else SAUCE_CAPS if platform == "sauce" else BS_CAPS
            self.tests = get_atomic_tests() if tests is None else tests
        self.isVerbose = verbose
        self.platform = platform
        self.build = build
        self._results = ResultSet()
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

    def _run_one_atomic_test(self, driver, test_class, cap):
        """
        :param test_class:
        :return:
        """
        name = "{} / {}".format(test_class.__name__, Trial.cap_to_string(cap))
        sys.stdout.write("{} - Starting\n".format(name) if self.isVerbose else "")
        sys.stdout.flush()
        assert issubclass(test_class, AtomicTest)
        test = test_class(driver, self.BASE_URL)
        try:
            driver.execute_script('"**** Enter {} ****"'.format(test))
            test.run()
            driver.execute_script('"**** Exit {} ****"'.format(test))
        except Exception as e:
            # msg = getattr(e, "message", None) or getattr(e, "msg", None)
            msg = traceback.format_exc()
            if self.isVerbose:
                sys.stdout.write("{} - Failed\n".format(name))
                sys.stdout.write(msg)
            else:
                sys.stdout.write("F")
            sys.stdout.flush()
            #if self.platform == "sauce":
            #    driver.execute_script("sauce: break")
            return TestResult(test, cap, False, msg)
        else:
            sys.stdout.write("{} - Passed\n".format(name) if self.isVerbose else ".")
            sys.stdout.flush()
            return TestResult(test, cap, True)

    def _should_test_run(self, mode, test, cap):
        if (mode == "multi_panel" and not test.multi_panel) or (mode == "single_panel" and not test.single_panel):
            return False
        if len(test.include) and self.cap_to_short_string(cap) not in test.include:
            return False
        if len(test.exclude) and self.cap_to_short_string(cap) in test.exclude:
            return False
        return True

    def _test_one(self, test, cap):
        driver = None
        try:
            if self.is_local:
                mode = "multi_panel"   # Assuming that local isn't single panel
            else:
                mode = cap.get("sefaria_mode")
                cap.update({
                    'name': "{} on {}".format(test.__name__, self.cap_to_string(cap)),
                    'build': self.build,
                })

            if not self._should_test_run(mode, test, cap):
                return None

            driver = self._get_driver(cap)
            result = self._run_one_atomic_test(driver, test, cap)
            if self.platform == "sauce":
                self.set_sauce_result(driver, result.success)
            driver.quit()
            return result
        except Exception as e:
            if driver is not None:
                driver.quit()
            name = "{} / {}".format(test.__name__, Trial.cap_to_string(cap))
            msg = traceback.format_exc()
            if self.isVerbose:
                sys.stdout.write("{} - Aborted\n".format(name))
                sys.stdout.write(msg)
            else:
                sys.stdout.write("A")
            sys.stdout.flush()
            return TestResult(test, cap, False, msg)

    def _test_on_all(self, test, _caps=None):
        """
        Given a test, test it on all browsers
        :param test:
        :return:
        """
        caps = _caps or self.caps
        sys.stdout.write("\n{}: ".format(test.__name__) if not self.isVerbose else "")
        sys.stdout.flush()
        tresults = []
        if self.parallel:
            p = Pool(self.thread_count)
            l = len(caps)
            try:
                tresults = p.map(_test_one_worker, zip([self]*l, [test]*l, caps))
            except Exception as e:
                msg = traceback.format_exc()
                if self.isVerbose:
                    sys.stdout.write("{} - Exception\n".format(test.__name__))
                    sys.stdout.write(msg)
                else:
                    sys.stdout.write("E")
                sys.stdout.flush()
                tresults = [TestResult(test, caps[0], False, msg)]
            p.close()
            p.join()
        else:
            for cap in caps:
                tresults.append(self._test_one(test, cap))

        #test failures twice, in order to avoid false failures
        failures = [tr for tr in tresults if tr is not None and tr.success is False]

        if len(failures) > 0 and _caps is None:
            sys.stdout.write("\nRetesting {} configurations on {}: ".format(len(failures), test.__name__)
                             if not self.isVerbose else "")
            sys.stdout.flush()
            second_test_results = self._test_on_all(test, [tr.cap for tr in failures])
            successes = [tr for tr in tresults if tr is not None and tr.success is True]
            return successes + second_test_results
        return [t for t in tresults if t is not None]

    def run(self):
        for test in self.tests:
            self._results.include(self._test_on_all(test))
        return self

    def results(self):
        return self._results

    @staticmethod
    def set_sauce_result(driver, result):
        base64string = base64.encodestring('%s:%s' % (SAUCE_USERNAME, SAUCE_ACCESS_KEY))[:-1]

        def set_test_status(jobid, passed=True):
            body_content = json.dumps({"passed": passed})
            connection = httplib.HTTPConnection("saucelabs.com")
            connection.request('PUT', '/rest/v1/%s/jobs/%s' % (SAUCE_USERNAME, jobid),
                               body_content,
                               headers={"Authorization": "Basic %s" % base64string})
            result = connection.getresponse()
            return result.status == 200

        set_test_status(driver.session_id, passed=result)
        return result

    @staticmethod
    def cap_to_string(cap):
        if inspect.isclass(cap):
            return cap.__module__.split(".")[-2]
        return (cap.get("deviceName") or  # sauce mobile
                cap.get("device") or  # browserstack mobile
                ("{} {} on {} {}".format(cap.get("browser"), cap.get("browser_version"), cap.get("os"), cap.get("os_version")) if cap.get("browser") else  # browserstack desktop
                "{} {} on {}".format(cap.get('browserName'), cap.get("version"), cap.get('platform'))))  # sauce desktop

    @staticmethod
    def cap_to_short_string(cap):
        if inspect.isclass(cap):
            return cap.__module__.split(".")[-2]
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


def get_test_suite_keys():
    return list(set([t.suite_key for t in get_atomic_tests()]))


def get_tests_in_suite(key):
    return [t for t in get_atomic_tests() if t.suite_key == key]


def get_mobile_tests(tests):
    return [t for t in tests if t.mobile]


def get_desktop_tests(tests):
    return [t for t in tests if t.desktop]


def get_multiplatform_tests(tests):
    return [t for t in tests if t.desktop and t.mobile]


def get_every_build_tests(tests):
    return [t for t in tests if t.every_build]

