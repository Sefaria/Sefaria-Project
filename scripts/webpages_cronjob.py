import django
django.setup()
from sefaria.model.webpage import *
import cProfile, pstats
import requests
import json
import argparse

TRELLO_KEY = TRELLO_TOKEN = -1
def run_job(test=True, board_id="", idList_mapping={}, members_mapping={}):
	board = TrelloBoard(board_id=board_id)
	board.get_lists()
	sites = {}

	sites_that_may_have_removed_linker_days = 20  # num of days we care about in find_sites_that_may_have_removed_linker and find_webpages_without_websites
	webpages_without_websites_days = sites_that_may_have_removed_linker_days # same timeline is relevant

	print("Original webpage stats...")
	# total_pages, total_links = webpages_stats()
	# print("{} total pages.\n".format(total_pages))
	# print("{} total connections.\n".format(total_links))
	#
	# print("Cleaning webpages...")
	# clean_webpages(test=test)
	# dedupe_webpages(test=test)


	print("Find sites that no longer have linker...")
	sites["Linker uninstalled"] = find_sites_that_may_have_removed_linker(last_linker_activity_day=sites_that_may_have_removed_linker_days)
	print("Looking for webpages that have no corresponding website.  If WebPages have been accessed in last 20 days, create a new WebSite for them.  Otherwise, delete them.")
	sites["Site uses linker but is not whitelisted"] = find_webpages_without_websites(test=test, hit_threshold=50, last_linker_activity_day=webpages_without_websites_days)


	flag = 500
	print("Looking for websites where the same Ref appears in at least {} pages...".format(flag))
	sites["Websites that may need exclusions set"] = find_sites_to_be_excluded(flag=flag)
	#
	# after_total_pages, after_total_links = webpages_stats()
	# print("{} total pages.  Deleted {}.\n".format(after_total_pages, total_pages-after_total_pages))
	# print("{} total connections.  Deleted {}.\n".format(after_total_links, total_links-after_total_links))

	# given list type and site, either create new card or update existing card with message of site object
	for kind, sites_to_handle in sites.items():
		for site_name_in_DB in sites_to_handle:
			comment = sites_to_handle[site_name_in_DB]
			already_on_trello = False
			for site_on_trello in board.lists[idList_mapping[kind]]:
				site_name_on_trello = site_on_trello['name']
				if site_name_in_DB == site_name_on_trello:
					already_on_trello = True
					board.add_comment(site_on_trello, comment)
					break
			if not already_on_trello:
				card = board.create_card(site_name_in_DB, idList_mapping[kind], members_mapping[kind])
				board.add_comment(card, comment)





def profile_job():
	profiler = cProfile.Profile()
	profiler.enable()
	run_job(False)
	profiler.disable()
	stats = pstats.Stats(profiler).sort_stats('cumtime')
	stats.print_stats()


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

	def create_card(self, site_name, idList, members):
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
			for member in members:
				url = f"https://api.trello.com/1/cards/{card['id']}/idMembers?value={member}&key={TRELLO_KEY}&token={TRELLO_TOKEN}"
				response = requests.request(
					"POST",
					url,
					headers={"Accept": "application/json"}
				)
				if response.status_code != 200:
					raise Exception(response.content)
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


if __name__ == "__main__":
	parser = argparse.ArgumentParser()
	parser.add_argument("-k", "--key",
						help="API Key")
	parser.add_argument("-t", "--token",
						help="API token")
	parser.add_argument("-b", "--board",
						help="Board ID")
	args = parser.parse_args()
	members_mapping = {"Linker uninstalled": ["53c2c1b503849ae6a6e56870", "5f0c575790c4a913b3992da2"],
					   "Site uses linker but is not whitelisted": ["53c2c1b503849ae6a6e56870", "5f0c575790c4a913b3992da2"],
					   "Websites that may need exclusions set": ["53c2c1b503849ae6a6e56870"]}
	lists = ["Linker uninstalled", "Site uses linker but is not whitelisted", "Websites that may need exclusions set"]

	TRELLO_KEY = args.key
	TRELLO_TOKEN = args.token
	BOARD_ID = args.board

	idList_mapping = {}
	url = 'https://api.trello.com/1/boards/615b2cf55893576270ef630d/lists?key={TRELLO_KEY}&token={TRELLO_TOKEN}'
	response = requests.request(
		"POST",
		url,
		headers={"Accept": "application/json"}
	)
	for list_on_board in json.loads(response.content):
		pos = lists.index(list_on_board["name"])
		if pos != -1:
			idList_mapping["name"] = list_on_board["id"]

	run_job(board_id=BOARD_ID, idList_mapping=idList_mapping, members_mapping=members_mapping)