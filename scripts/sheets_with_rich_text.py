# -*- coding: utf-8 -*-
"""
Code stump to walk through all sources on sheets to find various settings
"""

from sefaria.model import *
from sefaria.system.database import db

sheets = db.sheets.find()

sheets_with_resized_text = set([])
sheets_with_changed_fonts = set([])
sheets_with_tables = set([])
sheets_with_bold = set([])
sheets_with_italics = set([])
sheets_with_bg_color = set([])
sheets_with_font_color = set([])


for sheet in sheets:
	sources = sheet.get("sources", [])
	for source in sources:
		if "text" in source:
			for lang in source["text"]:
				if source["text"][lang] != None and "font-size" in source["text"][lang]:
					sheets_with_resized_text.add(sheet["id"])
				if source["text"][lang] != None and "font-family" in source["text"][lang]:
					sheets_with_changed_fonts.add(sheet["id"])
				if source["text"][lang] != None and "<table" in source["text"][lang]:
					sheets_with_tables.add(sheet["id"])
				if source["text"][lang] != None and "<strong" in source["text"][lang]:
					sheets_with_bold.add(sheet["id"])
				if source["text"][lang] != None and "<em" in source["text"][lang]:
					sheets_with_italics.add(sheet["id"])
				if source["text"][lang] != None and "background-color:#" in source["text"][lang]:
					sheets_with_bg_color.add(sheet["id"])
				if source["text"][lang] != None and "color:#" in source["text"][lang]:
					sheets_with_font_color.add(sheet["id"])

		elif "comment" in source:
			if source["comment"] != None and "font-size" in source["comment"]:
				sheets_with_resized_text.add(sheet["id"])
			if source["comment"] != None and "font-family" in source["comment"]:
				sheets_with_changed_fonts.add(sheet["id"])
			if source["comment"] != None and "<table" in source["comment"]:
				sheets_with_tables.add(sheet["id"])
			if source["comment"] != None and "<strong" in source["comment"]:
				sheets_with_bold.add(sheet["id"])
			if source["comment"] != None and "<em" in source["comment"]:
				sheets_with_italics.add(sheet["id"])
			if source["comment"] != None and "background-color:#" in source["comment"]:
				sheets_with_bg_color.add(sheet["id"])
			if source["comment"] != None and "color:#" in source["comment"]:
				sheets_with_font_color.add(sheet["id"])


		elif "outsideBiText" in source:
			for lang in source["outsideBiText"]:
				if source["outsideBiText"][lang] != None and "font-size" in source["outsideBiText"][lang]:
					sheets_with_resized_text.add(sheet["id"])
				if source["outsideBiText"][lang] != None and "font-family" in source["outsideBiText"][lang]:
					sheets_with_changed_fonts.add(sheet["id"])
				if source["outsideBiText"][lang] != None and "<table" in source["outsideBiText"][lang]:
					sheets_with_tables.add(sheet["id"])
				if source["outsideBiText"][lang] != None and "<strong" in source["outsideBiText"][lang]:
					sheets_with_bold.add(sheet["id"])
				if source["outsideBiText"][lang] != None and "<em" in source["outsideBiText"][lang]:
					sheets_with_italics.add(sheet["id"])
				if source["outsideBiText"][lang] != None and "background-color:#" in source["outsideBiText"][lang]:
					sheets_with_bg_color.add(sheet["id"])
				if source["outsideBiText"][lang] != None and "color:#" in source["outsideBiText"][lang]:
					sheets_with_font_color.add(sheet["id"])

		elif "outsideText" in source:
			if source["outsideText"] != None and "font-size" in source["outsideText"]:
				sheets_with_resized_text.add(sheet["id"])
			if source["outsideText"] != None and "font-family" in source["outsideText"]:
				sheets_with_changed_fonts.add(sheet["id"])
			if source["outsideText"] != None and "<table" in source["outsideText"]:
				sheets_with_tables.add(sheet["id"])
			if source["outsideText"] != None and "<strong" in source["outsideText"]:
				sheets_with_bold.add(sheet["id"])
			if source["outsideText"] != None and "<em" in source["outsideText"]:
				sheets_with_italics.add(sheet["id"])
			if source["outsideText"] != None and "background-color:#" in source["outsideText"]:
				sheets_with_bg_color.add(sheet["id"])
			if source["outsideText"] != None and "color:#" in source["outsideText"]:
				sheets_with_font_color.add(sheet["id"])

print("****************************")
print("sheets_with_resized_text:" + str(len(sheets_with_resized_text)))
#print sheets_with_resized_text
print("****************************")
print("sheets_with_changed_fonts:" + str(len(sheets_with_changed_fonts)))
#print sheets_with_changed_fonts
print("****************************")
print("sheets_with_tables:" + str(len(sheets_with_tables)))
#print sheets_with_tables
print("****************************")
print("sheets_with_bold:" + str(len(sheets_with_bold)))
#print sheets_with_bold
print("****************************")
print("sheets_with_italics:" + str(len(sheets_with_italics)))
#print sheets_with_italics
print("****************************")
print("sheets_with_bg_color:" + str(len(sheets_with_bg_color)))
#print sheets_with_bg_color
print("****************************")
print("sheets_with_font_color:" + str(len(sheets_with_font_color)))
#print sheets_with_font_color
