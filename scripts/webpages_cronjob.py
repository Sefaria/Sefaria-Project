import django
django.setup()
from sefaria.model.webpage import *




print("Original webpage stats...")
webpages_stats()

days = 20  # num of days we care about in find_sites_that_may_have_removed_linker and find_webpages_without_websites
find_sites_that_may_have_removed_linker(last_linker_activity_day=days)
print("Looking for webpages that have no corresponding website.  If WebPages have been accessed in last 20 days, create a new WebSite for them.  Otherwise, delete them.")
find_webpages_without_websites(hit_threshold=50, last_linker_activity_day=days)
find_sites_to_be_excluded()



print("Webpage stats after job...")
webpages_stats()


#
#
# print("Cleaning webpages...")
# clean_webpages(test=False)
# print("Find sites that no longer have linker...")
# days = 20  # num of days we care about in find_sites_that_may_have_removed_linker and find_webpages_without_websites
# find_sites_that_may_have_removed_linker(last_linker_activity_day=days)
# print("Looking for webpages that have no corresponding website.  If WebPages have been accessed in last 20 days, create a new WebSite for them.  Otherwise, delete them.")
# find_webpages_without_websites(hit_threshold=50, last_linker_activity_day=days)
# find_sites_to_be_excluded()

# print("Dedupe identical urls...")
# dedupe_identical_urls(test=False)

# print("Dedupe webpages...")
# dedupe_webpages(test=False)


# print("Webpage stats after job...")
# webpages_stats()

