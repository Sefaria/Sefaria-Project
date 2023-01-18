
import django
django.setup()

from sefaria.helper.salesforce import SalesforceConnectionManager

cm = SalesforceConnectionManager()

session = cm.get_connection()
headers = {'Content-type': 'application/json', 'Accept': 'application/json'}

res = session.get(cm.base_url + '/services/data/v56.0/sobjects/', headers=headers)
res_data = res.json()
print(res_data)
print(session)