from sefaria.utils.util import epoch_time
from sefaria.helper.file import get_resized_file
import urllib.parse, urllib.request
from PIL import Image
import hashlib
from sefaria.google_storage_manager import GoogleStorageManager
from sefaria.system.database import db

for profile in db.profiles.find():
    old_profile_pic_url = recentlyViewed = profile["profile_pic_url"]

    if not old_profile_pic_url.startswith(GoogleStorageManager.BASE_URL):
        email_hash = hashlib.md5(profile.email.lower().encode('utf-8')).hexdigest()
        gravatar_url = "https://www.gravatar.com/avatar/" + email_hash + "?d=404&s=250"
        with urllib.request.urlopen(gravatar_url) as r:
            if r.getcode() != 404:
                bucket_name = GoogleStorageManager.PROFILES_BUCKET
                with Image.open(r) as image:
                    now = epoch_time()
                    big_pic_url = GoogleStorageManager.upload_file(get_resized_file(image, (250, 250)), "{}-{}.png".format(profile.slug, now), bucket_name, None)
                    small_pic_url = GoogleStorageManager.upload_file(get_resized_file(image, (80, 80)), "{}-{}-small.png".format(profile.slug, now), bucket_name, None)
                    profile["profile_pic_url"] = big_pic_url
                    profile["profile_pic_url_small"] = small_pic_url
            else:
                    profile["profile_pic_url"] = ""
                    profile["profile_pic_url_small"] = ""
            db.profiles.save(profile)