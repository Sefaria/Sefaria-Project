class CrmConnectionManager(object):
    def __init__(self, base_url):
        self.base_url = base_url
        self.session = self._get_connection()

    def _get_connection(self):
        """
        Authenticate application & return a Requests session object
        """
        pass

    def add_user_to_crm(self, lists, email, first_name, last_name):
        """
        Add a new Sefaria app user to the CRM.
        """
        pass

    def change_user_email(self, uid, new_email):
        """
        Update a user's email in the CRM.
        """
        pass

    def add_email_to_mailing_lists(self, email, lists):
        """
        Add email directly to mailing list
        """
        pass

    def sync_sustainers(self):
        """
        Updates users' sustainer status in the database
        """
        pass

    def mark_as_spam_in_crm(self, profile):
        """
        Do in CRM whatever decision has been made to do about spam users.
        """
        pass
