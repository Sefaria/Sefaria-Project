from unittest import TestCase
from unittest.mock import Mock, patch, MagicMock
from sefaria.helper.crm.crm_factory import CrmFactory
from sefaria.helper.crm.crm_info_store import CrmInfoStore
import sys
import copy
from sefaria.helper.crm.crm_mediator import CrmMediator

crm_factory_stub = Mock()
fake_connection_manager = Mock()
crm_factory_stub.get_connection_manager.return_value = fake_connection_manager

