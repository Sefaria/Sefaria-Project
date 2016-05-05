
from config import *
from selenium import webdriver
from selenium.common.exceptions import StaleElementReferenceException, NoSuchElementException
from random import shuffle
from multiprocessing import Pool
import time


def get_browserstack_driver(desired_cap):
    driver = webdriver.Remote(
        command_executor='http://{}:{}@hub.browserstack.com:80/wd/hub'.format(BS_USER, BS_KEY),
        desired_capabilities=desired_cap)
    driver.implicitly_wait(30)

    return driver


def get_local_driver():
    driver = webdriver.Chrome()
    driver.implicitly_wait(30)
    return driver


def cap_to_string(cap):
    return cap.get["device"] or "{} {} on {} {}".format(cap.get("browser"), cap.get("browser_version"), cap.get("os"), cap.get("os_version"))


class AtomicTest(object):
    """
    Abstract Class
    AtomicTests are designed to be composed in any order, so as to test a wide range of orders of events
    A concrete AtomicTest implements the run method.
    """
    def __init__(self, url):
        self.base_url = url

    def run(self, driver):
        pass


def get_subclasses(c):
    subclasses = c.__subclasses__()
    for d in list(subclasses):
        subclasses.extend(get_subclasses(d))

    return subclasses


def get_atomic_tests():
    return get_subclasses(AtomicTest)


def test_all(build):
    tests = get_atomic_tests()
    shuffle(tests)
    description = ", ".join([test.__name__ for test in tests])

    caps = DESKTOP + MOBILE
    for cap in caps:
        cap.update({
            'build': build,
            'project': 'Reader S2',
            'name': description,
            'tests': tests
        })

    p = Pool(10)
    results = p.map(_test_all_on_one_browser, caps)
    print "\n".join(results)


def _test_all_on_one_browser(cap):
    tests = cap.pop("tests")
    driver = get_browserstack_driver(cap)

    # Insure that we're on s2
    driver.get(REMOTE_URL + "/s2")

    for test_class in tests:
        test = test_class(REMOTE_URL)
        try:
            test.run(driver)
        except:
            return "Fail: {}".format(cap_to_string(cap))
        else:
            return "Pass: {}".format(cap_to_string(cap))

    driver.quit()


def test_local():
    tests = get_atomic_tests()
    shuffle(tests)
    driver = get_local_driver()

    # Insure that we're on s2
    driver.get(LOCAL_URL + "/s2")

    print ", ".join([test.__name__ for test in tests])

    for test_class in tests:
        test = test_class(LOCAL_URL)
        test.run(driver)
    driver.quit()


# http://www.obeythetestinggoat.com/how-to-get-selenium-to-wait-for-page-load-after-a-click.html
# use as:
# with wait_for_page_load(driver):
#     assert test == test1
class wait_for_page_load(object):
    def __init__(self, browser):
        self.browser = browser

    def __enter__(self):
        self.old_page = self.browser.find_element_by_tag_name('html')

    def page_has_loaded(self):
        new_page = self.browser.find_element_by_tag_name('html')
        return new_page.id != self.old_page.id

    def __exit__(self, *_):
        wait_for(self.page_has_loaded)


def wait_for(condition_function):
    start_time = time.time()
    while time.time() < start_time + 6:
        if condition_function():
            return True
        else:
            time.sleep(0.1)
    raise Exception(
        'Timeout waiting for {}'.format(condition_function.__name__)
        )


def click_and_expect(element_to_click, driver, css_selector):
    element_to_click.click()

    def element_has_appeared():
        try:
            driver.find_element_by_css_selector(css_selector)
            return True
        except NoSuchElementException:
            return False

    wait_for(element_has_appeared)


def click_and_wait_for_change(element_to_click, element_to_poll = None):
    """
    :param element_to_click:
    :param element_to_poll: Element that we expect to go stale after the click finishes
    :return:
    """
    element_to_poll = element_to_poll or element_to_click
    element_to_click.click()

    def link_has_gone_stale():
        try:
            # poll the link with an arbitrary call
            element_to_poll.find_elements_by_id('doesnt-matter')
            return False
        except StaleElementReferenceException:
            return True

    wait_for(link_has_gone_stale)
