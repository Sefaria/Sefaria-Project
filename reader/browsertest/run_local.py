# This script runs all available tests locally, and displays a report
__package__ = "reader.browsertest"

import sys
from selenium import webdriver
from appium import webdriver as appiumWebdriver
from optparse import OptionParser
import django
django.setup()
from .framework import Trial
from . import basic_tests


def _get_appium_webdriver(caps):
    wd = appiumWebdriver.Remote('http://0.0.0.0:4723/wd/hub', caps)
    wd.implicitly_wait(3)
    wd.set_script_timeout(3)
    return wd


def get_ios_webdriver():
    caps = {
        "automationName": "XCUITest",
        "platformName": "iOS",
        "platformVersion": "13.2",
        'browserName': 'Safari',
        "deviceName": "iPhone 8"
    }
    return _get_appium_webdriver(caps)


def get_android_webdriver():
    caps = {
        "platformName": 'Android',
        "platformVersion": '10',
        "automationName": 'uiautomator2',
        'browserName': 'Chrome',
        "deviceName": 'Android Emulator',
    }
    return _get_appium_webdriver(caps)


def get_chrome_mobile_webdriver():
    mobile_emulation = { "deviceName": "Nexus 5" }
    chrome_options = webdriver.ChromeOptions()
    chrome_options.add_experimental_option("mobileEmulation", mobile_emulation)
    driver = webdriver.Chrome(options=chrome_options)
    return driver



if __name__ == '__main__':
    parser = OptionParser()
    parser.add_option("-t", "--tests", dest="tests", help="Comma separated list of tests to run")
    parser.add_option("-i", "--ios", dest="ios", action='store_true', help="Run tests on Appium/iOS")
    parser.add_option("-a", "--android", dest="android", action='store_true', help="Run tests on Appium/Android")
    parser.add_option("-c", "--chrome", dest="chrome", action='store_true', help="Run tests on Chrome")
    parser.add_option("-m", "--chrome-mobile", dest="chrome_mobile", action='store_true', help="Run tests on Chrome Mobile")
    parser.add_option("-f", "--firefox", dest="firefox", action='store_true', help="Run tests on Firefox")
    parser.add_option("-s", "--safari", dest="safari", action='store_true', help="Run tests on Safari")
    parser.add_option("-p", "--parallel", dest="parallel", action='store_true', help="Run multiple platforms in parallel")

    options, user_args = parser.parse_args()

    tests = None
    if options.tests:
        tests = [getattr(basic_tests, t) for t in options.tests.split(",")]

    caps = []
    if options.ios:
        ios_webdriver = get_ios_webdriver()
        caps += [ios_webdriver]
    if options.android:
        caps += [get_android_webdriver()]
    if options.chrome:
        caps += [webdriver.Chrome]
    if options.firefox:
        caps += [webdriver.Firefox]
    if options.safari:
        caps += [webdriver.Safari]
    if options.chrome_mobile:
        chrome_mobile_driver = get_chrome_mobile_webdriver()
        caps += [chrome_mobile_driver]

    t = Trial(caps=caps, tests=tests, parallel=options.parallel, verbose=True)
    t.run()
    results = t.results()

    print(results.report())
    fails = results.number_failed()
    if fails > 0:
        sys.stderr.write(str(results))
        sys.stderr.flush()
    if options.ios:
        ios_webdriver.quit()
    if options.chrome_mobile:
        chrome_mobile_driver.quit()

    sys.exit(fails)