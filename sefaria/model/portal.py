from . import abstract as abst
from sefaria.system.validators import validate_url, validate_http_method
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
    attr_schemas = {
        "about": {
            "title": {
                "type": "dict",
                "required": True,
                "schema": {
                    "en": {"type": "string", "required": True},
                    "he": {"type": "string", "required": True}
                }
            },
            "title_url": {"type": "string"},
            "image_uri": {"type": "string"},
            "image_caption": {
                "type": "dict",
                "schema": {
                    "en": {"type": "string"},
                    "he": {"type": "string"}
                }
            },
            "description": {
                "type": "dict",
                "schema": {
                    "en": {"type": "string", "required": True},
                    "he": {"type": "string", "required": True}
                }
            },
        },
        "mobile": {
            "title": {
                "type": "dict",
                "required": True,
                "schema": {
                    "en": {"type": "string", "required": True},
                    "he": {"type": "string", "required": True}
                }
            },
            "description": {
                "type": "dict",
                "schema": {
                    "en": {"type": "string"},
                    "he": {"type": "string"}
                }
            },
            "android_link": {"type": "string"},
            "ios_link": {"type": "string"}
        },
        "organization": {
            "title": {
                "type": "dict",
                "required": True,
                "schema": {
                    "en": {"type": "string", "required": True},
                    "he": {"type": "string", "required": True}
                }
            },
            "description": {
                "type": "dict",
                "schema": {
                    "en": {"type": "string", "required": True},
                    "he": {"type": "string", "required": True}
                }
            },
        },
        "newsletter": {
            "title": {
                "type": "dict",
                "required": True,
                "schema": {
                    "en": {"type": "string", "required": True},
                    "he": {"type": "string", "required": True}
                }
            },
            "description": {
                "type": "dict",
                "schema": {
                    "en": {"type": "string", "required": True},
                    "he": {"type": "string", "required": True}
                }
            },
            "title_url": {"type": "string"},
            "api_schema": {
                "type": "dict",
                "schema": {
                    "http_method": {"type": "string", "required": True},
                    "payload": {
                        "type": "dict",
                        "schema": {
                            "first_name_key": {"type": "string"},
                            "last_name_key": {"type": "string"},
                            "email_key": {"type": "string"}
                        }
                    },
                }
            }
        }
    }

    def _validate(self):
        super(Portal, self)._validate()
        if hasattr(self, "about"):
            title_url = self.about.get("title_url")
            if title_url: validate_url(title_url)
        if hasattr(self, "mobile"):
            android_link = self.mobile.get("android_link")
            if android_link: validate_url(android_link)
            ios_link = self.mobile.get("ios_link")
            if ios_link: validate_url(ios_link)
        if hasattr(self, "newsletter"):
            http_method = self.newsletter.get("api_schema", {}).get("http_method")
            if http_method: validate_http_method(http_method)
        return True


class PortalSet(abst.AbstractMongoSet):
    recordClass = Portal
