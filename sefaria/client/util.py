
import json
from rauth import OAuth2Service
from datetime import datetime

from django.http import HttpResponse
from django.core.mail import EmailMultiAlternatives

from sefaria import local_settings as sls


def jsonResponse(data, callback=None, status=200):
    if callback:
        return jsonpResponse(data, callback, status)
    #these next few lines are a quick hack.  this needs thought.
    try: # Duck typing on AbstractMongoRecord's contents method
        data = data.contents()
    except AttributeError:
        pass

    if "_id" in data:
        data["_id"] = str(data["_id"])

    if isinstance(data, dict):
        for key in data.keys():
            if isinstance(data[key], datetime):
                data[key] = data[key].isoformat()

    return HttpResponse(json.dumps(data), content_type="application/json", status=status)


def jsonpResponse(data, callback, status=200):
    if "_id" in data:
        data["_id"] = str(data["_id"])
    return HttpResponse("%s(%s)" % (callback, json.dumps(data)), content_type="application/javascript", status=status)


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
    msg = EmailMultiAlternatives(subject, message_html, from_email, [to_email])
    msg.content_subtype = "html"  # Main content is now text/html
    msg.send()

    return True
