# This script runs one test, locally, and displays a report
# It takes one argument - the name of the class to run
# For instance: python3 ./run_one_local.py ClickVersionedSearchResultDesktop
__package__ = "reader.browsertest"

import django
django.setup()

from .framework import Trial
from . import basic_tests
import sys
from time import gmtime, strftime

test = sys.argv[1]
klass = getattr(basic_tests, test)
assert klass

t = Trial(platform="sauce",
          tests=[klass],
          build="{} - {}".format(klass.__name__, strftime("%Y-%m-%d %H:%M:%S", gmtime())),
          verbose=True).run()
print(t.results())
