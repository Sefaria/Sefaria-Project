
import json
from datetime import datetime

from django.http import HttpResponse
from django.core.mail import EmailMultiAlternatives
from webpack_loader import utils as webpack_utils

from sefaria import settings as sls
# from sefaria.model.user_profile import UserProfile


def jsonResponse(data, callback=None, status=200):
    if callback:
        return jsonpResponse(data, callback, status)
    #these next few lines are a quick hack.  this needs thought.
    try: # Duck typing on AbstractMongoRecord's contents method
        data = data.contents()
    except AttributeError:
        pass

    if data is None:
        data = {"error": 'No data available'}

    if "_id" in data:
        data["_id"] = str(data["_id"])

    if isinstance(data, dict):
        for key in list(data.keys()):
            if isinstance(data[key], datetime):
                data[key] = data[key].isoformat()

    return HttpResponse(json.dumps(data, ensure_ascii=False), content_type="application/json; charset=utf-8", charset="utf-8", status=status)


def jsonpResponse(data, callback, status=200):
    if "_id" in data:
        data["_id"] = str(data["_id"])
    return HttpResponse("%s(%s)" % (callback, json.dumps(data, ensure_ascii=False)), content_type="application/javascript; charset=utf-8", charset="utf-8", status=status)


def send_email(subject, message_html, from_email, to_email):
    msg = EmailMultiAlternatives(subject, message_html, "Sefaria <hello@sefaria.org>", [to_email], reply_to=[from_email])
    msg.send()

    return True


def read_webpack_bundle(config_name):
    webpack_files = webpack_utils.get_files('main', config=config_name)
    bundle_path = sls.relative_to_abs_path('..' + webpack_files[0]["url"])
    with open(bundle_path, 'r') as file:
        return file.read()
