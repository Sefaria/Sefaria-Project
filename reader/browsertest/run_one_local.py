# This script runs one test, locally, and displays a report
# It takes one argument - the name of the class to run
# For instance: python run_one_local.py ClickVersionedSearchResultDesktop
__package__ = "reader.browsertest"

import sys

import django

from . import basic_tests
from .framework import Trial

django.setup()

test = sys.argv[1]
klass = getattr(basic_tests, test)
assert klass

t = Trial(tests=[klass], verbose=True).run()
print(t.results())
