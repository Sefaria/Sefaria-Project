from sefaria import settings as sls
from sefaria.helper.crm.crm_connection_manager import CrmConnectionManager


class DummyConnectionManager(CrmConnectionManager):
    def __init__(self):
        CrmConnectionManager.__init__(self, "")

    def _get_connection(self):
        return {}

    def add_user_to_crm(self, lists, email, first_name=None, last_name=None):
        return False

    def nationbuilder_get_all(self, endpoint_func, args=[]):
        pass

    def sync_sustainers(self):
        pass

    def mark_as_spam_in_crm(self, profile):
        pass

    def __del__(self):
        pass
