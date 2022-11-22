import django
import argparse
django.setup()
from pymongo import DeleteOne
from datetime import timedelta, datetime
from sefaria.model import *
from sefaria.system.database import db


def get_webpages_since_last_updated(days_since_last_updated: int) -> WebPageSet:
    cutoff = datetime.now() - timedelta(days=days_since_last_updated)
    return WebPageSet({"lastUpdated": {"$lte": cutoff}}, proj={"url": True})


def delete_django_cache_items_since_last_updated(days_since_last_updated: int) -> None:
    webpage_set = get_webpages_since_last_updated(days_since_last_updated)
    print(f"Found {len(webpage_set)} relevant webpages")
    db.django_cache.bulk_write([DeleteOne({"data.url": webpage.url}) for webpage in webpage_set])


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument("days_since_last_updated", type=int, help="Delete all Django cache linker responses for responses whose webpages haven't been updated since X days")
    args = parser.parse_args()
    print(f"Deleting Django cache linker responses last updated more than {args.days_since_last_updated} days ago")
    delete_django_cache_items_since_last_updated(args.days_since_last_updated)
