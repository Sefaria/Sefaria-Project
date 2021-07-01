import django
django.setup()
from sefaria.model.webpage import *


print("Cleaning webpages...")
clean_webpages(test=False)
print("Dedupe identical urls...")
dedupe_identical_urls(test=False)
print("Find sites that no longer have linker...")
find_sites_that_may_have_removed_linker()
print("Find any sites with newly installed linker...")
find_new_sites()
print("Dedupe webpages...")
dedupe_webpages(test=False)
print("Webpage stats...")
webpages_stats()


