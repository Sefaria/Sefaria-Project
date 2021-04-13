import django
django.setup()
from sefaria.model import *
from sefaria.helper.topic import recalculate_secondary_topic_data, set_all_slugs_to_primary_title

recalculate_secondary_topic_data()
# skip this for now to not change slugs for rabbi project
# set_all_slugs_to_primary_title()