
import json
from rauth import OAuth2Service

from django.http import HttpResponse

from sefaria import local_settings as sls
from sefaria.model import abstract


def jsonResponse(data, callback=None, status=200):
    if callback:
        return jsonpResponse(data, callback, status)
    #these next two lines are a quick hack.  this needs thought.
    if isinstance(data, abstract.AbstractMongoRecord):
        data = data.contents()
    if "_id" in data:
        data["_id"] = str(data["_id"])
    return HttpResponse(json.dumps(data), mimetype="application/json", status=status)


def jsonpResponse(data, callback, status=200):
    if "_id" in data:
        data["_id"] = str(data["_id"])
    return HttpResponse("%s(%s)" % (callback, json.dumps(data)), mimetype="application/javascript", status=status)


def subscribe_to_announce(email, first_name=None, last_name=None):
    """
    Subscribes an email address to the Announcement list
    """
    if not sls.NATIONBUILDER:
        return

    post = {
        "person": {
            "email": email,
            "tags": ["Announcements_General"],
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