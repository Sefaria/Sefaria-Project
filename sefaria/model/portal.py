from . import abstract as abst
from sefaria.system.validators import validate_dictionary, validate_url, validate_http_method
import structlog
logger = structlog.get_logger(__name__)


class Portal(abst.SluggedAbstractMongoRecord):
    collection = 'portals'
    slug_fields = ['slug']

    required_attrs = [
        "slug",
        "about",
        "name",
    ]
    optional_attrs = [
        "mobile",
        "newsletter",
        "organization"
    ]

    def _validate(self):
        super(Portal, self)._validate()

        about_schema = {
            "title": ({"en": (str, "required"), "he": (str, "required")}, "required"),
            "title_url": (str, "optional"),
            "image_uri": (str, "optional"),
            "image_caption": ({"en": (str, "optional"), "he": (str, "optional")}, "optional"),
            "description": ({"en": (str, "required"), "he": (str, "required")}, "optional"),
        }

        mobile_schema = {
            "title": ({"en": (str, "required"), "he": (str, "required")}, "required"),
            "description": ({"en": (str, "optional"), "he": (str, "optional")}, "optional"),
            "android_link": (str, "optional"),
            "ios_link": (str, "optional")
        }

        organization_schema = {
            "title": ({"en": (str, "required"), "he": (str, "required")}, "required"),
            "description": ({"en": (str, "required"), "he": (str, "required")}, "optional"),
        }

        newsletter_schema = {
            "title": ({"en": (str, "required"), "he": (str, "required")}, "required"),
            "description": ({"en": (str, "required"), "he": (str, "required")}, "optional"),
            "title_url": (str, "optional"),
            "api_schema": ({"http_method": (str, "required"),
                            "payload": ({"first_name_key": (str, "optional"), "last_name_key": (str, "optional"), "email_key": (str, "optional")}, "optional")}
                           , "optional")
        }

        validate_dictionary(self.name, {"en": (str, "required"), "he": (str, "required")})

        if hasattr(self, "about"):
            validate_dictionary(self.about, about_schema)
            title_url = self.about.get("title_url")
            if title_url:
                validate_url(title_url)
        if hasattr(self, "mobile"):
            validate_dictionary(self.mobile, mobile_schema)
            android_link = self.mobile.get("android_link")
            if android_link:
                validate_url(android_link)
            ios_link = self.mobile.get("ios_link")
            if ios_link:
                validate_url(ios_link)
        if hasattr(self, "organization"):
            validate_dictionary(self.organization, organization_schema)
        if hasattr(self, "newsletter"):
            validate_dictionary(self.newsletter, newsletter_schema)
            http_method = self.newsletter.get("api_schema", {}).get("http_method")
            if http_method:
                validate_http_method(http_method)
        return True


class PortalSet(abst.AbstractMongoSet):
    recordClass = Portal







