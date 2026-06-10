"""
Pre-written validation functions
Useful for validating model schemas when overriding AbstractMongoRecord._validate()
"""

import urllib.parse
from urllib.parse import urlparse
from django.core.validators import URLValidator
from django.core.exceptions import ValidationError
from sefaria.system.exceptions import SchemaValidationException, SchemaInvalidKeyException, SchemaRequiredFieldException\
    , InvalidHTTPMethodException, InvalidURLException


def validate_url(url):
    try:
        # Attempt to parse the URL
        validator = URLValidator()
        validator(url)
        return True

    except ValidationError:
        # URL parsing failed
        raise InvalidURLException(url)


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
