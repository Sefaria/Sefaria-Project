import base64
import requests
import time
import json

from sefaria.helper.crm.crm_connection_manager import CrmConnectionManager
from sefaria import settings as sls

class SalesforceConnectionManager(CrmConnectionManager):
    def __init__(self):
        CrmConnectionManager.__init__(self, sls.SALESFORCE_BASE_URL)
        self.version = "56.0"
        self.resource_prefix = f"services/data/v{self.version}/sobjects/"

    def create_endpoint(self, *args):
        return f"{sls.SALESFORCE_BASE_URL}/{self.resource_prefix}{'/'.join(args)}"

    def make_request(self, request, **kwargs):
        for attempt in range(0,3):
            try:
                return request(**kwargs).json()
            except Exception as e:
                print(e)
                time.sleep(1)

    def get(self, endpoint):
        headers = {'Content-type': 'application/json', 'Accept': 'application/json'}
        return self.session.get(endpoint, headers)

    def post(self, endpoint, **kwargs):
        headers = {'Content-type': 'application/json', 'Accept': 'application/json'}
        return self.session.post(endpoint, headers=headers, **kwargs)

    def patch(self, endpoint, **kwargs):
        headers = {'Content-type': 'application/json', 'Accept': 'application/json'}
        return self.session.patch(endpoint, headers=headers, **kwargs)

    def _get_connection(self):
        access_token_url = "%s/services/oauth2/token?grant_type=client_credentials" % self.base_url
        base64_auth = base64.b64encode((sls.SALESFORCE_CLIENT_ID + ":" + sls.SALESFORCE_CLIENT_SECRET).encode("ascii"))\
            .decode("ascii")
        headers = {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Authorization': 'Basic %s' % base64_auth
        }
        basic_res = requests.post(access_token_url, headers=headers)
        basic_data = basic_res.json()
        session = requests.Session()
        session.headers.update({
            'Authorization': 'Bearer %s' % basic_data['access_token']
        })
        return session

    def add_user_to_crm(self, email, first_name, last_name, lang="en", educator=False):
        """
        Adds a new user to the CRM and subscribes them to the specified lists.
        Returns CRM access info
        """
        CrmConnectionManager.add_user_to_crm(self, email, first_name, last_name, lang, educator)
        if lang == "he":
            language = "Hebrew"
        else:
            language = "English"

        res = self.post(self.create_endpoint("Sefaria_App_User__c"),
                  json={
                      "First_Name__c": first_name,
                      "Last_Name__c": last_name,
                      "Sefaria_App_Email__c": email,
                      "Hebrew_English__c": language,
                      "Educator__c": educator
                  })

        try:  # add salesforce id to user profile
            nationbuilder_user = res.json() # {'id': '1234', 'success': True, 'errors': []}
            return nationbuilder_user['id']

        except:
            return False
        return res

    def change_user_email(self, uid, new_email):
        """
        Changes user email and returns true if successful
        """
        CrmConnectionManager.change_user_email(self, uid, new_email)
        res = self.patch(self.create_endpoint("Sefaria_App_User__c", uid),
                 json={
                     "Sefaria_App_Email__c": new_email
                 })
        try:
            return res.status_code == 204
        except:
            return False
        return res

    def mark_as_spam_in_crm(self, uid):
        CrmConnectionManager.mark_as_spam_in_crm(self, uid)
        res = self.patch(self.create_endpoint("Sefaria_App_User__c", uid),
                         json={
                             "Manual_Review_Required__c": True
                         })
        try:
            return res.status_code == 204
        except:
            return False

    def mark_for_review_in_crm(self, crm_id):
        return self.mark_as_spam_in_crm(crm_id)

    def find_crm_id(self, email=None):
        if email:
            CrmConnectionManager.validate_email(email)
        CrmConnectionManager.find_crm_id(self, email=email)
        res = self.get(self.create_endpoint(f"query?=SELECT+id+FROM+Sefaria_App_User__c+WHERE+Sefaria_App_Email__c='{email}'"))
        try:
            print(res)
            print(res.json())
            return res.json()["records"][0]["Id"]
        except:
            return False

    def subscribe_to_lists(self, email, first_name=None, last_name=None, lang="en", educator=False):
        # TODO: Implement once endpoint exists
        CrmConnectionManager.subscribe_to_lists(self, email, first_name, last_name, lang, educator)
        if lang == "he":
            language = "Hebrew"
        else:
            language = "English"

        json_string = json.dumps({
                      "Action": "Newsletter",
                      "First_Name__c": first_name,
                      "Last_Name__c": last_name,
                      "Sefaria_App_Email__c": email,
                      "Hebrew_English__c": language,
                      "Educator__c": educator
                  })
        res = self.post(self.create_endpoint("Sefaria_App_Data__c"),
                        json={
                            "JSON_STRING__c": json_string
                        })
        try:
            return res.status_code == 201
        except:
            return False
        return res
