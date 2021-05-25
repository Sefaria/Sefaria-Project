# This script runs all available tests on the remote service, and displays a report
# It takes the build name as its only command line argument
__package__ = "reader.browsertest"


import sys
from selenium import webdriver
from optparse import OptionParser

import django
django.setup()

from .framework import Trial
from . import basic_tests    # This is in fact needed - to register subclasses Trial, etc.
import sys
import os

build = os.getenv("GITHUB_SHA_SHORT", "deadbeef")

if __name__ == '__main__':
    parser = OptionParser()
    parser.add_option("-t", "--tests", dest="tests", help="Comma separated list of tests to run")
    parser.add_option("-p", "--parallel", dest="parallel", action='store_true', help="Run multiple platforms in parallel")

    options, user_args = parser.parse_args()

    tests = None
    if options.tests:
        tests = [getattr(basic_tests, t) for t in options.tests.split(",")]

    t = Trial(platform="githubnew", build=build, parallel=options.parallel, tests=tests, verbose=True)
    t.run()
    print("Done running the Trials")
    results = t.results()
    fails = results.number_failed()

    print(results.report())
    sys.exit(fails)
