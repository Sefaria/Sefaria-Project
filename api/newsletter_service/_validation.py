"""Input checks shared by every layer of the newsletter service. Imports nothing else from the package except errors."""

from __future__ import annotations

from django.core.exceptions import ValidationError
from django.core.validators import validate_email as django_validate_email

from api.newsletter_service._errors import InvalidEmailError


def normalize_and_validate_email(email: str) -> str:
    """
    Return a trimmed email address or raise InvalidEmailError before any AC request.
    """
    if not isinstance(email, str):
        raise InvalidEmailError("Invalid email address.")

    normalized_email = email.strip()
    try:
        django_validate_email(normalized_email)
    except ValidationError:
        raise InvalidEmailError("Invalid email address.")
    return normalized_email


def is_valid_learning_level(value: object) -> bool:
    """
    True if value is a whole number from 1 to 5.

    JSON true/false arrive as Python True/False, and in Python bool is a kind of
    int (True == 1). So a plain isinstance(value, int) check would accept
    `"learningLevel": true` as level 1. We rule out bools first.
    """
    return isinstance(value, int) and not isinstance(value, bool) and 1 <= value <= 5
