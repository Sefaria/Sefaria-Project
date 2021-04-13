# This script runs all available tests on the remote service, and displays a report
# It takes the build name as its only command line argument
__package__ = "reader.browsertest"
import django
django.setup()
from .framework import Trial
from . import basic_tests    # This is in fact needed - to register subclasses Trial, etc.
import sys
import os

from .framework.seleniumManager import SeleniumDriverManager as sdm


# Get environment variables
seleniumServerUrl = os.environ['SELENIUM_SERVER_URL']
targetApplicationUrl = os.environ['APPLICATION_URL']

t = Trial(platform="github", parallel=None, build=None, verbose=True, seleniumServerHostname=seleniumServerUrl, targetApplicationUrl="https://vecino.cauldron.sefaria.org")
t.run()

print("DONE RUNNING TESTS")
results = t.results()

print(results.report())
fails = results.number_failed()
if fails > 0:
    sys.stderr.write(str(results))
    sys.stderr.flush()
print("There were {} test failures".format(fails))
results = t.results()

sys.exit(fails)
