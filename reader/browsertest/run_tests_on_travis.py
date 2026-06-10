# This script runs all available tests on the remote service, and displays a report
# It takes the build name as its only command line argument
__package__ = "reader.browsertest"

import django
django.setup()

from .framework import Trial
from . import basic_tests    # This is in fact needed - to register subclasses Trial, etc.
import sys

build = sys.argv[1]

# Travis requires the following builld variables
# SAUCE_USERNAME
# SAUCE_ACCESS_KEY 
# Why doesn't the sauce platform require this?

t = Trial(platform="travis", build=build)
t.run()
results = t.results()

print(results.report())
fails = results.number_failed()
if fails > 0:
    sys.stderr.write(str(results))
    sys.stderr.flush()
sys.exit(fails)
