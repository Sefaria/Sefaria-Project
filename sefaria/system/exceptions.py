"""
UserError exceptions get handled by the front-end API views (via the catch_error decorator)
    and turned into JSON wrapped error messages for the front end.

All other exceptions get handled by the default Django error handling system.
"""


class InputError(Exception):
    """ Exception thrown when bad input of some sort is found.  This is the parent exception for parsing exceptions. """
    pass


class PartialRefInputError(InputError):
    """ Special Case Exception to throw when an input error is partially correct"""
    def __init__(self, message, matched_part, valid_continuations):

        # Call the base class constructor with the parameters it needs
        super(InputError, self).__init__(message)

        # Now for your custom code...
        self.matched_part = matched_part
        self.valid_continuations = valid_continuations


class BookNameError(InputError):
    """ Thrown when a book title is searched for and not found.  """
    pass


class DuplicateRecordError(InputError):
    """ Thrown when trying to save a record that would duplicate existing information """
    pass


class IndexSchemaError(InputError):
    pass


class NoVersionFoundError(InputError):
    pass


class DictionaryEntryNotFoundError(InputError):
    def __init__(self, message, lexicon_name=None, base_title=None, word=None):
        super(DictionaryEntryNotFoundError, self).__init__(message)
        self.lexicon_name = lexicon_name
        self.base_title = base_title
        self.word = word


class SheetNotFoundError(InputError):
    pass


class ManuscriptError(Exception):
    pass


class MissingKeyError(Exception):
    pass


class SluggedMongoRecordMissingError(Exception):
    pass


class SchemaValidationException(Exception):
    def __init__(self, key, expected_type):
        self.key = key
        self.expected_type = expected_type
        self.message = f"Invalid value for key '{key}'. Expected type: {expected_type}"
        super().__init__(self.message)


class SchemaRequiredFieldException(Exception):
    def __init__(self, key):
        self.key = key
        self.message = f"Required field '{key}' is missing."
        super().__init__(self.message)


class SchemaInvalidKeyException(Exception):
    def __init__(self, key):
        self.key = key
        self.message = f"Invalid key '{key}' found in data dictionary."
        super().__init__(self.message)


class InvalidURLException(Exception):
    def __init__(self, url):
        self.url = url
        self.message = f"'{url}' is not a valid URL."
        super().__init__(self.message)


class InvalidHTTPMethodException(Exception):
    def __init__(self, method):
        self.method = method
        self.message = f"'{method}' is not a valid HTTP API method."
        super().__init__(self.message)
