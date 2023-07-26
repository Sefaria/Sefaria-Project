import django
django.setup()
from sefaria.model import *
from typing import List


class APIError():

    def __init__(self):
        pass

    def get_dict(self) -> dict:
        return {'error_code': self.error_code,
                'message': self.message}


class APINoVersion(APIError):

    def __init__(self, oref: Ref, vtitle: str, lang: str):
        self.error_code = 101
        self.message = f'We do not have version named {vtitle} with language code {lang} for {oref}'


class APINoLanguageVersion(APIError):

    def __init__(self, oref: Ref, langs: List[str]):
        self.error_code = 102
        self.message = f'We do not have the code language you asked for {oref}. Available codes are {langs}'


class APINoSourceText(APIError):

    def __init__(self, oref: Ref):
        self.error_code = 103
        self.message = f'We do not have the source text for {oref}'
