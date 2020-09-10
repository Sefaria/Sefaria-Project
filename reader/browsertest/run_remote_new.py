# This script runs all available tests on the remote service, and displays a report
# It takes the build name as its only command line argument
__package__ = "reader.browsertest"
import django
django.setup()
from .framework import Trial
from . import basic_tests    # This is in fact needed - to register subclasses Trial, etc.
import sys

# t = Trial(platform="remote", build=None, verbose=True, seleniumServerHostname="https://seforenzo:f5d18673-f960-44fb-9a0c-6e3252ef246b@ondemand.us-west-1.saucelabs.com:443/wd/hub")
t = Trial(platform="remote", build=None, verbose=True, seleniumServerHostname="http://selenium-deadbeef:4444/wd/hub")
t.run()
results = t.results()

print(results.report())
fails = results.number_failed()
if fails > 0:
    sys.stderr.write(str(results))
    sys.stderr.flush()
sys.exit(fails)
