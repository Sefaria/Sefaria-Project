from sefaria import settings as sls
from sefaria.model.user_profile import UserProfile

import structlog

class CrmInfoStore(object):

    @staticmethod
    def save_crm_id(profile_id, email):
        """
        Saves CRM id to the database with the correct field
        """
        if sls.CRM_TYPE == "NATIONBUILDER":
            user_profile = UserProfile(email=email, user_registration=True)
            if user_profile.id is not None and user_profile.nationbuilder_id != profile_id:
                user_profile.nationbuilder_id = profile_id
                user_profile.save()
                return True
            return False
        elif sls.CRM_TYPE == "SALESFORCE":
            user_profile = UserProfile(email=email, user_registration=True)
            if user_profile.id is not None and user_profile.sf_app_user_id != profile_id:
                user_profile.sf_app_user_id = profile_id
                user_profile.save()
                return True
            return False
        elif sls.CRM_TYPE == "NONE":
            return True

    @staticmethod
    def get_crm_id():
        pass

    @staticmethod
    def get_current_sustainers():
        return {profile["id"]: profile for profile in db.profiles.find({"is_sustainer": True})}

    @staticmethod
    def find_sustainer_profile(sustainer):
        if sustainer['email']:
            return UserProfile(email=sustainer['email'])

    @staticmethod
    def mark_sustainer(profile, is_sustainer=True):
        profile.update({"is_sustainer": is_sustainer})
        profile.save()
