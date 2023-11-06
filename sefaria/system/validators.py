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


def validate_dictionary(data, schema):
    """
    Validates that a given dictionary complies with the provided schema.

    Args:
        data (dict): The dictionary to be validated.
        schema (dict): The schema dictionary specifying the expected structure.

    Raises:
        SchemaValidationException: If the data does not comply with the schema.

    Returns:
        bool: True if the data complies with the schema, False otherwise.
    """

    for key, value_type in schema.items():
        if not (isinstance(value_type, tuple) and len(value_type) == 2 and value_type[1] in ["optional", "required"]):
            raise ValueError(f"Invalid schema definition for key '{key}'. Use ('type', 'optional') or ('type', 'required').")

    # Check for keys in data that are not in schema
    for key in data.keys():
        if key not in schema:
            raise SchemaInvalidKeyException(key)

    for key, value_type in schema.items():
        # Check if the key exists in the data dictionary
        if key not in data:
            # Check if the field is optional (not required)
            if isinstance(value_type, tuple) and len(value_type) == 2 and value_type[1] == "optional":
                continue  # Field is optional, so skip validation
            else:
                raise SchemaRequiredFieldException(key)

        # Check if the expected type is a nested dictionary
        if isinstance(value_type[0], dict):
            nested_data = data[key]
            nested_schema = value_type[0]
            try:
                # Recursively validate the nested dictionary
                validate_dictionary(nested_data, nested_schema)
            except SchemaValidationException as e:
                # If validation fails for the nested dictionary, re-raise the exception with the key
                raise SchemaValidationException(f"{key}.{e.key}", e.expected_type)

        # Check the type of the value in the data dictionary
        elif not isinstance(data[key], value_type[0]):
            raise SchemaValidationException(key, value_type[0])
    return True


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
