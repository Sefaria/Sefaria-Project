class CrmConnectionManager(object):
    def __init__(self, base_url):
        self.base_url = base_url
        self.session = self._get_connection()


    def _get_connection(self):
        """
        Authenticate application & return a Requests session object
        """
        pass

    def add_user_to_crm(self, lists, email, first_name, last_name, lang="en", educator=False):
        """
        Add a new Sefaria app user to the CRM.
        Returns user id if successful
        Returns false if no user added
        """
        CrmConnectionManager.add_user_to_crm(lists, email, first_name, last_name, lang, educator)
        pass

    def change_user_email(self, uid, new_email):
        """
        Update a user's email in the CRM.
        """
        pass

    def add_email_to_mailing_lists(self, email, lists, first_name=None, last_name=None, lang="en"):
        """
        Add email directly to mailing list
        """
        pass

    def sync_sustainers(self):
        """
        Updates users' sustainer status in the database
        """
        pass

    def mark_as_spam_in_crm(self, crm_id):
        """
        Do in CRM whatever decision has been made to do about spam users.
        """
        pass
