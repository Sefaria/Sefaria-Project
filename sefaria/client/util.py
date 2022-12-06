
import json
from datetime import datetime

from django.http import HttpResponse, JsonResponse
from django.core.mail import EmailMultiAlternatives
from functools import wraps
from webpack_loader import utils as webpack_utils

from sefaria import settings as sls
from sefaria.helper.nationbuilder import get_nationbuilder_connection
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


def subscribe_to_list(lists, email, first_name=None, last_name=None, direct_sign_up=False, bypass_nationbuilder=False):
    from sefaria.model.user_profile import UserProfile

    if not sls.NATIONBUILDER:
        return

    if bypass_nationbuilder:
        name          = first_name + " " + last_name if first_name and last_name else ""
        method        = "Signed up directly" if direct_sign_up else "Signed up during account creation"
        message_html  = "%s<br>%s<br>%s" % (name, email, method)
        subject       = "Mailing list signup"
        from_email    = "Sefaria <hello@sefaria.org>"
        to            = "amelia@sefaria.org"

        msg = EmailMultiAlternatives(subject, message_html, from_email, [to])
        msg.content_subtype = "html"  # Main content is now text/html
        msg.send()

        return True

    tags = lists
    post = {
        "person": {
            "email": email,
            "tags": tags,
        }
    }
    if first_name:
        post["person"]["first_name"] = first_name
    if last_name:
        post["person"]["last_name"] = last_name

    session = get_nationbuilder_connection()
    r = session.put("https://"+sls.NATIONBUILDER_SLUG+".nationbuilder.com/api/v1/people/push",
                    data=json.dumps(post),
                    params={'format': 'json'},
                    headers={'content-type': 'application/json'})
    try: # add nationbuilder id to user profile
        nationbuilder_user = r.json()
        nationbuilder_id = nationbuilder_user["person"]["id"] if "person" in nationbuilder_user else nationbuilder_user["id"]
        user_profile = UserProfile(email=email, user_registration=True)
        if user_profile.id != None and user_profile.nationbuilder_id != nationbuilder_id:
            user_profile.nationbuilder_id = nationbuilder_id
            user_profile.save()
    except:
        pass

    session.close()

    return r

def send_email(subject, message_html, from_email, to_email):
    msg = EmailMultiAlternatives(subject, message_html, "Sefaria <hello@sefaria.org>", [to_email], reply_to=[from_email])
    msg.send()

    return True


def read_webpack_bundle(config_name):
    webpack_files = webpack_utils.get_files('main', config=config_name)
    bundle_path = sls.relative_to_abs_path('..' + webpack_files[0]["url"])
    with open(bundle_path, 'r') as file:
        return file.read()
