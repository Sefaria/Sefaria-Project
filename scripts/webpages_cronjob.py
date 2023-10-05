import django
django.setup()
from sefaria.model.webpage import *
import requests
import json
import pstats, cProfile
from sefaria.model import *
import os

TRELLO_KEY = os.getenv("TRELLO_KEY")
TRELLO_TOKEN = os.getenv("TRELLO_TOKEN")
SLACK_URL = os.getenv("SLACK_URL")
BOARD_ID = os.getenv("BOARD_ID")


def run_job(test=True, board_id="", idList_mapping={}):
	board = TrelloBoard(board_id=board_id)
	board.get_lists()
	sites = {}

	sites_that_may_have_removed_linker_days = 20  # num of days we care about in find_sites_that_may_have_removed_linker and find_webpages_without_websites
	webpages_without_websites_days = sites_that_may_have_removed_linker_days # same timeline is relevant

	print("Original webpage stats...")
	orig_count = WebPageSet().count()
	skip = 0
	limit = 500
	print("Cleaning webpages...")
	clean_webpages(test=test)
	print("Find sites that no longer have linker...")
	sites["Linker uninstalled"] = find_sites_that_may_have_removed_linker(last_linker_activity_day=sites_that_may_have_removed_linker_days)
	print("Deduping identical urls...")
	dedupe_identical_urls(test=test)
	while (skip + limit) < orig_count:
		webpages = WebPageSet(limit=limit, skip=skip)
		print("Deduping...")
		dedupe_webpages(webpages, test=test)
		print("Looking for webpages that have no corresponding website.  If WebPages have been accessed in last 20 days, create a new WebSite for them.  Otherwise, delete them.")
		sites["Site uses linker but is not whitelisted"] = find_webpages_without_websites(webpages, test=test, hit_threshold=50, last_linker_activity_day=webpages_without_websites_days)
		sites["Websites that may need exclusions set"] = find_sites_to_be_excluded_relative(webpages, relative_percent=3)
		skip += limit

	print(f"Removed {WebPageSet().count() - orig_count} pages")

	# given list type and site, either create new card or update existing card with message of site object
	print(sites)
	for kind, sites_to_handle in sites.items():
		print(f"{kind} -> {sites_to_handle}")
		for site_name_in_DB in sites_to_handle:
			comment = sites_to_handle[site_name_in_DB]
			if len(comment) > 0:
				already_on_trello = False
				for site_on_trello in board.lists[idList_mapping[kind]]:
					site_name_on_trello = site_on_trello['name']
					if site_name_in_DB == site_name_on_trello:
						already_on_trello = True
						if not test:
							board.add_comment(site_on_trello, comment)
						break
				if not already_on_trello and not test:
						card = board.create_card(site_name_in_DB, idList_mapping[kind])
						board.add_comment(card, comment)


class TrelloBoard:
	def __init__(self, board_id="", lists={}):
		self.board_id = board_id
		self.lists = lists

	def get_lists(self):
		board_url = f"https://api.trello.com/1/boards/{self.board_id}/lists?key={TRELLO_KEY}&token={TRELLO_TOKEN}"

		response = requests.request(
		   "GET",
		   board_url,
		   headers={"Accept": "application/json"}
		)
		if response.status_code == 200:
			for l in json.loads(response.content):
				self.lists[l['id']] = []
				list_url = f"https://api.trello.com/1/lists/{l['id']}/cards?key={TRELLO_KEY}&token={TRELLO_TOKEN}"
				response = requests.request(
					"GET",
					list_url,
					headers={"Accept": "application/json"}
				)
				if response.status_code == 200:
					self.lists[l['id']] = json.loads(response.content)
				else:
					raise Exception(response.content)
		else:
			raise Exception(response.content)

	def create_card(self, site_name, idList):
		url = f"https://api.trello.com/1/cards?idList={idList}&name={site_name}&key={TRELLO_KEY}&token={TRELLO_TOKEN}"
		response = requests.request(
			"POST",
			url,
			headers={"Accept": "application/json"}
		)
		if response.status_code != 200:
			raise Exception(response.content)
		else:
			card = json.loads(response.content)
			return card


	def add_comment(self, site_on_trello, comment):
		url = f"https://api.trello.com/1/cards/{site_on_trello['id']}/actions/comments?text={comment}&key={TRELLO_KEY}&token={TRELLO_TOKEN}"
		response = requests.request(
			"POST",
			url,
			headers={"Accept": "application/json"}
		)
		if response.status_code != 200:
			raise Exception(response.content)


def delete_bad_refs(BOARD_ID, TRELLO_KEY, TRELLO_TOKEN):
	url = f'https://api.trello.com/1/boards/{BOARD_ID}/lists?key={TRELLO_KEY}&token={TRELLO_TOKEN}'
	response = requests.request(
		"GET",
		url,
		headers={"Accept": "application/json"}
	)
	board = TrelloBoard(board_id=BOARD_ID)
	board.get_lists()
	modified_pages = []
	deleted_pages = []
	all_deleted = []
	all_modified = []
	for list_on_board in json.loads(response.content):
		if list_on_board["name"] == 'Todo: After setting exclusions, delete old, bad refs and delete web page if it has 0 refs':
			for card in board.lists[list_on_board["id"]]:
				print()
				print(card["name"])
				all_deleted += deleted_pages
				all_modified += modified_pages
				modified_pages = []
				deleted_pages = []

				url = f'https://api.trello.com/1/cards/{card["id"]}?key={TRELLO_KEY}&token={TRELLO_TOKEN}'
				response = requests.request(
					"GET",
					url,
					headers={"Accept": "application/json"}
				)
				site = json.loads(response.content)
				name = site["name"]
				domains = list(WebSiteSet({"name": name}))[0].domains
				domains = "|".join(domains)
				refs = site["desc"].split(", ")
				only_old_refs = False
				if refs[0].startswith("Older than 20 days: "):
					refs[0] = refs[0].replace("Older than 20 days: ", "")
					only_old_refs = True

				for bad_ref in refs:
					ws = WebPageSet({"url": {"$regex": domains}, "refs": bad_ref}).array()
					threshold = datetime.today() - timedelta(days=30)
					if only_old_refs:
						ws = [w for w in ws if w.lastUpdated < threshold]
					for w in ws:
						w.refs = [r for r in w.refs if r not in refs]
						if len(w.refs) > 0:
							w.expandedRefs = Ref.expand_refs(w.refs)
							w.save()
							modified_pages.append(w.url)
						else:
							w.delete()
							deleted_pages.append(w.url)
	print(all_modified)
	print(all_deleted)





if __name__ == "__main__":
	lists = ["Linker uninstalled", "Site uses linker but is not whitelisted"]



	idList_mapping = {}
	url = f'https://api.trello.com/1/boards/{BOARD_ID}/lists?key={TRELLO_KEY}&token={TRELLO_TOKEN}'
	response = requests.request(
		"GET",
		url,
		headers={"Accept": "application/json"}
	)

	for list_on_board in json.loads(response.content):
		if list_on_board["name"] in lists:
			idList_mapping[list_on_board["name"]] = list_on_board["id"]

	run_job(test=False, board_id=BOARD_ID, idList_mapping=idList_mapping)
