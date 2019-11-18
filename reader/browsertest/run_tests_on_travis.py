# This script runs all available tests on the remote service, and displays a report
# It takes the build name as its only command line argument
import django
django.setup()

from framework import Trial
import sys

build = sys.argv[1]

t = Trial(platform="travis", build=build)
t.run()
results = t.results()

print(results.report())
fails = results.number_failed()
if fails > 0:
    sys.stderr.write(str(results))
    sys.stderr.flush()
sys.exit(fails)
