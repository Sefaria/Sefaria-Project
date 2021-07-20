"""Retrieves gravatar images for profiles if they exist and save to google storage + mongo
arg[1]: id to start at
"""

import django
django.setup()
from sefaria.utils.util import epoch_time
from sefaria.helper.file import get_resized_file
import urllib.parse, urllib.request, urllib.error
from PIL import Image
import hashlib
from sefaria.google_storage_manager import GoogleStorageManager
from sefaria.system.database import db
from sefaria.model.user_profile import UserProfile
from google.cloud.exceptions import GoogleCloudError
import sys


count = 0
try:
    start_at = int(sys.argv[1])
except:
    start_at = 0

cursor = db.profiles.find({"profile_pic_url": {"$not": {"$regex": "{}.*".format(GoogleStorageManager.BASE_URL)}}, "id" : {"$gt": start_at}}, no_cursor_timeout=True).sort("id")
try:
    for profile_mongo in cursor:
        old_profile_pic_url = recentlyViewed = profile_mongo["profile_pic_url"]
        profile = UserProfile(id=profile_mongo['id'])
        email_hash = hashlib.md5(profile.email.lower().encode('utf-8')).hexdigest()
        gravatar_url = "https://www.gravatar.com/avatar/" + email_hash + "?d=404&s=250"
        try:
            r = urllib.request.urlopen(gravatar_url)
            bucket_name = GoogleStorageManager.PROFILES_BUCKET
            with Image.open(r) as image:
                now = epoch_time()
                big_pic_url = GoogleStorageManager.upload_file(get_resized_file(image, (250, 250)), "{}-{}.png".format(profile.slug, now), bucket_name, None)
                small_pic_url = GoogleStorageManager.upload_file(get_resized_file(image, (80, 80)), "{}-{}-small.png".format(profile.slug, now), bucket_name, None)
                profile_mongo["profile_pic_url"] = big_pic_url
                profile_mongo["profile_pic_url_small"] = small_pic_url
        except urllib.error.HTTPError as e:
            if e.code == 404:
                profile_mongo["profile_pic_url"]=""
                profile_mongo["profile_pic_url_small"]=""
            else:
                print('unexpected ERROR: {}'.format(e))
                print(profile_mongo["id"])
        except urllib.error.URLError as e:
            print("HTTP ERROR from Gravatar Server. Reason: {}".format(e.reason))
            print(profile_mongo["id"])
        except GoogleCloudError as e:
            print("ERROR communicating with Google Storage Manager. {}".format(e))
            print(profile_mongo["id"])
        except Exception as e:
            print("Unexpected Error!!: {}".format(e))
            print(profile_mongo["id"])
        count += 1
        if count % 100 == 0:
            print(profile_mongo["id"])
        db.profiles.save(profile_mongo)
except Exception as e:
    print("Breaking error: {}".format(e))
    print(profile_mongo["id"])
finally:
    cursor.close()
