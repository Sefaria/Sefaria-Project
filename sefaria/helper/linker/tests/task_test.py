"""
Tests for sefaria.helper.linker.tasks
"""
import pytest
from sefaria.helper.linker.tasks import _get_link_trefs_to_add_and_delete


@pytest.mark.parametrize("trefs_found,prev_trefs_found,all_linked_trefs,expected_add,expected_delete,test_id", [
    # Empty sets
    (set(), set(), set(), set(), set(), "all_empty"),
    
    # Adding new refs
    ({"Genesis 1:1", "Exodus 2:3"}, set(), set(), 
     {"Genesis 1:1", "Exodus 2:3"}, set(), "add_new_refs"),
    
    # No additions when already linked
    ({"Genesis 1:1", "Exodus 2:3"}, set(), {"Genesis 1:1", "Exodus 2:3"}, 
     set(), set(), "already_linked"),
    
    # Partial additions
    ({"Genesis 1:1", "Exodus 2:3", "Leviticus 3:4"}, set(), {"Genesis 1:1"}, 
     {"Exodus 2:3", "Leviticus 3:4"}, set(), "partial_add"),
    
    # Deleting prev refs
    (set(), {"Genesis 1:1", "Exodus 2:3"}, set(), 
     set(), {"Genesis 1:1", "Exodus 2:3"}, "delete_prev_refs"),
    
    # No deletions when prev refs still linked
    (set(), {"Genesis 1:1", "Exodus 2:3"}, {"Genesis 1:1", "Exodus 2:3", "Leviticus 3:4"}, 
     set(), set(), "prev_refs_preserved"),
    
    # Partial deletions
    (set(), {"Genesis 1:1", "Exodus 2:3", "Leviticus 3:4"}, {"Genesis 1:1"}, 
     set(), {"Exodus 2:3", "Leviticus 3:4"}, "partial_delete"),
    
    # Add and delete simultaneously
    ({"Genesis 1:1", "Exodus 2:3"}, {"Leviticus 3:4", "Numbers 4:5"}, set(), 
     {"Genesis 1:1", "Exodus 2:3"}, {"Leviticus 3:4", "Numbers 4:5"}, "add_and_delete"),
    ({"Genesis 1:1"}, {"Exodus 2:3"}, set(), 
     {"Genesis 1:1"}, {"Exodus 2:3"}, "single_ref_swap"),
    
    # Complex scenarios
    ({"Genesis 1:1", "Exodus 2:3", "Leviticus 3:4"}, 
     {"Leviticus 3:4", "Numbers 4:5", "Deuteronomy 5:6"}, 
     {"Leviticus 3:4", "Genesis 1:1"}, 
     {"Exodus 2:3"}, {"Numbers 4:5", "Deuteronomy 5:6"}, "complex_overlapping"),
    
    ({"Genesis 1:1", "Exodus 2:3"}, {"Leviticus 3:4", "Numbers 4:5"}, 
     {"Genesis 1:1", "Exodus 2:3", "Leviticus 3:4", "Numbers 4:5"}, 
     set(), set(), "all_preserved"),
    
    ({"Genesis 1:1", "Exodus 2:3"}, {"Genesis 1:1", "Leviticus 3:4"}, {"Genesis 1:1"}, 
     {"Exodus 2:3"}, {"Leviticus 3:4"}, "same_ref_in_both"),
])
def test_link_trefs_operations(trefs_found, prev_trefs_found, all_linked_trefs, 
                               expected_add, expected_delete, test_id):
    """Test various scenarios for adding and deleting link trefs"""
    to_add, to_delete = _get_link_trefs_to_add_and_delete(trefs_found, prev_trefs_found, all_linked_trefs)
    
    assert to_add == expected_add, f"Failed for test: {test_id}"
    assert to_delete == expected_delete, f"Failed for test: {test_id}"
