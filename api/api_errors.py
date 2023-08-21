import django
django.setup()
from sefaria.model import *
from typing import List


class APIDataError():

    def __init__(self):
        pass

    def get_dict(self) -> dict:
        return {'error_code': self.error_code,
                'message': self.message}


class APINoVersion(APIDataError):

    def __init__(self, oref: Ref, vtitle: str, lang: str):
        self.error_code = 101
        self.message = f'We do not have version named {vtitle} with language code {lang} for {oref}'


class APINoLanguageVersion(APIDataError):

    def __init__(self, oref: Ref, langs: List[str]):
        self.error_code = 102
        self.message = f'We do not have the code language you asked for {oref}. Available codes are {langs}'


class APINoSourceText(APIDataError):

    def __init__(self, oref: Ref):
        self.error_code = 103
        self.message = f'We do not have the source text for {oref}'
