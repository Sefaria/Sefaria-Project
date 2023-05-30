from sefaria.helper.crm.crm_connection_manager import CrmConnectionManager


class DummyConnectionManager(CrmConnectionManager):
    def __init__(self):
        CrmConnectionManager.__init__(self, "")

    def _get_connection(self):
        return {}

    def add_user_to_crm(self, email, first_name=None, last_name=None, lang="en", educator=False):
        CrmConnectionManager.add_user_to_crm(self, email, first_name, last_name, lang, educator)
        return False

    def nationbuilder_get_all(self, endpoint_func, args=[]):
        pass

    def mark_as_spam_in_crm(self, crm_id):
        pass

    def subscribe_to_lists(self, email, first_name=None, last_name=None, lang="en", educator=False):
        CrmConnectionManager.subscribe_to_lists(self, email, first_name, last_name, lang, educator)
        pass

    def find_crm_id(self, email=None):
        CrmConnectionManager.find_crm_id(self, email=email)
        pass

    def __del__(self):
        pass
