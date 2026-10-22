from django.core.management.base import BaseCommand
from inquiry.atlas import database, refresh

class Command(BaseCommand):
    help = 'Create narrow history indexes and populate the initial aggregate snapshot.'
    def handle(self, *args, **options):
        db=database()
        db.user_history.create_index([('time_stamp',-1)], name='inquiry_atlas_time')
        db.user_history.create_index([('uid',1),('time_stamp',-1)], name='inquiry_atlas_user_time')
        self.stdout.write(str(refresh()))
