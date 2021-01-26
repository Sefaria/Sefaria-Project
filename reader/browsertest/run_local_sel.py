# This script runs all available tests locally, and displays a report
__package__ = "reader.browsertest"

import sys
from selenium import webdriver
from optparse import OptionParser
import django
django.setup()
from .framework import Trial
from . import basic_tests

from .framework.config import LOCAL_SELENIUM_CAPS

if __name__ == '__main__':
    parser = OptionParser()
    parser.add_option("-t", "--tests", dest="tests", help="Comma separated list of tests to run")
    parser.add_option("-p", "--parallel", dest="parallel", action='store_true', help="Run multiple platforms in parallel")

    options, user_args = parser.parse_args()

    tests = None
    if options.tests:
        tests = [getattr(basic_tests, t) for t in options.tests.split(",")]

    caps = LOCAL_SELENIUM_CAPS

    t = Trial(platform="localselenium", caps=caps, tests=tests, parallel=options.parallel, verbose=True)
    t.run()
    print("Done running the Trials")
    results = t.results()
    print("Starting to print the report")

    print(results.report())
    print("Done printing the report")
    fails = results.number_failed()
    if fails > 0:
        sys.stderr.write(str(results))
        sys.stderr.flush()
    print("Done reporting failures")

    sys.exit(fails)