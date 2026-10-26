"""Finite, marked synthetic navigation; never writes the real user_history collection."""
import random
import time
import uuid
from datetime import datetime, timedelta, timezone
from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from inquiry.atlas import database, title_ids

# Each cluster is a base text and the commentaries readers typically open beside it.
CLUSTERS = [
    ["Genesis", "Rashi on Genesis", "Ramban on Genesis", "Ibn Ezra on Genesis", "Sforno on Genesis"],
    ["Exodus", "Rashi on Exodus", "Ramban on Exodus", "Ibn Ezra on Exodus"],
    ["Berakhot", "Rashi on Berakhot", "Tosafot on Berakhot", "Mishnah Berakhot", "Bartenura on Mishnah Berakhot"],
    ["Gittin", "Rashi on Gittin", "Tosafot on Gittin"],
    ["Psalms", "Rashi on Psalms", "Radak on Psalms"],
    ["Pirkei Avot", "Bartenura on Pirkei Avot", "Rashi on Pirkei Avot"],
    ["Shulchan Arukh, Orach Chayim", "Mishnah Berurah", "Magen Avraham"],
    ["Mishneh Torah, Prayer and the Priestly Blessing", "Kesef Mishneh on Mishneh Torah, Prayer and the Priestly Blessing"],
]


class Command(BaseCommand):
    help = 'Write temporary, clearly labeled synthetic reads for several fake readers (local Mongo only).'

    def add_arguments(self, parser):
        parser.add_argument('--interval', type=float, default=0.7, help='Seconds between synthetic reads')
        parser.add_argument('--duration', type=float, default=600)
        parser.add_argument('--readers', type=int, default=25)

    def handle(self, *args, **options):
        if not getattr(settings, 'INQUIRY_ATLAS_DEMO_ENABLED', False):
            raise CommandError('Set INQUIRY_ATLAS_DEMO_ENABLED=1 on web, worker and this command.')
        db = database()
        # This demo is explicitly scoped to the local development database.
        db.command('ping')  # connect so the node list is populated
        addresses = db.client.nodes
        if not addresses or any(host not in {'localhost', '127.0.0.1', '::1'} for host, port in addresses):
            raise CommandError('The demo feed only supports loopback Mongo connections.')
        interval, duration = options['interval'], options['duration']
        if not 0.1 <= interval <= 60 or not 1 <= duration <= 1800:
            raise CommandError('Use interval 0.1–60 seconds and duration 1–1800 seconds.')
        titles = title_ids()
        clusters = [[b for b in cluster if b in titles] for cluster in CLUSTERS]
        clusters = [c for c in clusters if len(c) >= 2]
        if not clusters:
            raise CommandError('None of the demo books exist in the atlas catalog.')

        collection = db.inquiry_atlas_demo_history
        collection.create_index('expires_at', expireAfterSeconds=0)
        collection.create_index([('time_stamp', -1)])
        run = uuid.uuid4().hex[:8]
        # Popular clusters get more readers, like real traffic.
        readers = {f'atlas-demo-{run}-{i}': random.choices(clusters, weights=range(len(clusters), 0, -1))[0]
                   for i in range(options['readers'])}
        location = {uid: random.choice(cluster) for uid, cluster in readers.items()}
        start, count = time.monotonic(), 0
        self.stdout.write('Synthetic atlas demo started; records expire automatically after 10 minutes.')
        try:
            while time.monotonic() - start < duration:
                uid = random.choice(list(readers))
                roll = random.random()
                if roll < 0.08:
                    readers[uid] = random.choice(clusters)
                    location[uid] = readers[uid][0]
                elif roll < 0.5:
                    location[uid] = random.choice([b for b in readers[uid] if b != location[uid]])
                book = location[uid]
                collection.insert_one({'synthetic': True, 'run': run, 'uid': uid, 'book': book,
                    'ref': book, 'time_stamp': time.time(), 'secondary': False, 'saved': False,
                    'expires_at': datetime.now(timezone.utc) + timedelta(minutes=10)})
                count += 1
                self.stdout.write(f'{count}: {uid[-2:]} → {book}')
                time.sleep(max(0, random.uniform(0.3, 1.7) * interval))
        except KeyboardInterrupt:
            pass
        self.stdout.write(f'Demo stopped after {count} records; normal reader history was untouched.')
