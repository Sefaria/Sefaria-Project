from framework import one_test_on_one_browser, BS_DESKTOP, test_all_on_bstack
from basic_tests import *

#one_test_on_one_browser(LoadRefAndClickSegment, DESKTOP[0])
test_all_on_bstack("build_14", [BS_DESKTOP[2]])