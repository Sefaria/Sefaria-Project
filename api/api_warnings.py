import django
django.setup()
from sefaria.model import *
from typing import List
from enum import Enum

class APIWarningCode(Enum):
    APINoVersion = 101
    APINoLanguageVersion = 102
    APINoSourceText = 103
    APINoTranslationText = 104

"""
classes for data warnings in API calls.
used when part of the data that was requested exists and returned, and part is missing.  
"""

class APIDatawarning():
    """
    general class
    """

    def __init__(self):
        pass


class TextsAPIResponseMessage(APIDatawarning):
    """
    class for returning a message and an warning code
    """

    def get_message(self) -> dict:
        return {'warning_code': self.warning_code.value,
                'message': self.message}


class APINoVersion(TextsAPIResponseMessage):

    def __init__(self, oref: Ref, vtitle: str, lang: str):
        self.warning_code = APIWarningCode.APINoVersion
        self.message = f'We do not have version named {vtitle} with language {lang} for {oref}'


class APINoLanguageVersion(TextsAPIResponseMessage):

    def __init__(self, oref: Ref, langs: List[str]):
        self.warning_code = APIWarningCode.APINoLanguageVersion
        self.message = f'We do not have the language you asked for {oref}. Available languages are {langs}'


class APINoSourceText(TextsAPIResponseMessage):

    def __init__(self, oref: Ref):
        self.warning_code = APIWarningCode.APINoSourceText
        self.message = f'We do not have the source text for {oref}'


class APINoTranslationText(TextsAPIResponseMessage):

    def __init__(self, oref: Ref):
        self.warning_code = APIWarningCode.APINoTranslationText
        self.message = f'We do not have a translation for {oref}'
