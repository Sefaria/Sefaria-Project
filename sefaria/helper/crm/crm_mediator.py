from sefaria.helper.crm.crm_factory import CrmFactory
from sefaria.helper.crm.crm_info_store import CrmInfoStore
from sefaria import settings as sls


# todo: task queue, async

class CrmMediator:
    def __init__(self):
        self._crm_connection = CrmFactory().get_connection_manager()

    def create_crm_user(self, email, first_name, last_name, lang="en", educator=False):
        try:
            crm_id = self._crm_connection.add_user_to_crm(email, first_name, last_name, lang, educator)
            if crm_id:
                CrmInfoStore.save_crm_id(crm_id, email, sls.CRM_TYPE)
                return True
            else:
                return False
        except:
            return False

    def subscribe_to_lists(self, email, first_name, last_name, educator=False, lang="en"):
        return self._crm_connection.subscribe_to_lists(email, first_name, last_name, educator, lang)

    def sync_sustainers(self):
        current_sustainers = CrmInfoStore.get_current_sustainers()
        for crm_sustainer in self._crm_connection.get_sustainers():
            crm_sustainer_profile = CrmInfoStore.find_sustainer_profile(crm_sustainer)
            if current_sustainers.get(crm_sustainer.id) is not None:  # keep current sustainer
                del current_sustainers[crm_sustainer.id]
            else:
                CrmInfoStore.mark_sustainer(crm_sustainer_profile)

        for sustainer_to_remove in current_sustainers:
            CrmInfoStore.mark_sustainer(sustainer_to_remove, False)

    def mark_as_spam_in_crm(self, uid=None, email=None, profile=None):
        """
        Marks user as spam in CRM if user exists
        """
        crm_id = CrmInfoStore.get_crm_id(uid, email, profile)
        if crm_id:
            self._crm_connection.mark_as_spam_in_crm(crm_id)
        else:
            return False

    def mark_for_review_in_crm(self, uid=None, email=None, profile=None):
        """
        Marks user as spam in CRM if user exists
        """
        crm_id = CrmInfoStore.get_crm_id(uid, email, profile)
        if crm_id:
            if self._crm_connection.mark_for_review_in_crm(crm_id):
                return True
        return False

    def update_user_email(self, new_email, uid=None, email=None, profile=None):
        """
        Updates user CRM if user exists
        """
        crm_id = CrmInfoStore.get_crm_id(uid, email, profile)
        if crm_id:
            return self._crm_connection.change_user_email(crm_id, new_email)
        else:
            return False

    def get_and_save_crm_id(self, email=None):
        crm_id = self._crm_connection.find_crm_id(email)
        if crm_id:
            CrmInfoStore.save_crm_id(crm_id, email)
        else:
            return False
