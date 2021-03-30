# -*- coding: utf-8 -*-
import django
django.setup()

import re
import csv
import requests
from io import StringIO
from pprint import pprint

from sefaria.model import *
from sefaria.sheets import save_sheet
from sefaria.system.database import db


column_types = [
	"owner_email",
	"title",
	None,
	"collection_url",
	"audio_url",
	"topics",
	"sources",
	"free_text"
]

template = {
	"options": {"numbered": False},
	"status": "public",
}

url = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSL8vy0MbanOBqSQIW_h73uolEFphleIL08OvpJwhQuCH82cUyjTcyoOH817anHRVYQYnMDxXy16kf1/pub?gid=0&single=true&output=csv'
response = requests.get(url)
data = response.content.decode("utf-8")
cr = csv.reader(StringIO(data))
rows = list(cr)[1:]


class GeneratedSheet():
	def __init__(self, column_types, data, template={}):
		self.column_types = column_types
		self.data = data

		self.sheet = {
			"sources": []
		}
		self.sheet.update(template)

		self.generate()

	def generate(self):

		for i in range(len(self.data)):
			if self.column_types[i]:
				self.process_item(self.column_types[i], self.data[i])
		self.normalize()

	def process_item(self, type, item):
		switcher = {
			"title":          self.process_title,
			"owner_email":    self.process_owner_email,
			"collection_url": self.process_collection_url,
			"audio_url":      self.process_audio_url,
			"topics":         self.process_topics,
			"sources":        self.process_sources,
			"free_text":      self.process_free_text,
		}
		switcher[type](item)

	def process_title(self, title):
		self.sheet["title"] = title

	def process_owner_email(self, email):
		profile = UserProfile(email=email)
		self.sheet["owner"] = profile.id

	def process_collection_url(self, url):
		slug = url.split("/")[-1]
		self.sheet["displayedCollection"] = slug

	def process_audio_url(self, url):
		self.sheet["sources"].append({
			"media": url
		})

	def process_topics(self, topics):
		topics = topics.split(", ")
		self.sheet["topics"] = [{"asTyped": topic} for topic in topics]

	def process_sources(self, sources):
		pass

	def process_free_text(self, text):
		text = re.sub(r"\n+", "\n", text)
		paragraphs = text.split("\n")
		for paragraph in paragraphs:
			self.sheet["sources"].append({
				"outsideText": paragraph
			})

	def print(self):
		pprint(self.sheet)

	def normalize(self):
		if "options" not in self.sheet:
			self.sheet["options"] = {}

		if not self.sheet.get("owner", None):
			# for debug purposes on a server without the intended user
			profile = UserProfile(email="blocks+test@gmail.com")
			self.sheet["owner"] = profile.id

	def validate(self):
		pass

	def save(self):
		sheet = save_sheet(self.sheet, self.sheet["owner"])
		self.post_save()
		print("Saved sheet {}".format(sheet["id"]))

	def post_save(self):
		if "displayedCollection" in self.sheet:
			self.add_to_collection(self.sheet["displayedCollection"])

	def add_to_collection(self, slug):
		pass


#gs = GeneratedSheet(column_types=column_types, data=rows[0], template=template)
