
import django
django.setup()

from sefaria.helper.crm.salesforce import SalesforceConnectionManager

cm = SalesforceConnectionManager()

# session = cm.get_connection()
headers = {'Content-type': 'application/json', 'Accept': 'application/json'}

res = cm.session.get(cm.base_url + '/services/data/v56.0/sobjects/Sefaria_App_User__c', headers=headers)
res_data = res.json()
res = cm.add_user_to_crm([], "test@testabcnissa.com", "NissaSefariaTest_First", "NissaSefariaTest_Last") ## figure out permissions error
res_data = res.json()
print(res_data)
