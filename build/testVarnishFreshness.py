import os
import requests
from deepdiff import DeepDiff


existingVarnishHost = os.environ.get('VARNISH_HOST')
newHost = os.environ.get('NEW_HOST')
urls = [
    '/api/texts/versions/Shabbat',

]

for url in urls:
    responseA = requests.get(existingVarnishHost + url)
    responseB = requests.get(newHost + url)
    ddiff = DeepDiff(responseA, responseB, ignore_order=True)
    if ddiff:
        exit(1)

exit(0)
