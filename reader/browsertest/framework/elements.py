
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


def get_sauce_driver(desired_cap):
    driver = webdriver.Remote(
        command_executor='http://{}:{}@ondemand.saucelabs.com:80/wd/hub'.format(SAUCE_USERNAME, SAUCE_ACCESS_KEY),
        desired_capabilities=desired_cap)
    driver.implicitly_wait(30)

    return driver


def get_local_driver():
    driver = webdriver.Chrome()
    driver.implicitly_wait(30)
    return driver


def cap_to_string(cap):
    return (cap.get("deviceName") or  # sauce mobile
            cap.get("device") or  # browserstack mobile
            "{} {} on {} {}".format(cap.get("browser"), cap.get("browser_version"), cap.get("os"), cap.get("os_version")) if cap.get("browser") else  # browserstack desktop
            "{} {} on {}".format(cap.get('browserName'), cap.get("version"), cap.get('platform')))  # sauce desktop


class AtomicTest(object):
    """
    Abstract Class
    AtomicTests are designed to be composed in any order, so as to test a wide range of orders of events
    A concrete AtomicTest implements the run method.
    """
    suite_key = None
    mobile = True  # run this test on mobile?
    desktop = True  # run this test on desktop?

    def __init__(self, url):
        self.base_url = url
        if not self.suite_key:
            raise Exception("Missing required variable - test_suite")
        if not self.mobile and not self.desktop:
            raise Exception("Tests must run on at least one of mobile or desktop")

    def run(self, driver):
        raise Exception("AtomicTest.run() needs to be defined for each test.")


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


def _test_all(build, caps, default_desktop_caps, default_mobile_caps, platform_string):
    p = Pool(MAX_THREADS)
    for key in get_test_suite_keys():
        tests = get_tests_in_suite(key)
        shuffle(tests)

        if not caps:
            for cap in default_desktop_caps:
                cap.update({
                    'name': "{} on {}".format(key, cap_to_string(cap)),
                    'build': build,
                    'tests': get_desktop_tests(tests),
                    "testing_platform": platform_string
                })
            for cap in default_mobile_caps:
                cap.update({
                    'name': "{} on {}".format(key, cap_to_string(cap)),
                    'build': build,
                    'tests': get_mobile_tests(tests),
                    "testing_platform": platform_string
                })
            caps = default_desktop_caps + default_mobile_caps
        else:
            for cap in caps:
                cap.update({
                    'name': "{} on {}".format(key, cap_to_string(cap)),
                    'build': build,
                    'tests': tests,  # Lazy assumption that all tests are run if caps are provided as an arg.
                    "testing_platform": platform_string
                })
        results = p.map(_test_on_one_browser, caps)
        print "\n\nSuite: {}".format(key)
        print "\n".join(results)


def test_all_on_bstack(build, caps = None):
    _test_all(build, caps, BS_DESKTOP, BS_MOBILE, "bstack")


def test_all_on_sauce(build, caps = None):
    _test_all(build, caps, SAUCE_DESKTOP, SAUCE_MOBILE, "sauce")


def one_test_on_one_browser(test_class, cap):
    cap["tests"] = [test_class]
    cap["testing_platform"] = "bstack"
    result = _test_on_one_browser(cap)
    print result


def _test_on_one_browser(cap):
    tests = cap.pop("tests")
    testing_platform = cap.pop("testing_platform")

    if testing_platform == "bstack":
        driver = get_browserstack_driver(cap)
    elif testing_platform == "sauce":
        driver = get_sauce_driver(cap)
    else:
        raise Exception("Unknown platform: {}".format(testing_platform))

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
            driver.quit()
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

