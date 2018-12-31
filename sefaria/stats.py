from datetime import datetime
from collections import defaultdict
from random import randrange

from sefaria.model import *
from sefaria.system.exceptions import InputError
from sefaria.sheets import save_sheet, sheet_tag_counts
from sefaria.utils.util import strip_tags
from sefaria.system.database import db


class SheetStats(object):
	def __init__(self):
		self.show_count         = 20
		self.refs               = defaultdict(int)
		self.texts              = defaultdict(int)
		self.categories         = defaultdict(int)
		self.books              = defaultdict(int)
		self.refs_by_category   = defaultdict(lambda: defaultdict(int))
		self.refs_by_tag        = defaultdict(lambda: defaultdict(int))
		self.fragments          = defaultdict(list)
		self.languages          = defaultdict(int)
		self.untrans_texts      = defaultdict(int)
		self.untrans_categories = defaultdict(int)
		self.untrans_refs       = defaultdict(int)
		self.sources_count      = 0
		self.untrans_count      = 0
		self.comments_count     = 0
		self.outside_count      = 0
		self.fragments_count    = 0

	def run(self, query=None, test=0):
		"""
		Builds and sorts counts across all sheets.
		If `test` is not 0, only sample 1 in every `test` sheets to count.
		"""
		print "Loading sheets..."
		proj = {"sources.ref": 1, "tags": 1, "options": 1, "status": 1, "id": 1}
		if query:
			sheets            = db.sheets.find(query, proj)
			self.total = sheets.count()
			print "%d matching query" % sheets.count()
		else:
			sheets            = db.sheets.find()
			self.total        = sheets.count()
			print "%d Total" % self.total
			self.public_total = db.sheets.find({"status": "public"}, proj).count()
			print "%d Public" % self.public_total
		
		print "Processing tags..."
		self.top_tags     = sheet_tag_counts({})

		print "Processing sheets..."
		for sheet in sheets: 
			if test == 0 or randrange(test) == 1:
				self.count_sheet(sheet)

		print "Sorting..."
		self.sort()
		print "Done."
	
	def count_sheet(self, sheet):
		id = sheet.get("id", 1)
		if id % 1000 == 0:
			print '{0}%\r'.format(((id * 100)/self.total))
		self.count_sources(sheet.get("sources", []), sheet.get("tags", []), sheet.get("id", -1))
		if "options" in sheet and "language" in sheet["options"]:
			self.languages[sheet["options"]["language"]] += 1
		else:
			self.languages["bilingual"] += 1

	def count_sources(self, sources, tags, sheet_id):
		for s in sources:
			try:
				if "ref" in s and s["ref"] is not None:
					self.sources_count += 1
					oref = Ref(s["ref"]).padded_ref()
					self.refs[oref.normal()] += 1
					self.texts[oref.book] += 1
					self.categories[oref.index.categories[0]] += 1
					self.books[oref.index.title] += 1
					self.refs_by_category[oref.index.categories[0]][oref.normal()] += 1
					for tag in tags:
						self.refs_by_tag[tag][oref.normal()] += 1

					try:
						is_translated = oref.is_text_translated()
					except:
						is_translated = False 
					if not is_translated:
						self.untrans_categories[oref.index.categories[0]] += 1
						self.untrans_texts[oref.book] += 1
						self.untrans_refs[s["ref"]] += 1
						self.untrans_count += 1

						en = strip_tags(s.get("text", {}).get("en", ""))
						if len(en) > 25:
							self.fragments[s["ref"]].append(sheet_id)
							self.fragments_count += 1
				
				elif "comment" in s:
					self.comments_count += 1
				
				elif "outsideText" in s or "outsideBiText" in s:
					self.outside_count += 1
			except:
				continue

	def sort(self):
		self.sorted_refs               = sorted(self.refs.iteritems(), key=lambda x: -x[1])
		self.sorted_texts              = sorted(self.texts.iteritems(), key=lambda x: -x[1])
		self.sorted_categories         = sorted(self.categories.iteritems(), key=lambda x: -x[1])
		self.sorted_books              = sorted(self.books.iteritems(), key=lambda x: -x[1])
		self.sorted_untrans_refs       = sorted(self.untrans_refs.iteritems(), key=lambda x: -x[1])
		self.sorted_untrans_texts      = sorted(self.untrans_texts.iteritems(), key=lambda x: -x[1])
		self.sorted_untrans_categories = sorted(self.untrans_categories.iteritems(), key=lambda x: -x[1])
		self.sorted_fragments          = sorted(self.fragments.iteritems(), key=lambda x: -len(x[1]))

		self.sorted_refs_by_tag = {}
		for ref in self.refs_by_tag:
			self.sorted_refs_by_tag[ref] = sorted(self.refs_by_tag[ref].iteritems(), key=lambda x: -x[1])

		self.sorted_refs_by_category = {}
		for ref in self.refs_by_category:
			self.sorted_refs_by_category[ref] = sorted(self.refs_by_category[ref].iteritems(), key=lambda x: -x[1])

	def collapse_ref_counts(self, refs):
		"""
		Takes and returns a list of ref, count tuples. 
		Merge together results for refs for which one is a specification of the other.
		E.g., if "Shabbat 21a", and "Shabbat 21:5" both appear, add their counts together and keep the mores specific ref.
		"""
		collapsed_refs = {}
		for ref1 in refs:
			matched = False
			for ref2 in refs:
				if ref1 == ref2:
					continue
				oRef1, oRef2 = Ref(ref1[0]), Ref(ref2[0])
				if oRef2.contains(oRef1):
					collapsed_refs[ref1[0]] = ref1[1] + ref2[1]
				if oRef2.contains(oRef1) or oRef1.contains(oRef2):
					matched = True
			if not matched:
				collapsed_refs[ref1[0]] = ref1[1]
		return sorted(collapsed_refs.iteritems(), key=lambda x: -x[1])
		 
	def print_stats(self):
		show_count = self.show_count
		print "*********************************\n"
		print "%d Total Sheets" % self.total
		if hasattr(self,"public_total"):
			print "%d Public Sheets" % self.public_total
		print "\n"
		print "%0.1f%% Bilingual" % (100 * self.languages["bilingual"] / float(self.total))
		print "%0.1f%% Hebrew" % (100 * self.languages["hebrew"] / float(self.total))
		print "%0.1f%% English" % (100 * self.languages["english"] / float(self.total))
		print "\n"
		print "\n%d Sources" % self.sources_count
		print "%d Untranslated Sources" % self.comments_count
		print "\n"
		print "%d Comments" % self.comments_count
		print "%d Outside Texts" % self.outside_count
		print "\n"
		print "%d Potential Fragments (translations in sheets not saved in DB)" % self.fragments_count

		print "\n******* Top Sources ********\n"
		for item in self.sorted_refs[:show_count]:
			print "%s: %d" % (item[0], item[1])

		print "\n******* Top Texts ********\n"
		for item in self.sorted_texts[:show_count]:
			print "%s: %d" % (item[0], item[1])

		print "\n******* Top Categories ********\n"
		for item in self.sorted_categories[:show_count]:
			print "%s: %d" % (item[0], item[1])

		print "\n******* Top Untranslated Sources ********\n"
		for item in self.sorted_untrans_refs[:show_count]:
			print "%s: %d" % (item[0], item[1])

		print "\n******* Top Untranslated Texts ********\n"
		for item in self.sorted_untrans_texts[:show_count]:
			print "%s: %d" % (item[0], item[1])

		print "\n******* Top Untranslated Categories ********\n"
		for item in self.sorted_untrans_categories[:show_count]:
			print "%s: %d" % (item[0], item[1])

		print "\n******* Top Fragments ********\n"
		for item in self.sorted_fragments[:show_count]:
			print "%s: %d" % (item[0], len(item[1]))

		print "\n******* Top Refs by Category ********\n"
		for cat in self.sorted_refs_by_category:
			print "%s: %s" % (cat, self.sorted_refs_by_category[cat][0][0])

		print "\n******* Top Refs by Tag ********\n"
		for tag in self.top_tags[:50]:
			print "%s: %s" % (tag["tag"], self.sorted_refs_by_tag[tag["tag"]][0][0])
		
	def save_top_sources_sheet(self):
		sheet = {
			"title": "Top Sources in All Source Sheets - %s" % datetime.now().strftime("%B %Y"),
			"sources": [{"ref": ref[0]} for ref in self.sorted_refs[:self.show_count]],
			"options": {"numbered": 1, "divineNames": "noSub"}
		}
		save_sheet(sheet, 1)

	def save_top_sources_by_category(self):
		sheet = {
			"title": "Top Sources by Category - %s" % datetime.now().strftime("%B %Y"),
			"sources": [{"ref": self.sorted_refs_by_category[cat][0][0], "title": cat} for cat in self.sorted_refs_by_category],
			"options": {"numbered": 0, "divineNames": "noSub"}
		}
		save_sheet(sheet, 1)

	def save_top_sources_by_tag(self):
		sheet = {
			"title": "Top Sources by Tag - %s" % datetime.now().strftime("%B %Y"),
			"sources": [{"ref": self.sorted_refs_by_tag[tag["tag"]][0][0], "title": tag["tag"]} for tag in self.top_tags[:50]],
			"options": {"numbered": 0, "divineNames": "noSub"}
		}
		save_sheet(sheet, 1)

	def save_top_for_category(self, cat, collapse=False):
 		top_books_list = []
 		for book in self.sorted_books:
 			idx = library.get_index(book[0])
 			if idx.categories[0] == cat and "Commentary" not in idx.categories:
 				top_books_list.append("{} ({:,})".format(book[0], book[1]))
		top_books = "<ol><li>" + "</li><li>".join(top_books_list[:10]) + "</li></ol>"
		sources = [{"comment": "Most frequently used tractates (full list below):<br>%s" % top_books}]

		refs = self.sorted_refs_by_category[cat][:50]
		refs = self.collapse_ref_counts(refs)[:20] if collapse else refs[:20]

		sources += [{"ref": ref[0]} for ref in refs]

		all_top_books = "<ol><li>" + "</li><li>".join(top_books_list) + "</li></ol>"
		sources += [{"comment": "Most frequently used tractates: %s" % all_top_books}]

		sheet = {
			"title": "Top Sources in %s - %s" % (cat, datetime.now().strftime("%B %Y")),
			"sources": sources,
			"options": {"numbered": 1, "divineNames": "noSub"}
		}
		save_sheet(sheet, 1)

	def save_top_sheets(self):
		self.save_top_sources_sheet()
		self.save_top_sources_by_tag()
		self.save_top_sources_by_category()