#!/usr/bin/env python
"""
ActiveCampaign API Exploration Script

Tests:
1. Look up skyler_cohen@outlook.com and show their subscriptions
2. Create a contact with random email to verify contact creation works
3. Verify what fields are actually required
"""

import os
import sys
import json
import time
import random
import django

# Set up Django environment
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'sefaria.settings')
django.setup()

from api.newsletter_service import (
    get_newsletter_list,
    find_or_create_contact,
    get_contact_list_memberships,
    fetch_user_subscriptions_impl,
    ActiveCampaignError
)


def print_section(title):
    """Print a formatted section header"""
    print()
    print("=" * 70)
    print(title)
    print("=" * 70)
    print()


def test_1_lookup_existing_user():
    """Test: Look up skyler_cohen@outlook.com subscriptions"""
    print_section("TEST 1: Look Up Existing User")

    email = "skyler_cohen@outlook.com"
    print(f"Looking up: {email}")
    print()

    try:
        # Get available newsletters first
        newsletters = get_newsletter_list()
        print(f"Available newsletters: {len(newsletters)}")
        print()

        # Fetch user's subscriptions
        result = fetch_user_subscriptions_impl(email, newsletters)

        print("✓ Lookup successful!")
        print()
        print(f"Email: {result.get('email', email)}")
        print(f"Subscribed to {len(result['subscribed_newsletters'])} newsletters:")
        print()

        if result['subscribed_newsletters']:
            for nl_stringid in result['subscribed_newsletters']:
                # Find the newsletter details
                nl = next((n for n in newsletters if n['stringid'] == nl_stringid), None)
                if nl:
                    print(f"  • {nl['displayName']} ({nl_stringid}) {nl['emoji']}")
                else:
                    print(f"  • {nl_stringid} (details not found)")
        else:
            print("  (No subscriptions found)")

        print()
        return True

    except Exception as e:
        print(f"✗ Error: {e}")
        import traceback
        traceback.print_exc()
        return False


def test_2_create_contact_minimal_fields():
    """Test: Create contact with minimal fields (just email)"""
    print_section("TEST 2: Create Contact with Minimal Fields")

    # Generate random email to ensure it doesn't exist
    random_id = int(time.time() * 1000) + random.randint(1000, 9999)
    test_email = f"test-minimal-{random_id}@example.com"

    print(f"Test email: {test_email}")
    print("Testing with ONLY email (no first/last name)")
    print()

    try:
        # Try creating with empty strings for names
        contact = find_or_create_contact(test_email, "", "")

        print("✓ Contact created successfully!")
        print()
        print(f"Contact ID: {contact.get('id')}")
        print(f"Email: {contact.get('email')}")
        print(f"First Name: '{contact.get('firstName', '(not set)')}'")
        print(f"Last Name: '{contact.get('lastName', '(not set)')}'")
        print()
        print("✓ VERIFIED: Only email is required for contact creation")
        print()

        return True

    except Exception as e:
        print(f"✗ Error: {e}")
        import traceback
        traceback.print_exc()
        return False


def test_3_create_contact_with_names():
    """Test: Create contact with full details"""
    print_section("TEST 3: Create Contact with Full Details")

    # Generate random email
    random_id = int(time.time() * 1000) + random.randint(1000, 9999)
    test_email = f"test-full-{random_id}@example.com"
    test_first = "Integration"
    test_last = "Test"

    print(f"Test email: {test_email}")
    print(f"First name: {test_first}")
    print(f"Last name: {test_last}")
    print()

    try:
        contact = find_or_create_contact(test_email, test_first, test_last)

        print("✓ Contact created successfully!")
        print()
        print(f"Contact ID: {contact.get('id')}")
        print(f"Email: {contact.get('email')}")
        print(f"First Name: {contact.get('firstName')}")
        print(f"Last Name: {contact.get('lastName')}")
        print()

        return True

    except Exception as e:
        print(f"✗ Error: {e}")
        import traceback
        traceback.print_exc()
        return False


def test_4_lookup_vs_create():
    """Test: Verify find_or_create returns existing contact"""
    print_section("TEST 4: Find vs Create Behavior")

    # Use the email from test 3 (should exist now)
    random_id = int(time.time() * 1000) + random.randint(1000, 9999)
    test_email = f"test-lookup-{random_id}@example.com"

    print(f"Step 1: Create new contact with: {test_email}")
    try:
        contact1 = find_or_create_contact(test_email, "First", "Last")
        contact_id_1 = contact1.get('id')
        print(f"  Created contact ID: {contact_id_1}")
        print()

        print(f"Step 2: Call find_or_create again with same email")
        contact2 = find_or_create_contact(test_email, "Different", "Name")
        contact_id_2 = contact2.get('id')
        print(f"  Returned contact ID: {contact_id_2}")
        print()

        if contact_id_1 == contact_id_2:
            print("✓ VERIFIED: Returns existing contact (doesn't create duplicate)")
            print()
            return True
        else:
            print("✗ ERROR: Created duplicate contact!")
            return False

    except Exception as e:
        print(f"✗ Error: {e}")
        import traceback
        traceback.print_exc()
        return False


def run_all_tests():
    """Run all exploration tests"""
    print_section("ACTIVECAMPAIGN API EXPLORATION")
    print("Testing real API behavior")
    print()

    results = {}

    # Test 1: Look up real user
    results['lookup_existing_user'] = test_1_lookup_existing_user()

    # Test 2: Create with minimal fields
    results['create_minimal'] = test_2_create_contact_minimal_fields()

    # Test 3: Create with full details
    results['create_full'] = test_3_create_contact_with_names()

    # Test 4: Verify find vs create
    results['find_vs_create'] = test_4_lookup_vs_create()

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
        print("🎉 ALL TESTS PASSED!")
        print()
        print("Key Findings:")
        print("  • Only email is required for contact creation")
        print("  • first_name and last_name are optional")
        print("  • find_or_create_contact() correctly returns existing contacts")
        return True
    else:
        print("❌ SOME TESTS FAILED")
        return False


if __name__ == '__main__':
    success = run_all_tests()
    sys.exit(0 if success else 1)
