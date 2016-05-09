from framework import test_all_on_bstack, test_all_on_sauce
from basic_tests import *

import sys

build = sys.argv[1]

#test_all_on_bstack(build)
test_all_on_sauce(build)