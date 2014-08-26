
from functools import wraps
from sefaria.client.util import jsonResponse
import sefaria.system.exceptions as exps


def catch_error(func):
    """
    Decorator that catches 'UserException's and translates them into JSON 'error' dicts for front end consumption.
    """
    @wraps(func)
    def wrapper(*args, **kwargs):
        try:
            result = func(*args, **kwargs)
        except exps.InputError as e:
            return jsonResponse({"error": str(e)})
        return result
    return wrapper