from rauth import OAuth2Service
import json

from sefaria import settings as sls


class CrmConnectionManager(object):
    def __init__(self, base_url):
        self.base_url = base_url

    def get_connection(self):
        pass


class SalesforceConnectionManager(CrmConnectionManager):
    def __init__(self):
        CrmConnectionManager.__init__(self, sls.SALESFORCE_BASE_URL)
        # self.params = {'grant_type': sls.SALESFORCE_GRANT_TYPE}
        self.params = {'response_type': 'code'}
        # self.data = {
        # 'Content-type': 'application/x-www-form-urlencoded',
        # 'Accept': 'application/json',
        # 'grant_type': sls.SALESFORCE_GRANT_TYPE
        # }
        self.data = {}

    def get_connection(self):
        access_token_url = "%s/services/oauth2/token" % self.base_url
        authorize_url = "%s/services/oauth2/authorize" % self.base_url
        # service = OAuth2Service(
        #     client_id=sls.SALESFORCE_CLIENT_ID,
        #     client_secret=sls.SALESFORCE_CLIENT_SECRET,
        #     access_token_url=access_token_url,
        #     authorize_url=authorize_url,
        #     base_url=self.base_url
        # )
        # url = service.get_authorize_url(**self.params)
        # session = service.get_auth_session(data=self.data)
        service = OAuth2Service(
            client_id=sls.SALESFORCE_CLIENT_ID,
            client_secret=sls.SALESFORCE_CLIENT_SECRET,
            access_token_url=access_token_url,
            authorize_url=authorize_url,
            base_url=self.base_url,
            name='sefaria_app'
        )
        token = service.get_access_token(decoder=json.loads, data={"grant_type": "authorization_code"})
        # Get an access token
        data = {'grant_type': 'client_credentials'}
        session = service.get_session(token)

        #ession = service.get_session(data=data)
        return session
