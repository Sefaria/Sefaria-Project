import base64
import requests
from sefaria.helper.crm.crm_connection_manager import CrmConnectionManager

from sefaria import settings as sls

class SalesforceConnectionManager(CrmConnectionManager):
    def __init__(self):
        CrmConnectionManager.__init__(self, sls.SALESFORCE_BASE_URL)

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

    def add_user_to_crm(self, lists, email, first_name, last_name):
        """
        Adds a new user to the CRM and subscribes them to the specified lists.
        Saves CRM Access info to profile
        """
        pass



