import django
django.setup()
from sefaria.model.webpage import *
import cProfile, pstats
from django.core.mail import EmailMultiAlternatives
import sys
def run_job(test=True, email=True):
	if email:
		sys.stdout = open("email2.txt", 'w')

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
	find_sites_that_may_have_removed_linker(test=test, last_linker_activity_day=sites_that_may_have_removed_linker_days)
	print("Looking for webpages that have no corresponding website.  If WebPages have been accessed in last 20 days, create a new WebSite for them.  Otherwise, delete them.")
	find_webpages_without_websites(test=test, hit_threshold=50, last_linker_activity_day=webpages_without_websites_days)


	flag = 500
	print("Looking for websites where the same Ref appears in at least {} pages...".format(flag))
	find_sites_to_be_excluded(flag=flag)

	after_total_pages, after_total_links = webpages_stats()
	print("{} total pages.  Deleted {}.\n".format(after_total_pages, total_pages-after_total_pages))
	print("{} total connections.  Deleted {}.\n".format(after_total_links, total_links-after_total_links))

	if email:
		sys.stdout = sys.__stdout__
		with open("email2.txt", 'r') as f:
			text = f.read()
		subject = "webpage cronjob"
		from_email = "Sefaria <hello@sefaria.org>"
		to = "stevek004@gmail.com"

		msg = EmailMultiAlternatives(subject, text, from_email, [to])
		msg.content_subtype = "html"  # Main content is now text/html
		msg.send()


def profile_job():
	profiler = cProfile.Profile()
	profiler.enable()
	run_job(False)
	profiler.disable()
	stats = pstats.Stats(profiler).sort_stats('cumtime')
	stats.print_stats()



if __name__ == "__main__":
	run_job(False)

