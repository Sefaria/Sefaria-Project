from framework import *
import basic_tests
import sys

build = sys.argv[1]

t = Trial(platform="sauce", build=build)
t.run()
print t.results().report()