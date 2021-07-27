import re
from datetime import datetime
from collections import defaultdict
from random import randrange

from sefaria.model import *
from django.contrib.auth.models import User
from sefaria.system.exceptions import InputError
from sefaria.sheets import save_sheet, sheet_topics_counts
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
		print("Loading sheets...")
		proj = {"sources.ref": 1, "tags": 1, "options": 1, "status": 1, "id": 1}
		if query:
			sheets            = db.sheets.find(query, proj)
			self.total = sheets.count()
			print("%d matching query" % sheets.count())
		else:
			sheets            = db.sheets.find()
			self.total        = sheets.count()
			print("%d Total" % self.total)
			self.public_total = db.sheets.find({"status": "public"}, proj).count()
			print("%d Public" % self.public_total)
		
		print("Processing tags...")
		self.top_tags     = sheet_topics_counts({})

		print("Processing sheets...")
		for sheet in sheets: 
			if test == 0 or randrange(test) == 1:
				self.count_sheet(sheet)

		print("Sorting...")
		self.sort()
		print("Done.")
	
	def count_sheet(self, sheet):
		id = sheet.get("id", 1)
		if id % 1000 == 0:
			print('{0}%\r'.format(((id * 100)/self.total)))
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
		self.sorted_refs               = sorted(iter(self.refs.items()), key=lambda x: -x[1])
		self.sorted_texts              = sorted(iter(self.texts.items()), key=lambda x: -x[1])
		self.sorted_categories         = sorted(iter(self.categories.items()), key=lambda x: -x[1])
		self.sorted_books              = sorted(iter(self.books.items()), key=lambda x: -x[1])
		self.sorted_untrans_refs       = sorted(iter(self.untrans_refs.items()), key=lambda x: -x[1])
		self.sorted_untrans_texts      = sorted(iter(self.untrans_texts.items()), key=lambda x: -x[1])
		self.sorted_untrans_categories = sorted(iter(self.untrans_categories.items()), key=lambda x: -x[1])
		self.sorted_fragments          = sorted(iter(self.fragments.items()), key=lambda x: -len(x[1]))

		self.sorted_refs_by_tag = {}
		for ref in self.refs_by_tag:
			self.sorted_refs_by_tag[ref] = sorted(iter(self.refs_by_tag[ref].items()), key=lambda x: -x[1])

		self.sorted_refs_by_category = {}
		for ref in self.refs_by_category:
			self.sorted_refs_by_category[ref] = sorted(iter(self.refs_by_category[ref].items()), key=lambda x: -x[1])

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
		return sorted(iter(collapsed_refs.items()), key=lambda x: -x[1])
		 
	def print_stats(self):
		show_count = self.show_count
		print("*********************************\n")
		print("%d Total Sheets" % self.total)
		if hasattr(self,"public_total"):
			print("%d Public Sheets" % self.public_total)
		print("\n")
		print("%0.1f%% Bilingual" % (100 * self.languages["bilingual"] / float(self.total)))
		print("%0.1f%% Hebrew" % (100 * self.languages["hebrew"] / float(self.total)))
		print("%0.1f%% English" % (100 * self.languages["english"] / float(self.total)))
		print("\n")
		print("\n%d Sources" % self.sources_count)
		print("%d Untranslated Sources" % self.comments_count)
		print("\n")
		print("%d Comments" % self.comments_count)
		print("%d Outside Texts" % self.outside_count)
		print("\n")
		print("%d Potential Fragments (translations in sheets not saved in DB)" % self.fragments_count)

		print("\n******* Top Sources ********\n")
		for item in self.sorted_refs[:show_count]:
			print("%s: %d" % (item[0], item[1]))

		print("\n******* Top Texts ********\n")
		for item in self.sorted_texts[:show_count]:
			print("%s: %d" % (item[0], item[1]))

		print("\n******* Top Categories ********\n")
		for item in self.sorted_categories[:show_count]:
			print("%s: %d" % (item[0], item[1]))

		print("\n******* Top Untranslated Sources ********\n")
		for item in self.sorted_untrans_refs[:show_count]:
			print("%s: %d" % (item[0], item[1]))

		print("\n******* Top Untranslated Texts ********\n")
		for item in self.sorted_untrans_texts[:show_count]:
			print("%s: %d" % (item[0], item[1]))

		print("\n******* Top Untranslated Categories ********\n")
		for item in self.sorted_untrans_categories[:show_count]:
			print("%s: %d" % (item[0], item[1]))

		print("\n******* Top Fragments ********\n")
		for item in self.sorted_fragments[:show_count]:
			print("%s: %d" % (item[0], len(item[1])))

		print("\n******* Top Refs by Category ********\n")
		for cat in self.sorted_refs_by_category:
			print("%s: %s" % (cat, self.sorted_refs_by_category[cat][0][0]))

		print("\n******* Top Refs by Tag ********\n")
		for tag in self.top_tags[:50]:
			print("%s: %s" % (tag["tag"], self.sorted_refs_by_tag[tag["tag"]][0][0]))
		
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


def total_sheet_views_by_query(query):
	"""Returns the total number of views for sheets that match `query`"""
	result = db.sheets.aggregate([ 
		{ "$match": query},
		{ 
			"$group": { 
				"_id": None, 
				"total": { 
					"$sum": "$views" 
				} 
			} 
		} ] )
	return list(result)[0]["total"]


def most_popular_refs_in_sheets(pattern, public_only=True):
	counts = defaultdict(int)

	sheets = db.sheets.find({"includedRefs": {"$regex": pattern}})
	for sheet in sheets:
		for ref in sheet["includedRefs"]:
			if re.match(pattern, ref):
				counts[ref] += 1

	top = sorted(iter(counts.items()), key=lambda x: -x[1])

	return top


def account_creation_stats():
	"""
	Counts the number of accounts created each month for all users and separately for 
	accounts which have the Hebrew interface set (proxy for Israeli users).
	Returns a string summary.
	"""
	import os
	os.system('pip install pandas')
	import pandas as pd
	
	users = list(User.objects.all().values('date_joined', 'email', 'first_name', 'last_name', 'id', 'last_login'))

	df = pd.DataFrame(users)
	month_joined = df['date_joined'].groupby(df.date_joined.dt.to_period("M")).agg('count')

	# Filter to users who have hebrew interface language, proxy for Israel
	hebrew_user_ids = db.profiles.find({"settings.interface_language": "hebrew"}, {"id": 1, "settings": 1}).distinct("id")
	hebrew_users = [user for user in users if user["id"] in hebrew_user_ids]
	df_hebrew = pd.DataFrame(hebrew_users)
	hebrew_month_joined = df_hebrew['date_joined'].groupby(df_hebrew.date_joined.dt.to_period("M")).agg('count')


	pd.set_option('display.max_rows', None)
	results = "\nAll Users\n************\n\n" + \
				month_joined.to_string() + \
				"\nHebrew Users\n************\n\n" + \
				hebrew_month_joined.to_string()
	
	return results


# query = {"datetime": {"$gte": datetime(2020, 9, 1)}}
def user_activity_stats(query={}, return_string=False):
	"""
	Metrics based on the user history collection
	- Active users in various monthly windows
	- Montly returning users percentage
	"""
	import os
	os.system('pip install pandas')
	import pandas as pd

	months = db.user_history.aggregate([
		{
			"$match": query
		},
		{
			"$project": {
				"_id": 0,
				"uid": 1,
				"date": {"$dateToString": {"date": "$datetime", "format": "%Y-%m"}}				#"year": {"$year": "$datetime"},
			}
		},
		{
			"$group": {
				"_id": "$date",
				"uids": {"$addToSet": "$uid"}
			}
		},
		{
			"$sort": {"_id": 1}
		}
	])

	months = list(months)

	for i in range(len(months)):
		# Number of user who visit in monthly windows
		active_increments = (1,3,6,12)
		for j in active_increments:
			start = i - j + 1 if i - j + 1 > 0 else 0
			end = i + 1
			months_slice = months[start:end]
			actives = {uid for month in months_slice for uid in month["uids"] }
			months[i]["{} month active".format(j)] = len(actives)

		# Number of users who visited last month and this month over number who visited last month
		returning_users = len(set(months[i]["uids"]) & set(months[i-1]["uids"])) if i != 0 else 0
		months[i]["monthly retention"] = int(100 * returning_users / len(months[i-1]["uids"])) if i != 0 else 0
		months[i]["monthly returning"] = returning_users

	results = "Month, 1 Month Active, 3 Month Active, 6 Month Active, 12 Month Active, 1 Month Returning, Monthly Retention\n"
	for month in months:
		results += "{}, {}, {}, {}, {}, {}, {}%\n".format(month["_id"], month["1 month active"], month["3 month active"], month["6 month active"], month["12 month active"], month["monthly returning"], month["monthly retention"])
		del month["uids"]

	return results if return_string else months

