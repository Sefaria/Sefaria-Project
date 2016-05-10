from framework import one_test_on_one_browser, BS_DESKTOP, test_all_on_bstack, test_all_on_sauce, SAUCE_DESKTOP
from basic_tests import *

#one_test_on_one_browser(LoadRefAndClickSegment, DESKTOP[0])
test_all_on_sauce("build_16", [SAUCE_DESKTOP[2]])