"""
Seed the django_topics pool tables so /topics/<slug> pages render on a local sandbox.

WHY THIS EXISTS: reader.views.topic_page 404s unless the requested topic belongs to the active
module's TOPIC POOL — a Postgres-side curation table (django_topics), separate from the Mongo
`topics` collection. A stock local database has Mongo topics but an EMPTY pool table, so every
/topics/<slug> page 404s even though the topic exists. (This is why the older sidebar-ad specs
navigate to /topics/category/<slug>, which has no pool gate.)

The Strapi page-type specs (strapi-sidebar-ad-page-type.spec.js) need real topic pages — an
author (samson-raphael-hirsch: Mongo `subclass: "author"`, no portal), a plain topic
(shabbat), and a portal author (jonathan-sacks: `portal_slug` "sacks", which classifies
EXCLUSIVELY as portal_page — see the PORTAL_PAGE note in static/js/sefaria/pageTypes.js) —
so this script places all three into the pools both modules read. Idempotent: re-running
changes nothing. It touches only local Postgres; Mongo is never written.

Run from the repo root, then RESTART the Django server:
    .venv/bin/python e2e-tests/support/seed_topic_pools.py

The restart is not optional: the pool gate reads a slug->pools cache built in the SERVER
process's memory, so a running sandbox keeps 404ing topics seeded after it booted — this
script's own cache rebuild happens in a different process and can't reach it.

The specs do not run this automatically (a test that silently writes to a database is a trap);
they skip with a message naming this file when the pages 404.
"""

import os
import sys

import django

# The script lives two directories below the repo root; Python puts the SCRIPT'S directory on
# sys.path, not the CWD, so `sefaria.settings` is unimportable without this.
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "sefaria.settings")
django.setup()

from django_topics.models import Topic as DjangoTopic  # noqa: E402
from django_topics.models import TopicPool  # noqa: E402

# 'library' serves the library module; 'sheets' serves the voices module (the pool predates the
# module's rename — see django_topics/utils.py:get_topic_pool_name_for_module).
POOL_NAMES = ["library", "sheets"]
# jonathan-sacks and adin-steinsaltz are the only two portal topics in existence (portals
# 'sacks' and 'steinsaltz'); both are seeded so the portal_page specs cover both instances.
TOPIC_SLUGS = ["jonathan-sacks", "adin-steinsaltz", "samson-raphael-hirsch", "shabbat"]


def seed():
    pools = [TopicPool.objects.get_or_create(name=name)[0] for name in POOL_NAMES]
    for slug in TOPIC_SLUGS:
        topic, created = DjangoTopic.objects.get_or_create(slug=slug)
        topic.pools.add(*pools)  # add() is idempotent
        print(f"{'created' if created else 'exists '} {slug} -> pools {POOL_NAMES}")
    # topic_page reads pools through a slug->pools cache; stale entries would keep 404ing.
    DjangoTopic.objects.build_slug_to_pools_cache(rebuild=True)
    print("slug->pools cache rebuilt")


if __name__ == "__main__":
    seed()
