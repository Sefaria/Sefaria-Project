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


class ComplexBookLevelRefError(InputError):
    def __init__(self, book_ref):
        self.book_ref = book_ref
        self.message = (f"You passed '{book_ref}', please pass a more specific ref for this book, and try again. "
                        f"'{book_ref}' is a \'complex\' book-level ref. We only support book-level "
                        f"refs in cases of texts with a 'simple' structure. To learn more about the "
                        f"structure of a text on Sefaria, "
                        f"see: https://developers.sefaria.org/docs/the-structure-of-a-simple-text")
        super().__init__(self.message)


class BuildDegradationError(Exception):
    """A build skipped so many records that continuing would serve a broken library.

    Raised by the skip-tracking breakers in sefaria.helper.skip_tracking when a build's
    skip volume crosses a threshold. Not a bad-record exception and deliberately NOT in
    BAD_RECORD_EXCEPTIONS: it must never be swallowed by the very guards that raise it.
    """
    pass


# Exceptions that indicate a single corrupt/malformed DB record — as opposed to a
# systemic failure (Mongo connectivity, import/programming errors). Per-record loops
# at startup should catch THIS so one bad record is logged-and-skipped, while systemic
# failures still abort the boot loudly instead of producing a silently half-built
# library. `InputError` is the parent of the model-layer "bad data" family
# (IndexSchemaError, BookNameError, SheetNotFoundError, DictionaryEntryNotFoundError,
# etc.); the builtins cover poking at malformed Mongo docs (missing fields, None values,
# bad indices).
#
# AttributeError and TypeError were originally EXCLUDED, because the dominant cause of
# both is an ordinary code bug rather than bad data: AttributeError fires on a renamed or
# removed attribute, TypeError on a wrong-arity call. Catching them was judged to risk
# degrading a refactoring bug from a loud boot crash into a per-record warning firing on
# EVERY record — a worse, invisible failure mode.
#
# They are now INCLUDED, for two measured reasons:
#
#   1. The exclusion was more expensive than assumed. `AbstractMongoRecord` sets attributes
#      only for keys actually present in the document, so a MISSING Mongo field surfaces as
#      AttributeError on the Python object ("'Topic' object has no attribute 'slug'"), not
#      as KeyError. That is the single most common real corruption shape, and excluding it
#      meant the guards missed most of what they were written to survive. An audit of 38
#      real corruptions across 21 guard sites (sefaria/helper/tests/
#      audit_skip_bad_record_test.py) measured coverage rising from 9 to 23 CAUGHT when
#      these two were added.
#
#   2. The failure mode that motivated the exclusion is now blocked by a better mechanism.
#      Bad data and a broken refactor raise the SAME exception class and differ only in
#      VOLUME, so the exception type was never the right discriminator. The skip-tracking
#      breakers in sefaria.helper.skip_tracking measure volume directly: an identical error
#      signature repeating across records re-raises and aborts the build (a rename trips it
#      within ~10 records), and a high absolute skip count at any one site aborts as a
#      backstop for mass corruption that is too varied to repeat.
#
# So the guarantee is unchanged — "resilient to one corrupt record, loud on systemic
# breakage" — but systemic-ness is now detected rather than approximated by exception type.
# Widening this tuple WITHOUT those breakers in place would reinstate the original risk.
BAD_RECORD_EXCEPTIONS = (InputError, KeyError, ValueError, IndexError, AttributeError, TypeError)
