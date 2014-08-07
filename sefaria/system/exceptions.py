"""
UserError exceptions get handled by the front-end API views (via the catch_error decorator)
    and turned into JSON wrapped error messages for the front end.

All other exceptions get handled by the default Django error handling system.
"""


class UserError(Exception):
    """ An exception that gets propogated out to the user level """
    pass

