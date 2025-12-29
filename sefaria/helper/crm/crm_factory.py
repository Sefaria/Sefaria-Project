from django.conf import settings as sls
from sefaria.helper.crm.nationbuilder import NationbuilderConnectionManager
from sefaria.helper.crm.salesforce import SalesforceConnectionManager
from sefaria.helper.crm.dummy_crm import DummyConnectionManager
import structlog
logger = structlog.get_logger(__name__)


class CrmFactory(object):
    def __init__(self):
        self.crm_type = sls.CRM_TYPE

    def get_connection_manager(self):
        logger.info("[NEWSLETTER_DEBUG] CrmFactory creating connection", crm_type=self.crm_type)
        if self.crm_type == "NATIONBUILDER":
            return NationbuilderConnectionManager()
        elif self.crm_type == "SALESFORCE":
            return SalesforceConnectionManager()
        elif self.crm_type == "NONE" or not self.crm_type:
            return DummyConnectionManager()
        else:
            return DummyConnectionManager()
