# coding=utf-8
from urllib.parse import urlparse
from . import abstract as abst
import urllib.parse
from django.core.validators import URLValidator
from django.core.exceptions import ValidationError
import structlog
logger = structlog.get_logger(__name__)


class InvalidURLException(Exception):
    def __init__(self, url):
        self.url = url
        self.message = f"'{url}' is not a valid URL."
        super().__init__(self.message)

def validate_url(url):
    try:
        # Attempt to parse the URL
        validator = URLValidator()
        validator(url)
        return True

    except ValidationError:
        # URL parsing failed
        raise InvalidURLException(url)
class InvalidHTTPMethodException(Exception):
    def __init__(self, method):
        self.method = method
        self.message = f"'{method}' is not a valid HTTP API method."
        super().__init__(self.message)

def validate_http_method(method):
    """
    Validate if a string represents a valid HTTP API method.

    Args:
        method (str): The HTTP method to validate.

    Raises:
        InvalidHTTPMethodException: If the method is not valid.

    Returns:
        bool: True if the method is valid, False otherwise.
    """
    valid_methods = ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"]

    # Convert the method to uppercase and check if it's in the list of valid methods
    if method.upper() in valid_methods:
        return True
    else:
        raise InvalidHTTPMethodException(method)

class Portal(abst.SluggedAbstractMongoRecord):
    collection = 'portals'
    slug_fields = ['slug']

    required_attrs = [
        "slug",
        "about",
    ]
    optional_attrs = [
        "mobile",
        'newsletter',
    ]

    def _validate(self):
        super(Portal, self)._validate()

        about_schema = {
            "title": ({"en": (str, "required"), "he": (str, "required")}, "required"),
            "title_url": (str, "optional"),
            "image_uri": (str, "optional"),
            "description": ({"en": (str, "required"), "he": (str, "required")}, "optional"),
        }

        mobile_schema = {
            "title": ({"en": (str, "required"), "he": (str, "required")}, "required"),
            "description": ({"en": (str, "optional"), "he": (str, "optional")}, "optional"),
            "android_link": (str, "optional"),
            "ios_link": (str, "optional")
        }

        newsletter_schema = {
            "title": ({"en": (str, "required"), "he": (str, "required")}, "required"),
            "title_url": (str, "optional"),
            "description": ({"en": (str, "required"), "he": (str, "required")}, "optional"),
            "api_schema": ({"http_method": (str, "required"),
                            "payload": ({"first_name_key": (str, "optional"), "last_name_key": (str, "optional"), "email_key": (str, "optional")}, "optional")}
                           , "optional")
        }

        if hasattr(self, "about"):
            abst.validate_dictionary(self.about, about_schema)
            title_url = self.about.get("title_url")
            if title_url:
                validate_url(title_url)
        if hasattr(self, "mobile"):
            abst.validate_dictionary(self.mobile, mobile_schema)
            android_link = self.mobile.get("android_link")
            if android_link:
                validate_url(android_link)
            ios_link = self.mobile.get("ios_link")
            if ios_link:
                validate_url(ios_link)
        if hasattr(self, "newsletter"):
            abst.validate_dictionary(self.newsletter, newsletter_schema)
            title_url = self.newsletter.get("title_url")
            if title_url:
                validate_url(title_url)
            http_method = self.newsletter.get("api_schema", {}).get("http_method")
            if http_method:
                validate_http_method(http_method)
        return True






