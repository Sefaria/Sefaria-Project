# This script runs all available tests locally, and displays a report
import django
django.setup()
from framework import *
import basic_tests
import sys

t = Trial().run()
results = t.results()

print results.report()
fails = results.number_failed()
if fails > 0:
    sys.stderr.write(str(results))
    sys.stderr.flush()
sys.exit(fails)
