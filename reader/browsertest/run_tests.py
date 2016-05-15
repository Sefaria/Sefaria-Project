# This script runs all available tests on the remote service, and displays a report
# It takes the build name as its only command line argument

from framework import *
import basic_tests
import sys

build = sys.argv[1]

t = Trial(platform="sauce", build=build)
t.run()
print t.results().report()