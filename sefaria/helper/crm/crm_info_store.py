from sefaria.model.user_profile import UserProfile
from sefaria import settings as sls
from sefaria.system.database import db

import structlog

class CrmInfoStore(object):

    @staticmethod
    def save_crm_id(crm_id, email, crm_type, profile=None):
        """
        Saves CRM id to the database with the correct field
        """
        if crm_type == "NATIONBUILDER":
            if profile:
                user_profile = profile
            else:
                user_profile = UserProfile(email=email, user_registration=True)
            if user_profile.id is not None and user_profile.nationbuilder_id != crm_id:
                user_profile.nationbuilder_id = crm_id
                user_profile.save()
                return True
            return False
        elif crm_type == "SALESFORCE":
            if profile:
                user_profile = profile
            else:
                user_profile = UserProfile(email=email, user_registration=True)
            if user_profile.id is not None and user_profile.sf_app_user_id != crm_id:
                user_profile.sf_app_user_id = crm_id
                user_profile.save()
                return True
            return False
        elif crm_type == "NONE" or not crm_type:
            return True

    @staticmethod
    def get_crm_id(uid=None, email=None, profile=None, crm_type=sls.CRM_TYPE):
        if profile:
            user_profile = profile
        elif email:
            user_profile = UserProfile(email=email)
        elif uid:
            user_profile = UserProfile(id=uid)
        else:
            raise RuntimeError("Expected a uid, email, or profile to be provided")

        if crm_type == "NATIONBUILDER":
            return user_profile.nationbuilder_id
        elif crm_type == "SALESFORCE":
            return user_profile.sf_app_user_id
        elif crm_type == "NONE":
            return True

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
