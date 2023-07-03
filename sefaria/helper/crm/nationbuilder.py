from urllib.parse import unquote
from rauth import OAuth2Service
import time
import json

from sefaria import settings as sls
from sefaria.helper.crm.crm_connection_manager import CrmConnectionManager

base_url = "https://" + sls.NATIONBUILDER_SLUG + ".nationbuilder.com"


class NationbuilderConnectionManager(CrmConnectionManager):
    def __init__(self):
        CrmConnectionManager.__init__(self, base_url)

    def _get_connection(self):
        access_token_url = "http://%s.nationbuilder.com/oauth/token" % sls.NATIONBUILDER_SLUG
        authorize_url = "%s.nationbuilder.com/oauth/authorize" % sls.NATIONBUILDER_SLUG
        service = OAuth2Service(
            client_id=sls.NATIONBUILDER_CLIENT_ID,
            client_secret=sls.NATIONBUILDER_CLIENT_SECRET,
            name="NationBuilder",
            authorize_url=authorize_url,
            access_token_url=access_token_url,
            base_url=base_url
        )
        token = sls.NATIONBUILDER_TOKEN
        session = service.get_session(token)
        return session

    def add_user_to_crm(self, email, first_name=None, last_name=None, lang="en", educator=False, signup=True):
        lists = []
        if lang == "en":
            if educator:
                lists.append("Announcements_Edu")
            lists.append("Announcements_General")
        else:
            if educator:
                lists.append("Announcements_Edu_Hebrew")
            lists.append("Announcements_General_Hebrew")
        if signup:
            lists.append("Signed_Up_on_Sefaria")
        else:
            lists.append("Newsletter_Sign_Up")

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

        r = self.session.put("https://" + sls.NATIONBUILDER_SLUG + ".nationbuilder.com/api/v1/people/push",
                             data=json.dumps(post),
                             params={'format': 'json'},
                             headers={'content-type': 'application/json'})

        try:  # add nationbuilder id to user profile
            nationbuilder_user = r.json()
            nationbuilder_id = nationbuilder_user["person"]["id"] if "person" in nationbuilder_user else \
                nationbuilder_user["id"]
            return nationbuilder_id
        except:
            return False

        return True

    def subscribe_to_lists(self, email, first_name=None, last_name=None, lang="en", educator=False):
        CrmConnectionManager.subscribe_to_lists(self,email, first_name, last_name, lang, educator)
        return self.add_user_to_crm(email, first_name, last_name, lang, educator, signup=False)

    def nationbuilder_get_all(self, endpoint_func, args=[]):
        next_endpoint = endpoint_func(*args)
        while next_endpoint:
            # print(next_endpoint)
            for attempt in range(0, 3):
                try:
                    res = self.session.get(base_url + next_endpoint)
                    res_data = res.json()
                    for item in res_data['results']:
                        yield item
                    next_endpoint = unquote(res_data['next']) if res_data['next'] else None
                    if 'nation-ratelimit-remaining' in res.headers and res.headers['nation-ratelimit-remaining'] == '0':
                        time.sleep(10)
                        print('sleeping')
                    break
                except Exception as e:
                    time.sleep(5)
                    print("Trying again to access and process {}. Attempts: {}. Exception: {}".format(next_endpoint,
                                                                                                      attempt + 1, e))
                    print(next_endpoint)

    def get_sustainers(self):
        for nationbuilder_sustainer in self.nationbuilder_get_all(self.get_by_tag, ['sustainer_current_engineering']):
            yield {
                "email": nationbuilder_sustainer["email"]
            }

    def mark_as_spam_in_crm(self, nationbuilder_id):
        """
        Deletes spam users from nationbuilder if they are determined to be spam.
        """
        r = self.session.get(self.update_person(nationbuilder_id))
        try:
            # If user is only signed up for junk tags, delete from CRM
            tags = [x for x in r.json()["person"]["tags"] if
                    x.lower() not in ["announcements_general_hebrew", "announcements_general",
                                      "announcements_edu_hebrew",
                                      "announcements_edu", "signed_up_on_sefaria", "spam"]]
            if len(tags) == 0:
                self.session.delete(self.update_person(nationbuilder_id))
            return True
        except Exception as e:
            print(f"Failed to delete. Error: {e}")
            return False

    def mark_for_review_in_crm(self, crm_id):
        return True

    def find_crm_id(self, email=None):
        # This will not be implemented for NB because it will never be used
        CrmConnectionManager.find_crm_id(self, email=email)
        pass

    def __del__(self):
        self.session.close()

    @staticmethod
    def get_by_tag(tag_name):
        return f"/api/v1/tags/{tag_name}/people"

    @staticmethod
    def update_person(id):
        return f"/api/v1/people/{id}"
