from sefaria.helper.crm.crm_factory import CrmFactory
from sefaria.helper.crm.crm_info_store import CrmInfoStore


# todo: task queue, async

class CrmMediator:
    def __init__(self):
        self._crm_connection = CrmFactory().get_connection_manager()

    def create_crm_user(self, lists, email, first_name, last_name, lang="en"):
        try:
            crm_id = self._crm_connection.add_user_to_crm(lists, email, first_name, last_name, lang)
            if crm_id:
                CrmInfoStore.save_crm_id(crm_id, email)
                return True
            else:
                return False
        except:
            return False

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
