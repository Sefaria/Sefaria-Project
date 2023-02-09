from sefaria import settings as sls
from sefaria.helper.crm.nationbuilder import NationbuilderConnectionManager
from sefaria.helper.crm.salesforce import SalesforceConnectionManager


class CrmFactory(object):
    def __init__(self):
        self.crm_type = sls.CRM_TYPE

    def get_connection_manager(self):
        if self.crm_type == "NATIONBUILDER":
            return NationbuilderConnectionManager()
        elif self.crm_type == "SALESFORCE":
            return SalesforceConnectionManager()
        else:
            raise ValueError('Unexpected CRM Type found in Settings')