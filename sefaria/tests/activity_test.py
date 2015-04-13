# -*- coding: utf-8 -*-
import pytest

from .. import history


def setup_module(module): 
	global activity_a, activity_b, activity_c, activity_d
	activity_a = {
		"ref": "Job 2:2",
		"rev_type": "edit text",
		"user": 1,
		"version": "Test Version",
		"language": "he",
	}
	activity_b = {
		"ref": "Job 2:3",
		"rev_type": "edit text",
		"user": 1,
		"version": "Test Version",
		"language": "he",
	}

	activity_c = {
		"ref": "Job 2:4",
		"rev_type": "edit text",
		"user": 1,
		"version": "Test Version",
		"language": "he",
	}

	activity_d = {
		"ref": "Job 3:2",
		"rev_type": "edit text",
		"user": 1,
		"version": "Test Version",
		"language": "he",
	}



class Test_collapse_activity():

	def test_catch_collapse(self):
		collapsed = history.collapse_activity([activity_a, activity_b])
		assert len(collapsed) == 1

	def test_no_collapse(self):
		collapsed = history.collapse_activity([activity_a, activity_d])
		assert len(collapsed) == 2