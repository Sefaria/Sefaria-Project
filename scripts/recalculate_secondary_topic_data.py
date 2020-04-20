import django
django.setup()
from sefaria.model import *
from sefaria.helper.topic import recalculate_secondary_topic_data

recalculate_secondary_topic_data()
