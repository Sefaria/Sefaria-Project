from urllib.parse import unquote
from rauth import OAuth2Service
import time
import json
from sefaria.site.categories import TOP_CATEGORIES

from sefaria.system.database import db
from sefaria.helper.trend_manager import CategoryTrendManager, SheetReaderManager, SheetCreatorManager
from sefaria import settings as sls

base_url = "https://"+sls.NATIONBUILDER_SLUG+".nationbuilder.com"

def get_by_tag(tag_name):
    return f"/api/v1/tags/{tag_name}/people" 

def tag_person(id):
    return f"/api/v1/people/{id}/taggings"

def get_everyone():
    return f"/api/v1/people?limit=100"

def get_nationbuilder_connection():
    access_token_url = "http://%s.nationbuilder.com/oauth/token" % sls.NATIONBUILDER_SLUG
    authorize_url = "%s.nationbuilder.com/oauth/authorize" % sls.NATIONBUILDER_SLUG
    service = OAuth2Service(
        client_id = sls.NATIONBUILDER_CLIENT_ID,
        client_secret = sls.NATIONBUILDER_CLIENT_SECRET,
        name = "NationBuilder",
        authorize_url = authorize_url,
        access_token_url = access_token_url,
        base_url = base_url
    )
    token = sls.NATIONBUILDER_TOKEN
    session = service.get_session(token)
    return session

def get_tags_for_user(profile, trendManagers): # TODO - split up?
    # trends
    trends = {}
    for trend in db.trend.find({"uid": profile['id']}):
        if not trends.get(trend["name"], False):
            trends[trend["name"]] = {}
        trends[trend["name"]][trend["period"]] = trend["value"]
    to_add = []
    to_remove = []
    for trendManager in trendManagers:
        info = trendManager.getPersonInfo(trends)
        if info['value'] == True:
            to_add.append(info['name'])
        else:
            to_remove.append(info['name'])
    
    # sheets
    return to_add,to_remove


def nationbuilder_update_all_tags():
    TOP_CATEGORIES = [
    "Tanakh",
    "Mishnah",
    "Talmud",
    "Midrash",
    "Halakhah",
    "Kabbalah",
    "Liturgy",
    "Jewish Thought",
    "Tosefta"
    "Chasidut",
    "Musar",
    "Responsa",
    "Second Temple",
    "Reference",
    ] # why won't this import from sefaria.model.categories??
    session = get_nationbuilder_connection()
    category_trend_managers = [CategoryTrendManager(category, period=period) for category in TOP_CATEGORIES for period in ["alltime", "currently"]] 
    trend_managers = category_trend_managers + [SheetReaderManager(), SheetCreatorManager(), SheetCreatorManager(public=True)]
    for profile in db.profiles.find({"nationbuilder_id": {"$exists": True}}):
        tags_to_add, tags_to_remove = get_tags_for_user(profile, trend_managers)
        print(tags_to_add)
        print(tags_to_remove)
        nationbuilder_update_person_tags(session, profile["nationbuilder_id"], json.dumps({
            "tagging": {
                "tag": tags_to_add
            }
        }), json.dumps({
            "tagging": {
                "tag": tags_to_remove
            }
        }))
        print(profile)

def nationbuilder_update_person_tags(session, id, to_add, to_remove):
    headers = {'Content-type': 'application/json', 'Accept': 'application/json'}
    req_add = session.put(tag_person(id), data=to_add, headers=headers)
    req_delete = session.delete(tag_person(id), data=to_remove, headers=headers)
    print(req_add)
    print(req_delete)

# nationbuilder_update_all_tags()
def nationbuilder_get_all(endpoint_func, args=[]):
    session = get_nationbuilder_connection()
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
                time.sleep(5)
                session = get_nationbuilder_connection()
                print("Trying again to access and process {}. Attempts: {}. Exception: {}".format(next_endpoint, attempt+1, e))
                print(next_endpoint)
        else:
            session.close()
            raise Exception("Error when attempting to connect to and process " + next_endpoint)
        
    session.close()

def update_user_flags(profile, flag, value): 
    # updates our database user, not nb
    profile.update({flag: value})
    profile.save()

