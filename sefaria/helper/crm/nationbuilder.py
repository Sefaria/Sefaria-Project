from urllib.parse import unquote
from rauth import OAuth2Service
import time
import json

from sefaria.system.database import db
from sefaria.helper.trend_manager import CategoryTrendManager, SheetReaderManager, SheetCreatorManager, \
    CustomTraitManager, ParashaLearnerManager
from sefaria import settings as sls
from sefaria.helper.crm.crm_connection_manager import CrmConnectionManager
from sefaria.model.user_profile import UserProfile

from django.core.mail import EmailMultiAlternatives

base_url = "https://" + sls.NATIONBUILDER_SLUG + ".nationbuilder.com"


class NationbuilderConnectionManager(CrmConnectionManager):
    def __init__(self):
        CrmConnectionManager.__init__(self, base_url)

    def get_connection(self):
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

    def add_user_to_crm(self, lists, email, first_name=None, last_name=None):
        if not sls.NATIONBUILDER:
            return

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
            user_profile = UserProfile(email=email, user_registration=True)
            if user_profile.id is not None and user_profile.nationbuilder_id != nationbuilder_id:
                user_profile.nationbuilder_id = nationbuilder_id
                user_profile.save()
        except:
            pass
        return r

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

    def sync_sustainers(self):
        sustainers = {profile["id"]: profile for profile in db.profiles.find({"is_sustainer": True})}
        added_count = 0
        removed_count = 0
        no_profile_count = 0
        already_synced_count = 0
        for nationbuilder_sustainer in self.nationbuilder_get_all(self.get_by_tag, ['sustainer_current_engineering']):

            nationbuilder_sustainer_profile = UserProfile(email=nationbuilder_sustainer['email'])

            if nationbuilder_sustainer_profile.id is not None:  # has user profile
                existing_sustainer = sustainers.get(nationbuilder_sustainer_profile.id) is not None

                if existing_sustainer:  # remove sustainer from dictionary; already synced
                    del sustainers[nationbuilder_sustainer_profile.id]
                    already_synced_count += 1
                else:  # add new sustainer to db
                    self.update_user_flags(nationbuilder_sustainer_profile, "is_sustainer", True)
                    added_count += 1
            else:
                no_profile_count += 1

        for sustainer_to_remove in sustainers:
            profile = UserProfile(sustainer_to_remove)
            self.update_user_flags(profile, "is_sustainer", False)
            removed_count += 1

        print("added: {}".format(added_count))
        print("removed: {}".format(removed_count))
        print("no_profile: {}".format(no_profile_count))
        print("already synced: {}".format(already_synced_count))

    def mark_as_spam_in_crm(self, profile):
        """
        Deletes spam users from nationbuilder if they are determined to be spam.
        """
        user_profile_id = profile["id"]
        if "nationbuilder_id" in profile:
            nationbuilder_id = profile["nationbuilder_id"]
            r = self.session.get(self.update_person(nationbuilder_id))
            try:
                # If user is only signed up for junk tags, delete from CRM
                tags = [x for x in r.json()["person"]["tags"] if
                        x.lower() not in ["announcements_general_hebrew", "announcements_general",
                                          "announcements_edu_hebrew",
                                          "announcements_edu", "signed_up_on_sefaria", "spam"]]
                if len(tags) == 0:
                    self.session.delete(self.update_person(nationbuilder_id))
                else:  # TODO: Think through better ways to log this
                    print(f"{user_profile_id} not deleted -- has tags {','.join(tags)}")
            except Exception as e:
                print(f"Failed to delete {user_profile_id}. Error: {e}")

    def __del__(self):
        self.session.close()

    @staticmethod
    def get_by_tag(tag_name):
        return f"/api/v1/tags/{tag_name}/people"

    @staticmethod
    def update_person(id):
        return f"/api/v1/people/{id}"

    @staticmethod
    def update_user_flags(profile, flag, value):
        # updates our database user, not nb
        profile.update({flag: value})
        profile.save()