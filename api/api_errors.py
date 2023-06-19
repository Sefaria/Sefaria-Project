import django
django.setup()
from sefaria.model import *
from typing import List


class APIError():

    def __init__(self, error_code=0, message=''):
        self.error_code = error_code
        self.message = message

    def get_dict(self) -> dict:
        return {'error_code': self.error_code,
                'message': self.message}


class NoVersionError(APIError):

    def __init__(self, oref: Ref, vtitle: str, lang: str):
        self.error_code = 101
        self.message = f'We do not have version named {vtitle} with language code {lang} for {oref}'


class NoLanguageVersionError(APIError):

    def __init__(self, oref: Ref, langs: List[str]):
        self.error_code = 102
        self.message = f'We do not have the code language you asked for {oref}. Available codes are {langs}'


class NoSourceTextError(APIError):

    def __init__(self, oref: Ref):
        self.error_code = 103
        self.message = f'We do not have the source text for {oref}'



class RefIsEmptyError(APIError):

    def __init__(self, oref: Ref):
        self.error_code = 104
        self.message = f'The ref {oref} is empty'
