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