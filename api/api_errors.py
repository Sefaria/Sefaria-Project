"""
Classes for API errors
"""
from sefaria.client.util import jsonResponse


class APIInvalidInputException(Exception):
    """
    When data in an invalid format is passed to an API
    """
    def __init__(self, message):
        super().__init__(message)
        self.message = message

    def to_json_response(self):
        return jsonResponse({"invalid_input_error": self.message}, status=400)
