from unittest import TestCase

from sefaria.helper.crm.dummy_crm import DummyConnectionManager
from sefaria.helper.crm.salesforce import SalesforceConnectionManager

"""
class TestConnectionTest(TestCase):
    def __init__(self):
        self.dummy_connection = DummyConnectionManager()
        self.sf_connection = SalesforceConnectionManager()
        self.connections = [self.dummy_connection, self.sf_connection]

    def test_subscribes_user(self):
        for connection in self.connections:
"""