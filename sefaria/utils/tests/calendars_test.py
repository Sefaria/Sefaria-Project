# -*- coding: utf-8 -*-

import sefaria.utils.calendars as c
from datetime import date
from sefaria.system.database import db


def setup_module(module): 
	db.dafyomi.insert_many([
		{
			'date': '1/1/1100',
			'daf': 'Berakhot 2'
		},
		{
			'date': '1/2/1100',
			'daf': 'Berakhot 3',
			'displayValue': {
				'en': 'Funny Name!',
				'he': 'משהו מצחיק'
			}
		}
	])


def teardown_module():
	db.dafyomi.delete_one({'date': '1/1/1100'})
	db.dafyomi.delete_one({'date': '1/2/1100'})


class Test_daf_yomi():

	def test_simple(self):
		df = c.daf_yomi(date(1100, 1, 1))[0]
		keys = ['title', 'displayValue', 'url', 'ref', 'order', 'category']
		assert all(k in df for k in keys)
		assert df['title']['en'] == 'Daf Yomi'
		assert df['title']['he'] == 'דף יומי'
		assert df['displayValue']['en'] == 'Berakhot 2'
		assert df['displayValue']['he'] == 'ברכות ב׳'
		assert df['ref'] == 'Berakhot 2'
		assert df['url'] == 'Berakhot.2'
		assert df['order'] == 3
		assert df['category'] == 'Talmud'

	def test_special_display(self):
		df = c.daf_yomi(date(1100, 1, 2))[0]
		assert df['ref'] == 'Berakhot 3'
		assert df['displayValue']['en'] == 'Funny Name!'
		assert df['displayValue']['he'] == 'משהו מצחיק'
		assert df['url'] == 'Berakhot.3'

class Test_this_weeks_parasha():
	pass
	#c.this_weeks_parasha()