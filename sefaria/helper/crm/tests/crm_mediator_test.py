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


class TestCrmMediatorInit(TestCase):
    def test_sets_crm_connection(self):
        with patch('sefaria.helper.crm.crm_factory.CrmFactory.__new__') as mock_factory:
            mock_factory.return_value = crm_factory_stub
            crm_mediator = CrmMediator()
            assert crm_mediator._crm_connection == fake_connection_manager


class TestCrmMediatorCreate(TestCase):
    def test_returns_true_if_id_returned(self):
        crm_mediator = CrmMediator()
        crm_mediator._crm_connection = Mock()
        crm_mediator._crm_connection.add_user_to_crm.return_value = 1
        assert crm_mediator.create_crm_user("fake@fake.com", "joe", "shmo") is True

    def test_stores_crm_id_if_true(self):
        with patch('sefaria.helper.crm.crm_info_store.CrmInfoStore.save_crm_id') as mock_save:
            crm_mediator = CrmMediator()
            crm_mediator._crm_connection = Mock()
            crm_mediator._crm_connection.add_user_to_crm.return_value = 1
            crm_mediator.create_crm_user("fake@fake.com", "joe", "shmo") is True
            assert mock_save.called is True

    def test_returns_false_if_id_not_returned(self):
        crm_mediator = CrmMediator()
        crm_mediator._crm_connection = Mock()
        crm_mediator._crm_connection.add_user_to_crm.return_value = False
        assert crm_mediator.create_crm_user("fake@fake.com", "joe", "shmoo") is not True


class Sustainer():
    def __init__(self, id):
        self.id = id


class TestSyncSustainers(TestCase):
    def __init__(self, *args, **kwargs):
        super(TestSyncSustainers, self).__init__(*args, **kwargs)
        self.current_sustainers = {
            1: "sustainer_1",
            2: "sustainer_2",
            5: "sustainer_5"
        }

        self.crm_sustainers = [
            Sustainer(1),
            Sustainer(3),
            Sustainer(4)
        ]

    def test_marks_sustainers_that_dont_exist(self):
        with patch('sefaria.helper.crm.crm_info_store.CrmInfoStore.mark_sustainer') as mock_mark, \
                patch('sefaria.helper.crm.crm_info_store.CrmInfoStore.get_current_sustainers') as mock_get_current, \
                patch('sefaria.helper.crm.crm_info_store.CrmInfoStore.find_sustainer_profile') as mock_find:
            crm_mediator = CrmMediator()
            crm_mediator._crm_connection = Mock()
            current_sustainers = copy.copy(self.crm_sustainers)
            crm_mediator._crm_connection.get_sustainers.return_value = current_sustainers
            mock_get_current.return_value = copy.copy(self.current_sustainers)
            mock_get_current.return_value = copy.copy(self.current_sustainers)
            mock_find.side_effect = lambda x: x
            crm_mediator.sync_sustainers()
            mock_mark.assert_any_call(current_sustainers[1])
            mock_mark.assert_any_call(current_sustainers[2])

    def test_removes_no_longer_sustainers(self):
        with patch('sefaria.helper.crm.crm_info_store.CrmInfoStore.mark_sustainer') as mock_mark, \
                patch('sefaria.helper.crm.crm_info_store.CrmInfoStore.get_current_sustainers') as mock_get_current, \
                patch('sefaria.helper.crm.crm_info_store.CrmInfoStore.find_sustainer_profile') as mock_find:
            crm_mediator = CrmMediator()
            crm_mediator._crm_connection = Mock()
            crm_mediator._crm_connection.get_sustainers.return_value = copy.copy(self.crm_sustainers)
            mock_get_current.return_value = copy.copy(self.current_sustainers)
            mock_find.side_effect = lambda x: x
            crm_mediator.sync_sustainers()
            mock_mark.assert_any_call(5, False)


class TestMarkAsSpam(TestCase):
    def test_gets_id_marks_spam(self):
        with patch('sefaria.helper.crm.crm_info_store.CrmInfoStore.get_crm_id') as mock_get_id:
            mock_get_id.return_value = 6
            crm_mediator = CrmMediator()
            crm_mediator._crm_connection = MagicMock()
            crm_mediator.mark_as_spam_in_crm(1, "hi@hi.com", "abc")
            mock_get_id.assert_called_with(1, "hi@hi.com", "abc")
            crm_mediator._crm_connection.mark_as_spam_in_crm.assert_called_with(6)


class TestMarkForReview(TestCase):
    def test_gets_id_marks_for_review(self):
        with patch('sefaria.helper.crm.crm_info_store.CrmInfoStore.get_crm_id') as mock_get_id:
            mock_get_id.return_value = 6
            crm_mediator = CrmMediator()
            crm_mediator._crm_connection = MagicMock()
            marked_for_review = crm_mediator.mark_for_review_in_crm(1, "hi@hi.com", "abc")
            mock_get_id.assert_called_with(1, "hi@hi.com", "abc")
            crm_mediator._crm_connection.mark_for_review_in_crm.assert_called_with(6)
            assert marked_for_review is True

    def test_returns_false_doesnt_call_mark_for_review_if_no_crm_id(self):
        with patch('sefaria.helper.crm.crm_info_store.CrmInfoStore.get_crm_id') as mock_get_id:
            mock_get_id.return_value = False
            crm_mediator = CrmMediator()
            crm_mediator._crm_connection = MagicMock()
            marked_for_review = crm_mediator.mark_for_review_in_crm(1, "hi@hi.com", "abc")
            mock_get_id.assert_called_with(1, "hi@hi.com", "abc")
            crm_mediator._crm_connection.mark_for_review_in_crm.assert_not_called()
            assert marked_for_review is False

    def test_returns_false_if_crm_mark_as_spam_returns_false(self):
        with patch('sefaria.helper.crm.crm_info_store.CrmInfoStore.get_crm_id') as mock_get_id:
            mock_get_id.return_value = 6
            crm_mediator = CrmMediator()
            crm_mediator._crm_connection = MagicMock()
            crm_mediator._crm_connection.mark_for_review_in_crm.return_value = False
            marked_for_review = crm_mediator.mark_for_review_in_crm(1, "hi@hi.com", "abc")
            mock_get_id.assert_called_with(1, "hi@hi.com", "abc")
            assert marked_for_review is False
