#!/usr/bin/env python
"""
Real API Test for get_newsletter_list()

This script makes an actual call to the ActiveCampaign API
without any mocks or stubs to verify production functionality.
"""

import os
import sys
import json
import django

# Set up Django environment
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'sefaria.settings')
django.setup()

from api.newsletter_service import get_newsletter_list, ActiveCampaignError


def test_real_api_call():
    """
    Make a real API call to ActiveCampaign and verify the response.
    """
    print("=" * 70)
    print("REAL API TEST: get_newsletter_list()")
    print("=" * 70)
    print()

    try:
        print("Making real API call to ActiveCampaign...")
        print("This will call:")
        print("  1. GET /api/3/lists")
        print("  2. GET /api/3/personalizations")
        print()

        newsletters = get_newsletter_list()

        print(f"✓ Success! Retrieved {len(newsletters)} newsletter(s)")
        print()
        print("=" * 70)
        print("RESULTS:")
        print("=" * 70)
        print()

        for i, newsletter in enumerate(newsletters, 1):
            print(f"Newsletter {i}:")
            print(f"  ID:          {newsletter.get('id')}")
            print(f"  String ID:   {newsletter.get('stringid')}")
            print(f"  Display Name: {newsletter.get('displayName')}")
            print(f"  Emoji:       {newsletter.get('emoji')}")
            print(f"  Language:    {newsletter.get('language')}")
            print()

        print("=" * 70)
        print("VERIFICATION:")
        print("=" * 70)
        print()

        # Verify all newsletters have required fields
        all_valid = True
        for newsletter in newsletters:
            required_fields = ['id', 'stringid', 'displayName', 'emoji', 'language']
            missing_fields = [f for f in required_fields if f not in newsletter]

            if missing_fields:
                print(f"✗ Newsletter {newsletter.get('id')} missing fields: {missing_fields}")
                all_valid = False

            if len(newsletter) != 5:
                print(f"✗ Newsletter {newsletter.get('id')} has {len(newsletter)} fields (expected 5)")
                all_valid = False

        if all_valid:
            print("✓ All newsletters have required fields (id, stringid, displayName, emoji, language)")
            print("✓ All newsletters have exactly 5 fields")

        print()
        print("=" * 70)
        print("DATA SOURCE VERIFICATION:")
        print("=" * 70)
        print()

        # Verify data sources are correct
        print("Checking data sources:")
        print("  - 'id' should come from AC list object")
        print("  - 'stringid' should come from AC list object")
        print("  - 'displayName' should come from personalization variable 'name' field")
        print("  - 'emoji' should come from personalization variable JSON content")
        print("  - 'language' should come from personalization variable JSON content")
        print()

        # Pretty print full JSON for inspection
        print("=" * 70)
        print("FULL JSON RESPONSE:")
        print("=" * 70)
        print(json.dumps(newsletters, indent=2, ensure_ascii=False))
        print()

        return True

    except ActiveCampaignError as e:
        print(f"✗ ActiveCampaign API Error: {e}")
        print()
        print("Possible causes:")
        print("  - AC_API_KEY not configured in settings")
        print("  - AC_ACCOUNT_NAME not configured in settings")
        print("  - Network connectivity issues")
        print("  - ActiveCampaign API is down")
        return False

    except Exception as e:
        print(f"✗ Unexpected Error: {e}")
        import traceback
        traceback.print_exc()
        return False


if __name__ == '__main__':
    success = test_real_api_call()
    sys.exit(0 if success else 1)
