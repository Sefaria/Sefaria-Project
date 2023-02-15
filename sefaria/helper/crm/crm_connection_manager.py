class CrmConnectionManager(object):
    def __init__(self, base_url):
        self.base_url = base_url
        self.session = self.get_connection()

    def get_connection(self):
        pass

    def add_user_to_crm(self, lists, email, first_name, last_name):
        pass

    def change_user_email(self, uid, new_email):
        pass

    def add_user_to_mailing_lists(self, uid, lists):
        pass

    def sync_sustainers(self):
        pass

    def mark_as_spam_in_crm(self, profile):
        """
        Do in CRM whatever decision has been made to do about spam users.
        """
        pass
