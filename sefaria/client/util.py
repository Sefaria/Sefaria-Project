
import json
from rauth import OAuth2Service
from datetime import datetime
import time
from urllib.parse import unquote


from django.http import HttpResponse, JsonResponse
from django.core.mail import EmailMultiAlternatives
from functools import wraps

from sefaria import settings as sls

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

    session = get_nation_builder_connection()
    r = session.put("https://"+sls.NATIONBUILDER_SLUG+".nationbuilder.com/api/v1/people/push",
                    data=json.dumps(post),
                    params={'format': 'json'},
                    headers={'content-type': 'application/json'})
    session.close()

    return r

def get_by_tag(tag_name):
    return f"/api/v1/tags/{tag_name}/people" 

def nationbuilder_get_all(endpoint_func, args=[]):
    session = get_nation_builder_connection()
    base_url = "https://"+sls.NATIONBUILDER_SLUG+".nationbuilder.com"
    next_endpoint = endpoint_func(*args)
    while(next_endpoint):
        for attempt in range(0,3):
            try:
                res = session.get(base_url + next_endpoint)
                res_data = res.json()
                for item in res_data['results']:
                    yield item
                next_endpoint = unquote(res_data['next']) if res_data['next'] else None
                if (res.headers['x-ratelimit-remaining'] == '0'):
                    time.sleep(10)
                break
            except Exception as e:
                print("Trying again to access and process {}. Attempts: {}. Exception: {}".format(next_endpoint, attempt+1, e))
        else:
            session.close()
            raise Exception("Error when attempting to connect to and process " + next_endpoint)
        
    session.close()
    

def get_nation_builder_connection():
    access_token_url = "http://%s.nationbuilder.com/oauth/token" % sls.NATIONBUILDER_SLUG
    authorize_url = "%s.nationbuilder.com/oauth/authorize" % sls.NATIONBUILDER_SLUG
    service = OAuth2Service(
        client_id = sls.NATIONBUILDER_CLIENT_ID,
        client_secret = sls.NATIONBUILDER_CLIENT_SECRET,
        name = "NationBuilder",
        authorize_url = authorize_url,
        access_token_url = access_token_url,
        base_url = "%s.nationbuilder.com" % sls.NATIONBUILDER_SLUG
    )
    token = sls.NATIONBUILDER_TOKEN
    session = service.get_session(token)

    return session

def send_email(subject, message_html, from_email, to_email):
    msg = EmailMultiAlternatives(subject, message_html, "Sefaria <hello@sefaria.org>", [to_email], reply_to=[from_email])
    msg.send()

    return True
