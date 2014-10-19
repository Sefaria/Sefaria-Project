"""
UserError exceptions get handled by the front-end API views (via the catch_error decorator)
    and turned into JSON wrapped error messages for the front end.

All other exceptions get handled by the default Django error handling system.
"""


class InputError(Exception):
    """ Exception thrown when bad input of some sort is found.  This is the parent exception for parsing exceptions. """
    pass


class BookNameError(InputError):
    """ Thrown when a book title is searched for and not found.  """
    pass


class DuplicateRecordError(InputError):
    """ Thrown when trying to save a record that would duplicate existing information """
    pass