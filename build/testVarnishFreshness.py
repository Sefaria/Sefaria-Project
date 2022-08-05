import os
import requests
from deepdiff import DeepDiff


existingVarnishHost = os.environ.get('VARNISH_HOST')
newHost = os.environ.get('NEW_HOST')
urls = [
    '/api/v2/index/Genesis?with_content_counts=1&with_related_topics=1',
    '/api/v2/index/Pesach%20Haggadah?with_content_counts=1&with_related_topics=1',
    '/api/related/Genesis.3?with_sheet_links=1',
    '/api/related/Pesach_Haggadah%2C_Yachatz?with_sheet_links=1',
    '/api/texts/Genesis.3?ven=The_Five_Books_of_Moses%2C_by_Everett_Fox._New_York%2C_Schocken_Books%2C_1995&commentary=0&context=1&pad=0&wrapLinks=1&wrapNamedEntities=1&multiple=0&stripItags=0&transLangPref=&firstAvailableRef=1&fallbackOnDefaultVersion=1',
    '/api/texts/Zohar.1.9a',
    '/api/texts/Pesach_Haggadah%2C_Urchatz.2?commentary=0&context=1&pad=0&wrapLinks=1&wrapNamedEntities=1&multiple=0&stripItags=0&transLangPref=&firstAvailableRef=1&fallbackOnDefaultVersion=1',
    '/api/texts/versions/Shabbat',
    '/api/name/Bob',
    '/api/name/דגד',
    '/api/name/Shabbat%2057b',
    '/api/name/שבת%20כ.',
    '/api/search-path-filter/Pesach%20Haggadah',
    '/api/words/completion/%D7%93%D7%92',
    '/api/linker-data/Jer%7CPro%7CLam%7CEicha%7CLamentations%7CMegilla',
    '/api/bulktext/Deuteronomy%201:1%20-%203:22%7CIsaiah%201:1%20-%201:27'
]

for url in urls:
    responseA = requests.get(existingVarnishHost + url)
    responseB = requests.get(newHost + url)
    ddiff = DeepDiff(responseA, responseB, ignore_order=True)
    if ddiff:
        exit(1)

exit(0)
