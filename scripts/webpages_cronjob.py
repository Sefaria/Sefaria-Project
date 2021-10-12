import django
django.setup()
from sefaria.model.webpage import *
import cProfile, pstats
import requests


#https://trello.com/b/FbwZo9kw/webpages
# create class for dealing with posts... we have 3 lists on board: a) delete, b) create), c) exclusions
# for exclusions, we need name of site, all refs and their count
# for creating site, we need site name and how many days we tracked and how many pages there are
# for deleting site, we need site name and how many days we tracked and most recent day of newest page or message saying it has no pages
# so basically, we need three variables in class, site_name, type, and message
# site_name and type should uniquely identify a card since type corresponds to lists
def get_lists_on_board():
	#Get Lists on a Board
	#GET /1/boards/{id}/lists
	pass

def get_cards_in_list():
	#GET /1/lists/{id}/cards
	pass

def delete_card():
	#DELETE / 1 / cards / {id}
	pass

def create_card():
	#POST /1/cards
	pass

def get_card():
	#GET /1/cards/{id}
	pass

def update_card():
	#PUT / 1 / cards / {id}
	pass

def run_job(test=True, api=True):
	sites_to_delete = []
	sites_to_create = []
	sites_excluded = []

	sites_that_may_have_removed_linker_days = 20  # num of days we care about in find_sites_that_may_have_removed_linker and find_webpages_without_websites
	webpages_without_websites_days = sites_that_may_have_removed_linker_days # same timeline is relevant

	print("Original webpage stats...")
	total_pages, total_links = webpages_stats()
	print("{} total pages.\n".format(total_pages))
	print("{} total connections.\n".format(total_links))

	print("Cleaning webpages...")
	clean_webpages(test=test)
	dedupe_webpages(test=test)


	print("Find sites that no longer have linker...")
	sites_to_delete += find_sites_that_may_have_removed_linker(last_linker_activity_day=sites_that_may_have_removed_linker_days)
	print("Looking for webpages that have no corresponding website.  If WebPages have been accessed in last 20 days, create a new WebSite for them.  Otherwise, delete them.")
	sites_to_create += find_webpages_without_websites(test=test, hit_threshold=50, last_linker_activity_day=webpages_without_websites_days)


	flag = 500
	print("Looking for websites where the same Ref appears in at least {} pages...".format(flag))
	sites_excluded += find_sites_to_be_excluded(flag=flag)

	after_total_pages, after_total_links = webpages_stats()
	print("{} total pages.  Deleted {}.\n".format(after_total_pages, total_pages-after_total_pages))
	print("{} total connections.  Deleted {}.\n".format(after_total_links, total_links-after_total_links))

	# if email:
	# 	sys.stdout = sys.__stdout__
	# 	with open("email2.txt", 'r') as f:
	# 		text = "<br/>".join(list(f))
	# 	subject = "webpage cronjob"
	# 	from_email = "Sefaria <hello@sefaria.org>"
	# 	to = "dev@sefaria.org"
	#
	# 	msg = EmailMultiAlternatives(subject, text, from_email, [to])
	# 	msg.content_subtype = "html"  # Main content is now text/html
	# 	msg.send()


def profile_job():
	profiler = cProfile.Profile()
	profiler.enable()
	run_job(False)
	profiler.disable()
	stats = pstats.Stats(profiler).sort_stats('cumtime')
	stats.print_stats()



if __name__ == "__main__":
	run_job(False)

