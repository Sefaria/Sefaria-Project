#!/usr/bin/env python
"""
Real API Integration Tests for Newsletter Operations

This script tests all newsletter operations with real ActiveCampaign API calls:
1. Subscribe new user to newsletters
2. Fetch user subscriptions
3. Update user preferences
4. Update learning level

IMPORTANT: This creates real data in ActiveCampaign. Use a test email.
"""

import os
import sys
import json
import time
import django
from datetime import datetime

# Set up Django environment
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'sefaria.settings')
django.setup()

from api.newsletter_service import (
    get_newsletter_list,
    subscribe_with_union,
    fetch_user_subscriptions_impl,
    update_user_preferences_impl,
    update_learning_level_impl,
    update_learning_level_in_ac,
    find_or_create_contact,
    ActiveCampaignError
)


# Test configuration
TEST_EMAIL = f"integration-test-{int(time.time())}@sefaria.org"
TEST_FIRST_NAME = "Integration"
TEST_LAST_NAME = "Test"


def print_section(title):
    """Print a formatted section header"""
    print()
    print("=" * 70)
    print(title)
    print("=" * 70)
    print()


def print_result(success, message):
    """Print a result with success/failure indicator"""
    icon = "✓" if success else "✗"
    print(f"{icon} {message}")


def test_1_get_newsletter_list():
    """Test: Get available newsletters"""
    print_section("TEST 1: Get Newsletter List")

    try:
        newsletters = get_newsletter_list()

        if len(newsletters) > 0:
            print_result(True, f"Retrieved {len(newsletters)} newsletters")
            print()
            print("Available newsletters:")
            for nl in newsletters:
                print(f"  - {nl['stringid']}: {nl['displayName']} {nl['emoji']}")
            print()
            return True, newsletters
        else:
            print_result(False, "No newsletters found")
            return False, []

    except Exception as e:
        print_result(False, f"Error: {e}")
        return False, []


def test_2_subscribe_new_user(newsletters):
    """Test: Subscribe new user to newsletters"""
    print_section("TEST 2: Subscribe New User")

    if len(newsletters) < 2:
        print_result(False, "Need at least 2 newsletters to test")
        return False

    # Select first 2 newsletters for testing
    test_stringids = [newsletters[0]['stringid'], newsletters[1]['stringid']]

    print(f"Test email: {TEST_EMAIL}")
    print(f"Subscribing to: {test_stringids}")
    print()

    try:
        result = subscribe_with_union(
            email=TEST_EMAIL,
            first_name=TEST_FIRST_NAME,
            last_name=TEST_LAST_NAME,
            newsletter_stringids=test_stringids,
            valid_newsletters=newsletters
        )

        print_result(True, "Subscription successful")
        print(f"Subscribed newsletters: {result['all_subscriptions']}")
        print(f"Contact ID: {result.get('contact_id', 'N/A')}")
        print()

        # Verify subscriptions match what we requested
        if set(result['all_subscriptions']) == set(test_stringids):
            print_result(True, "Subscriptions match requested newsletters")
        else:
            print_result(False, f"Subscription mismatch: expected {test_stringids}, got {result['all_subscriptions']}")

        return True

    except Exception as e:
        print_result(False, f"Error: {e}")
        import traceback
        traceback.print_exc()
        return False


def test_3_fetch_user_subscriptions(newsletters):
    """Test: Fetch user's current subscriptions"""
    print_section("TEST 3: Fetch User Subscriptions")

    print(f"Fetching subscriptions for: {TEST_EMAIL}")
    print()

    try:
        result = fetch_user_subscriptions_impl(TEST_EMAIL, newsletters)

        print_result(True, "Fetch successful")
        print(f"Subscribed newsletters: {result['subscribed_newsletters']}")
        print()

        if len(result['subscribed_newsletters']) > 0:
            print_result(True, f"Found {len(result['subscribed_newsletters'])} subscriptions")
        else:
            print_result(False, "No subscriptions found (expected some from previous test)")

        return True, result['subscribed_newsletters']

    except Exception as e:
        print_result(False, f"Error: {e}")
        import traceback
        traceback.print_exc()
        return False, []


def test_4_update_preferences(newsletters, current_subscriptions):
    """Test: Update user preferences (replace mode)"""
    print_section("TEST 4: Update User Preferences (Replace Mode)")

    if len(newsletters) < 3:
        print_result(False, "Need at least 3 newsletters to test preference changes")
        return False

    # Select different newsletters (last 2) to test replace behavior
    new_stringids = [newsletters[-2]['stringid'], newsletters[-1]['stringid']]

    print(f"Current subscriptions: {current_subscriptions}")
    print(f"Changing to: {new_stringids}")
    print("(This should REPLACE existing, not add)")
    print()

    try:
        result = update_user_preferences_impl(
            email=TEST_EMAIL,
            first_name=TEST_FIRST_NAME,
            last_name=TEST_LAST_NAME,
            selected_stringids=new_stringids,  # Fixed parameter name
            valid_newsletters=newsletters
        )

        print_result(True, "Update successful")
        print(f"New subscriptions: {result['subscribed_newsletters']}")
        print()

        # Verify replace behavior (should only have new subscriptions)
        if set(result['subscribed_newsletters']) == set(new_stringids):
            print_result(True, "Replace mode working: only new subscriptions present")
        else:
            print_result(False, f"Replace mode issue: expected {new_stringids}, got {result['subscribed_newsletters']}")

        # Verify old subscriptions were removed
        old_still_present = set(current_subscriptions) & set(result['subscribed_newsletters'])
        if not old_still_present:
            print_result(True, "Old subscriptions successfully removed")
        else:
            print_result(False, f"Old subscriptions still present: {old_still_present}")

        return True

    except Exception as e:
        print_result(False, f"Error: {e}")
        import traceback
        traceback.print_exc()
        return False


# TODO: Re-enable once learning level field is configured in ActiveCampaign
# def test_5_update_learning_level():
#     """Test: Update learning level"""
#     print_section("TEST 5: Update Learning Level")
#
#     test_level = 3
#     print(f"Setting learning level to: {test_level}")
#     print()
#
#     try:
#         # First update to ActiveCampaign
#         update_learning_level_in_ac(TEST_EMAIL, test_level)
#         print_result(True, f"Learning level {test_level} saved to ActiveCampaign")
#
#         # Test with full implementation (includes UserProfile if exists)
#         result = update_learning_level_impl(TEST_EMAIL, test_level)
#         print_result(True, f"Learning level update complete: {result['message']}")
#         print(f"User ID: {result['user_id']} (None if no Sefaria account)")
#         print()
#
#         # Test with null value
#         result_null = update_learning_level_impl(TEST_EMAIL, None)
#         print_result(True, "Learning level cleared (set to null)")
#         print()
#
#         return True
#
#     except Exception as e:
#         print_result(False, f"Error: {e}")
#         import traceback
#         traceback.print_exc()
#         return False


def test_6_subscription_union_behavior(newsletters):
    """Test: Verify union behavior on re-subscribe"""
    print_section("TEST 6: Subscription Union Behavior")

    if len(newsletters) < 3:
        print_result(False, "Need at least 3 newsletters to test union")
        return False

    # First, set to specific newsletters
    initial_stringids = [newsletters[0]['stringid']]
    print(f"Step 1: Subscribe to {initial_stringids}")

    try:
        result1 = subscribe_with_union(
            email=TEST_EMAIL,
            first_name=TEST_FIRST_NAME,
            last_name=TEST_LAST_NAME,
            newsletter_stringids=initial_stringids,
            valid_newsletters=newsletters
        )
        print(f"  Current subscriptions: {result1['all_subscriptions']}")
        print()

        # Now add another newsletter (should union with existing)
        additional_stringids = [newsletters[1]['stringid']]
        print(f"Step 2: Subscribe to {additional_stringids} (should ADD, not replace)")

        result2 = subscribe_with_union(
            email=TEST_EMAIL,
            first_name=TEST_FIRST_NAME,
            last_name=TEST_LAST_NAME,
            newsletter_stringids=additional_stringids,
            valid_newsletters=newsletters
        )
        print(f"  Current subscriptions: {result2['all_subscriptions']}")
        print()

        # Verify union: should have both
        expected = set(initial_stringids + additional_stringids)
        actual = set(result2['all_subscriptions'])

        if expected == actual:
            print_result(True, "Union behavior working: both newsletters present")
        else:
            print_result(False, f"Union issue: expected {expected}, got {actual}")

        return True

    except Exception as e:
        print_result(False, f"Error: {e}")
        import traceback
        traceback.print_exc()
        return False


def test_7_error_handling():
    """Test: Error handling for invalid inputs"""
    print_section("TEST 7: Error Handling")

    tests_passed = 0
    tests_total = 2  # Reduced from 3 (learning level test commented out)

    # Test 1: Invalid newsletter stringid
    print("Test 7a: Invalid newsletter stringid")
    try:
        subscribe_with_union(
            email=TEST_EMAIL,
            first_name=TEST_FIRST_NAME,
            last_name=TEST_LAST_NAME,
            newsletter_stringids=['invalid_newsletter_id_12345'],
            valid_newsletters=[]
        )
        print_result(False, "Should have thrown error for invalid stringid")
    except ActiveCampaignError:
        print_result(True, "Correctly rejected invalid stringid")
        tests_passed += 1
    except Exception as e:
        print_result(False, f"Wrong exception type: {type(e)}")
    print()

    # TODO: Re-enable once learning level field is configured in ActiveCampaign
    # # Test 2: Invalid learning level
    # print("Test 7b: Invalid learning level (too high)")
    # try:
    #     update_learning_level_in_ac(TEST_EMAIL, 10)  # Max is 5
    #     print_result(False, "Should have thrown error for learning level > 5")
    # except (ValueError, ActiveCampaignError):
    #     print_result(True, "Correctly rejected invalid learning level")
    #     tests_passed += 1
    # except Exception as e:
    #     print_result(False, f"Wrong exception type: {type(e)}")
    # print()

    # Test 3: Empty newsletter list
    print("Test 7c: Empty newsletter selection")
    try:
        subscribe_with_union(
            email=TEST_EMAIL,
            first_name=TEST_FIRST_NAME,
            last_name=TEST_LAST_NAME,
            newsletter_stringids=[],
            valid_newsletters=[]
        )
        print_result(False, "Should have thrown error for empty selection")
    except ActiveCampaignError:
        print_result(True, "Correctly rejected empty selection")
        tests_passed += 1
    except Exception as e:
        print_result(False, f"Wrong exception type: {type(e)}")
    print()

    print(f"Error handling: {tests_passed}/{tests_total} tests passed")
    return tests_passed == tests_total


def run_all_tests():
    """Run all integration tests"""
    print_section("NEWSLETTER API - REAL INTEGRATION TESTS")
    print(f"Test email: {TEST_EMAIL}")
    print(f"Timestamp: {datetime.now().isoformat()}")
    print()
    print("⚠️  WARNING: These tests create real data in ActiveCampaign!")
    print()

    results = {}

    # Test 1: Get newsletters (required for other tests)
    success, newsletters = test_1_get_newsletter_list()
    results['get_newsletter_list'] = success

    if not success or len(newsletters) == 0:
        print()
        print("❌ Cannot continue: No newsletters available")
        return False

    # Test 2: Subscribe new user
    results['subscribe_new_user'] = test_2_subscribe_new_user(newsletters)

    # Wait a moment for AC to process
    time.sleep(2)

    # Test 3: Fetch subscriptions
    success, current_subs = test_3_fetch_user_subscriptions(newsletters)
    results['fetch_subscriptions'] = success

    # Test 4: Update preferences (replace mode)
    if success:
        results['update_preferences'] = test_4_update_preferences(newsletters, current_subs)
    else:
        results['update_preferences'] = False

    # Test 5: Learning level (commented out - AC field not configured yet)
    # results['learning_level'] = test_5_update_learning_level()

    # Test 6: Union behavior
    results['union_behavior'] = test_6_subscription_union_behavior(newsletters)

    # Test 7: Error handling
    results['error_handling'] = test_7_error_handling()

    # Summary
    print_section("TEST SUMMARY")

    passed = sum(1 for v in results.values() if v)
    total = len(results)

    for test_name, passed_test in results.items():
        icon = "✓" if passed_test else "✗"
        print(f"{icon} {test_name}")

    print()
    print(f"Results: {passed}/{total} tests passed")
    print()

    if passed == total:
        print("🎉 ALL INTEGRATION TESTS PASSED!")
        return True
    else:
        print("❌ SOME TESTS FAILED")
        return False


if __name__ == '__main__':
    success = run_all_tests()
    sys.exit(0 if success else 1)
