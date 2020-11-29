import django
django.setup()
from sefaria.model import *
from sefaria.helper.topic import recalculate_secondary_topic_data, set_all_slugs_to_primary_title

recalculate_secondary_topic_data()
set_all_slugs_to_primary_title()