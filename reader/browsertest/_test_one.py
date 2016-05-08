from framework import one_test_on_one_browser, DESKTOP, test_all
from basic_tests import *

#one_test_on_one_browser(LoadRefAndClickSegment, DESKTOP[0])
test_all("build_14", [DESKTOP[0]])