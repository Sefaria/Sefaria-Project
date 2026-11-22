"""Fill the django_topics pool tables on the e2e runner's fresh database.

Topic pages (reader.views.topic_page) 404 unless the topic is in the active module's pool, and
pools live in Django's database (Postgres in production), not in the Mongo dump. On a fresh
database every pool is empty, so every /topics/<slug> page 404s.

Production's pools were built by scripts/migrations/migrate_good_to_promote_to_topic_pools.py.
This applies the same rules, so the runner's topic pages match production's, but in bulk: the
migration does one query per topic and takes over 10 minutes; this takes seconds.

  every Mongo topic       -> a django_topics Topic row
  torah_tab pool          <- topics with good_to_promote
  library pool            <- authors, and topics with an "about" link to a text
  sheets pool (Voices)    <- topics with an "about" link to a sheet
  general_en, general_he  -> created empty, as in the migration

Does nothing on a database that already has topic rows, so it can't touch real curation and
is safe to rerun.
Run from the repo root after `manage.py migrate`, before the server starts (each server process
caches slug -> pools on first use).
"""

import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "sefaria.settings")

import django  # noqa: E402

django.setup()

from django.db import transaction  # noqa: E402

from django_topics.models import Topic, TopicPool  # noqa: E402
from django_topics.models.pool import PoolType  # noqa: E402
from sefaria.system.database import db  # noqa: E402

POOL_NAMES = [PoolType.LIBRARY.value, PoolType.SHEETS.value, "general_en", "general_he", PoolType.TORAH_TAB.value]
MAX_LEN = 255  # Topic.slug / en_title / he_title max_length; the migration skips longer ones (DataError)


def primary_title(titles, lang):
    for t in titles or []:
        if t.get("lang") == lang and t.get("primary"):
            return t.get("text") or ""
    return ""


def main():
    if Topic.objects.exists():
        print("django_topics already has topic rows; leaving them as they are.")
        return

    with transaction.atomic():
        pools = {name: TopicPool.objects.create(name=name) for name in POOL_NAMES}

        rows, slugs = [], set()
        for doc in db.topics.find({}, {"slug": 1, "titles": 1}):
            slug = (doc.get("slug") or "").lower()  # Topic.save() lowercases slugs
            en, he = primary_title(doc.get("titles"), "en"), primary_title(doc.get("titles"), "he")
            if not slug or slug in slugs or max(len(slug), len(en), len(he)) > MAX_LEN:
                continue
            slugs.add(slug)
            rows.append(Topic(slug=slug, en_title=en, he_title=he))
        Topic.objects.bulk_create(rows, batch_size=5000)

        about = {"class": "refTopic", "linkType": "about"}
        members = {
            PoolType.TORAH_TAB.value: set(db.topics.distinct("slug", {"good_to_promote": True})),
            PoolType.LIBRARY.value: set(db.topics.distinct("slug", {"subclass": "author"}))
            | set(db.topic_links.distinct("toTopic", {**about, "is_sheet": False})),
            PoolType.SHEETS.value: set(db.topic_links.distinct("toTopic", {**about, "is_sheet": True})),
        }
        through = Topic.pools.through
        links = [
            through(topic_id=slug, topicpool_id=pools[name].id)
            for name, member_slugs in members.items()
            for slug in member_slugs
            if slug in slugs
        ]
        through.objects.bulk_create(links, batch_size=5000)

    counts = ", ".join(f"{name} {len(m & slugs)}" for name, m in members.items())
    print(f"topic pools: {len(rows)} topics; {counts}")


if __name__ == "__main__":
    main()
