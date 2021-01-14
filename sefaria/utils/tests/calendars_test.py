# -*- coding: utf-8 -*-
import pytest
import sefaria.utils.calendars as c


def setup_module(module): 
	pass

@pytest.mark.xfail
class Test_daf_yomi():
	assert False
	#c.daf_yomi()

@pytest.mark.xfail
class Test_this_weeks_parasha():
	assert False
	#c.this_weeks_parasha()