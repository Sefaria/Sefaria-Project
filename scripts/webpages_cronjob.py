import django
django.setup()
from sefaria.model.webpage import *
import cProfile, pstats

days = 20  # num of days we care about in find_sites_that_may_have_removed_linker and find_webpages_without_websites

#
# print("Original webpage stats...")
# total_pages, total_links = webpages_stats()
# print("{} total pages.\n".format(total_pages))
# print("{} total connections.\n".format(total_links))
#
# print("Cleaning webpages...")
# clean_webpages(test=False)
#
# print("Find sites that no longer have linker...")
# find_sites_that_may_have_removed_linker(last_linker_activity_day=days)
# print("Looking for webpages that have no corresponding website.  If WebPages have been accessed in last 20 days, create a new WebSite for them.  Otherwise, delete them.")
# find_webpages_without_websites(hit_threshold=50, last_linker_activity_day=days)



print("Dedupe webpages...")
profiler = cProfile.Profile()
profiler.enable()
dedupe_webpages(False, "rabbisacks.org")
profiler.disable()
stats = pstats.Stats(profiler).sort_stats('cumtime')
stats.print_stats()

# after_total_pages, after_total_links = webpages_stats()
# print("{} total pages.  Deleted {}.\n".format(after_total_pages, total_pages-after_total_pages))
# print("{} total connections.  Deleted {}.\n".format(after_total_pages, total_links-after_total_links))

