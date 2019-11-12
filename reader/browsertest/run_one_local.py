# This script runs one test, locally, and displays a report
# It takes one argument - the name of the class to run
# For instance: python run_one_local.py ClickVersionedSearchResultDesktop
import django
django.setup()
from .framework import *
from . import basic_tests
import sys

test = sys.argv[1]
klass = getattr(basic_tests, test)
assert klass

t = Trial(tests=[klass], verbose=True).run()
print(t.results())
