
from config import *
from selenium import webdriver
from random import shuffle
from multiprocessing import Pool


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
    return cap.get("device") or "{} {} on {} {}".format(cap.get("browser"), cap.get("browser_version"), cap.get("os"), cap.get("os_version"))


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


def test_all(build, caps = None):
    tests = get_atomic_tests()
    shuffle(tests)

    caps = caps or DESKTOP + MOBILE
    for cap in caps:
        cap.update({
            'build': build,
            'project': 'Reader S2',
            'tests': tests
        })

    p = Pool(MAX_THREADS)
    results = p.map(_test_on_one_browser, caps)
    print "\n".join(results)


def one_test_on_one_browser(test_class, cap):
    cap["tests"] = [test_class]
    result = _test_on_one_browser(cap)
    print result


def _test_on_one_browser(cap):
    tests = cap.pop("tests")
    driver = get_browserstack_driver(cap)

    description = '"' + "Test order: " + ", ".join([test.__name__ for test in tests]) + '"'
    driver.execute_script(description)

    # Insure that we're on s2
    driver.get(REMOTE_URL + "/s2")

    for test_class in tests:
        test = test_class(REMOTE_URL)
        try:
            driver.execute_script('"**** Enter {} ****"'.format(test_class.__name__))
            test.run(driver)
            driver.execute_script('"**** Exit {} ****"'.format(test_class.__name__))
        except Exception as e:
            return "Fail: {} on {}: {}".format(test_class.__name__, cap_to_string(cap), e)
    driver.quit()
    return "Pass: {}".format(cap_to_string(cap))


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
