# This script runs all available tests on the remote service, and displays a report
# It takes the build name as its only command line argument

from framework import *
import basic_tests
import sys

build = sys.argv[1]

t = Trial(platform="travis", build=build)
t.run()
results = t.results()

print results.report()
sys.exit(results.number_failed())
