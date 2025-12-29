import base64
import requests
import time
import json

from sefaria.helper.crm.crm_connection_manager import CrmConnectionManager
from django.conf import settings as sls

from typing import Any, Optional
import structlog
logger = structlog.get_logger(__name__)

class SalesforceNewsletterListRetrievalError(Exception):
    pass

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
        return self.session.get(endpoint, headers=headers)

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
        if 'access_token' not in basic_data:
            logger.error("Salesforce OAuth failed",
                        status_code=basic_res.status_code,
                        response=basic_data)
            raise Exception(f"Salesforce OAuth failed: {basic_data}")
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

    def subscribe_to_lists(
        self, 
        email: str, 
        first_name: Optional[str] = None, 
        last_name: Optional[str] = None, 
        educator: bool = False,
        lang: str = "en",
        mailing_lists: Optional[list[str]] = None) -> Any:

        mailing_lists = mailing_lists or []

        CrmConnectionManager.subscribe_to_lists(self, email, first_name, last_name, educator, lang)
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
                      "Educator__c": educator,
                      "Newsletter_Names__c": mailing_lists
                  })
        res = self.post(self.create_endpoint("Sefaria_App_Data__c"),
                        json={
                            "JSON_STRING__c": json_string
                        })
        try:
            if res.status_code == 201:
                return True
            else:
                logger.error("Salesforce subscribe_to_lists failed",
                           status_code=res.status_code,
                           response_text=res.text,
                           email=email)
                return False
        except Exception as e:
            logger.error("Salesforce subscribe_to_lists exception",
                        error=str(e),
                        email=email)
            return False

    def get_available_lists(self) -> list[str]:
        try:
            resource_prefix = f"services/data/v{self.version}/query"
            endpoint = f"{sls.SALESFORCE_BASE_URL}/{resource_prefix}/"
            response = self.get(endpoint + "?q=SELECT+Subscriptions__c+FROM+AC_to_SF_List_Mapping__mdt")
            records = response.json()["records"]
            return [record["Subscriptions__c"] for record in records]
        except (requests.RequestException, KeyError, json.JSONDecodeError, AttributeError):
            raise SalesforceNewsletterListRetrievalError("Unable to retrieve newsletter mailing lists from Salesforce CRM")
