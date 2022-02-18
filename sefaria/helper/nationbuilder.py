
from sefaria.system.database import db #consider moving all of the nb stuff to a separate file
from sefaria import settings as sls
from rauth import OAuth2Service

def get_by_tag(tag_name):
    return f"/api/v1/tags/{tag_name}/people" 

def nationbuilder_update_tags():
    session = get_nationbuilder_connection()
    base_url = "https://"+sls.NATIONBUILDER_SLUG+".nationbuilder.com"
    for profile in db.profiles.find({}):
        pass

# def nationbuilder_add_tags(session, id, to_add, to_remove):  

def nationbuilder_get_all(endpoint_func, args=[]):
    session = get_nationbuilder_connection()
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

def update_user_flags(profile, flag, value): 
    # updates our database user, not nb
    profile.update({flag: value})
    profile.save()

def get_nationbuilder_connection():
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
