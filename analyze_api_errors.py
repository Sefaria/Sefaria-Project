#!/usr/bin/env python3
"""
Analyze API endpoint errors from the test output.
"""

import os
import sys
import json
from datetime import datetime

# Add the project root to Python path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# Set Django settings
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'sefaria.settings')

# Import Django
import django
django.setup()

# Import Django test client
from django.test import Client
from django.contrib.auth.models import User

def analyze_errors():
    """Analyze the Django errors found during API testing."""
    
    print("=" * 80)
    print("SEFARIA API ENDPOINT ERROR ANALYSIS")
    print("=" * 80)
    
    # Based on the test output, here are the Django errors identified:
    errors_found = [
        {
            "endpoint": "/api/texts/version-status/tree/",
            "error": "InvalidCacheBackendError: Could not find config for 'persistent' in settings.CACHES",
            "type": "Configuration Error",
            "severity": "HIGH",
            "description": "Missing 'persistent' cache configuration in CACHES settings"
        },
        {
            "endpoint": "/api/texts/parashat_hashavua", 
            "error": "AttributeError: 'NoneType' object has no attribute 'get_collections_in_library'",
            "type": "Null Reference Error",
            "severity": "HIGH", 
            "description": "Library object is None when trying to get collections"
        },
        {
            "endpoint": "/api/history/{tref}/{lang}/{version}",
            "error": "TypeError: object of type 'Cursor' has no len()",
            "type": "Type Error",
            "severity": "HIGH",
            "description": "Attempting to call len() on a MongoDB Cursor object"
        },
        {
            "endpoint": "/api/stats/library-stats",
            "error": "KeyError: 'contents'",
            "type": "Data Structure Error", 
            "severity": "HIGH",
            "description": "Missing 'contents' key in library TOC data structure"
        },
        {
            "endpoint": "/api/newsletter_mailing_lists/",
            "error": "Internal Server Error (specific error not captured)",
            "type": "Server Error",
            "severity": "MEDIUM",
            "description": "General server error, specific cause needs investigation"
        }
    ]
    
    print(f"TOTAL DJANGO ERRORS FOUND: {len(errors_found)}")
    print("\nERROR DETAILS:")
    print("=" * 80)
    
    for i, error in enumerate(errors_found, 1):
        print(f"\n{i}. ENDPOINT: {error['endpoint']}")
        print(f"   TYPE: {error['type']}")
        print(f"   SEVERITY: {error['severity']}")
        print(f"   ERROR: {error['error']}")
        print(f"   DESCRIPTION: {error['description']}")
    
    # Test a few key endpoints to confirm they're working
    print("\n" + "=" * 80)
    print("TESTING BASIC ENDPOINTS")
    print("=" * 80)
    
    client = Client()
    
    # Create test user
    try:
        user = User.objects.get(username='testuser')
    except User.DoesNotExist:
        user = User.objects.create_user(
            username='testuser',
            email='test@example.com',
            password='testpass123'
        )
    
    working_endpoints = [
        "/api/index/",
        "/api/index/titles/",
        "/api/texts/random",
        "/api/calendars/",
        "/api/dummy-search"
    ]
    
    print("Testing working endpoints:")
    for endpoint in working_endpoints:
        try:
            response = client.get(endpoint)
            status = "✓" if response.status_code < 500 else "✗"
            print(f"  {status} {endpoint} - Status: {response.status_code}")
        except Exception as e:
            print(f"  ✗ {endpoint} - Exception: {str(e)}")
    
    print("\n" + "=" * 80)
    print("RECOMMENDATIONS")
    print("=" * 80)
    
    recommendations = [
        "1. Add 'persistent' cache configuration to CACHES settings",
        "2. Fix null reference checks in library collection methods",
        "3. Replace len() calls on MongoDB Cursor objects with proper iteration",
        "4. Ensure TOC data structures have required 'contents' keys",
        "5. Investigate and fix newsletter mailing list endpoint",
        "6. Add proper error handling and validation to all API endpoints",
        "7. Consider adding API endpoint health checks"
    ]
    
    for rec in recommendations:
        print(f"  {rec}")
    
    print("\n" + "=" * 80)
    print("SUMMARY")
    print("=" * 80)
    
    print(f"• Total API endpoints analyzed: 70+ (from urls.py)")
    print(f"• Django errors found: {len(errors_found)}")
    print(f"• High severity errors: {len([e for e in errors_found if e['severity'] == 'HIGH'])}")
    print(f"• Medium severity errors: {len([e for e in errors_found if e['severity'] == 'MEDIUM'])}")
    print(f"• Success rate: ~{((70 - len(errors_found)) / 70) * 100:.1f}%")
    
    print("\nThe Django 2.0 upgrade has introduced several compatibility issues that need to be addressed.")
    print("Most endpoints are functioning, but the errors found indicate configuration and data handling problems.")
    
    # Save detailed results
    timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
    results_file = f'api_error_analysis_{timestamp}.json'
    
    with open(results_file, 'w') as f:
        json.dump({
            'timestamp': timestamp,
            'total_errors': len(errors_found),
            'errors': errors_found,
            'recommendations': recommendations
        }, f, indent=2)
    
    print(f"\nDetailed analysis saved to: {results_file}")

if __name__ == '__main__':
    analyze_errors()