# This script runs all available tests locally, and displays a report

from framework import *
import basic_tests

t = Trial().run()
print t.results().report()
