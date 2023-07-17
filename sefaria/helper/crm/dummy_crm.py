from sefaria.helper.crm.crm_connection_manager import CrmConnectionManager


class DummyConnectionManager(CrmConnectionManager):
    def __init__(self):
        CrmConnectionManager.__init__(self, "")

    def _get_connection(self):
        return {}

    def add_user_to_crm(self, email, first_name=None, last_name=None, lang="en", educator=False):
        CrmConnectionManager.add_user_to_crm(self, email, first_name, last_name, lang, educator)
        return True

    def mark_as_spam_in_crm(self, crm_id):
        return True

    def mark_for_review_in_crm(self, crm_id):
        return True

    def change_user_email(self, uid, new_email):
        return True

    def subscribe_to_lists(self, email, first_name=None, last_name=None, lang="en", educator=False):
        CrmConnectionManager.subscribe_to_lists(self, email, first_name, last_name, lang, educator)
        return True

    def find_crm_id(self, email=None):
        CrmConnectionManager.find_crm_id(self, email=email)
        return True
