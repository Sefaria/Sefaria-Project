
from config import *
from selenium import webdriver
from random import shuffle
from multiprocessing import Pool
import inspect


class AtomicTest(object):
    """
    Abstract Class
    AtomicTests are designed to be composed in any order, so as to test a wide range of orders of events
    A concrete AtomicTest implements the run method.
    """
    suite_key = None
    mobile = True  # run this test on mobile?
    desktop = True  # run this test on desktop?

    def __init__(self, driver, url):
        self.base_url = url
        self.driver = driver
        if not self.suite_key:
            raise Exception("Missing required variable - test_suite")
        if not self.mobile and not self.desktop:
            raise Exception("Tests must run on at least one of mobile or desktop")

    def run(self):
        raise Exception("AtomicTest.run() needs to be defined for each test.")


class TestResult(object):
    def __init__(self, test, cap, success, message=""):
        assert isinstance(test, AtomicTest) or inspect.isclass(cap)
        assert isinstance(success, bool)
        assert isinstance(message, basestring)
        self.cap = cap
        self.test = test
        self.success = success
        self.message = message

    def __str__(self):
        return "{} - {} on {}{}".format(
            "Pass" if self.success else "Fail",
            self.test.__class__.__name__,
            Trial.cap_to_string(self.cap),
            ": {}".format(self.message) if self.message else ""
        )


class ResultSet(object):
    def __init__(self, results=None):
        """
        :param results: list of TestResult objects, or a list of lists
        :return:
        """
        self.testResults = [] if results is None else results
        assert (isinstance(t, TestResult) for t in self.testResults)

    def include(self, result):
        if isinstance(result, TestResult):
            self.testResults.append(result)
        elif isinstance(result, list):
            for res in result:
                self.include(res)

    def __str__(self):
        return "\n".join([str(r) for r in self.testResults])


class Trial(object):
    default_local_driver = webdriver.Chrome

    def __init__(self, platform="local", build=None, tests=None, caps=None):
        """
        :param caps: If local: webdriver classes, if remote, dictionaries of capabilities
        :param platform: "sauce", "bstack", "local"
        :return:
        """
        self.tests = get_atomic_tests() if tests is None else tests
        assert platform in ["sauce", "bstack", "local"]
        self.platform = platform
        self.build = build
        self._results = ResultSet()
        if platform == "local":
            self.is_local = True
            self.BASE_URL = LOCAL_URL
            self.caps = caps if caps else [self.default_local_driver]
        else:
            self.is_local = False
            self.BASE_URL = REMOTE_URL
            self.caps = caps if caps else SAUCE_CAPS if platform == "sauce" else BS_CAPS

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

        #todo: better way to do this?
        driver.get(self.BASE_URL + "/s2")
        return driver

    def _test_one(self, driver, test_class, cap):
        """
        :param test_class:
        :return:
        """
        assert issubclass(test_class, AtomicTest)
        test = test_class(driver, self.BASE_URL)
        try:
            driver.execute_script('"**** Enter {} ****"'.format(test_class.__name__))
            test.run()
            driver.execute_script('"**** Exit {} ****"'.format(test_class.__name__))
        except Exception as e:
            return TestResult(test, cap, False, e.message)
        else:
            return TestResult(test, cap, True)
    '''
    def _test_each_on(self, cap):
        """
        Given a browser, test every test on that browser
        :param cap:
        :return:
        """
        results = []
        for test in self.tests:
            # TODO: Mobile / Desktop
            driver = self._get_driver(cap)
            results.append(self._test_one(driver, test))
            driver.quit()
        return results
    '''

    def _test_on_all(self, test):
        """
        Given a test, test it on all browsers
        :param test:
        :return:
        """
        tresults = []
        for cap in self.caps:
            # TODO: Mobile / Desktop
            if not self.is_local:
                cap.update({
                    'name': "{} on {}".format(test.__name__, self.cap_to_string(cap)),
                    'build': self.build,
                })
            driver = self._get_driver(cap)
            tresults.append(self._test_one(driver, test, cap))
            driver.quit()
        return tresults

    def run(self):
        for test in self.tests:
            self._results.include(self._test_on_all(test))
        return self

    def results(self):
        return self._results

    @staticmethod
    def cap_to_string(cap):
        if inspect.isclass(cap):
            return cap.__name__
        return (cap.get("deviceName") or  # sauce mobile
                cap.get("device") or  # browserstack mobile
                "{} {} on {} {}".format(cap.get("browser"), cap.get("browser_version"), cap.get("os"), cap.get("os_version")) if cap.get("browser") else  # browserstack desktop
                "{} {} on {}".format(cap.get('browserName'), cap.get("version"), cap.get('platform')))  # sauce desktop


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



'''
    def test_local(self):
        tests = get_atomic_tests()
        shuffle(tests)
        driver = self._get_driver()

        # Insure that we're on s2
        driver.get(LOCAL_URL + "/s2")

        print ", ".join([test.__name__ for test in tests])

        for test_class in tests:
            test = test_class(LOCAL_URL)
            test.run(driver)
        driver.quit()


    def _test_all(self, build):
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
'''




