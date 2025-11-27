"""
Simple test script to verify the UserHistory validation system works.
Run with: python sefaria/helper/user_history/test_validation.py
"""
import django
import os
import sys

# Setup Django
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "sefaria.settings")
django.setup()

from sefaria.helper.user_history.tasks import validate_user_history_refs, get_validation_status
from sefaria.system.database import db
from sefaria.model.text import Ref
from sefaria.system.exceptions import InputError

def test_imports():
    """Test that all imports work"""
    print("✓ All imports successful")

def test_ref_validation():
    """Test that we can detect invalid refs"""
    print("\nTesting ref validation...")
    
    # Valid ref
    try:
        Ref("Genesis 1:1")
        print("✓ Valid ref 'Genesis 1:1' accepted")
    except:
        print("✗ Valid ref rejected (unexpected)")
        return False
    
    # Invalid ref
    try:
        Ref("InvalidBook 999:999")
        print("✗ Invalid ref accepted (unexpected)")
        return False
    except InputError as e:
        print(f"✓ Invalid ref rejected with InputError: {e}")
    
    return True

def test_database_collections():
    """Test that we can access the necessary MongoDB collections"""
    print("\nTesting database access...")
    
    try:
        # Test user_history collection
        count = db.user_history.count_documents({})
        print(f"✓ user_history collection accessible ({count:,} total records)")
        
        # Test that we can query for records with refs
        count_with_ref = db.user_history.count_documents({"ref": {"$exists": True}, "is_sheet": {"$ne": True}})
        print(f"✓ Found {count_with_ref:,} UserHistory records with text refs")
        
        # Test progress collection
        progress_count = db.user_history_validation_progress.count_documents({})
        print(f"✓ Progress tracking collection accessible ({progress_count} jobs)")
        
        # Test error collection
        error_count = db.user_history_validation_errors.count_documents({})
        print(f"✓ Error logging collection accessible ({error_count} errors)")
        
        return True
    except Exception as e:
        print(f"✗ Database access failed: {e}")
        return False

def test_validation_function():
    """Test the main validation function"""
    print("\nTesting validation function...")
    
    try:
        # Test synchronous mode with very small limit (won't use Celery)
        print("Running synchronous validation on 10 records...")
        result = validate_user_history_refs(method='sync', limit=10)
        
        if 'valid' in result or 'invalid_deleted' in result:
            print(f"✓ Validation completed: {result}")
            return True
        else:
            print(f"✗ Unexpected result format: {result}")
            return False
    except Exception as e:
        print(f"✗ Validation function failed: {e}")
        import traceback
        traceback.print_exc()
        return False

def main():
    print("=" * 60)
    print("UserHistory Validation System - Test Suite")
    print("=" * 60)
    
    test_imports()
    
    if not test_ref_validation():
        print("\n❌ Ref validation test failed")
        sys.exit(1)
    
    if not test_database_collections():
        print("\n❌ Database access test failed")
        sys.exit(1)
    
    if not test_validation_function():
        print("\n❌ Validation function test failed")
        sys.exit(1)
    
    print("\n" + "=" * 60)
    print("✅ All tests passed!")
    print("=" * 60)
    print("\nThe validation system is ready to use.")
    print("\nNext steps:")
    print("1. Test on a small dataset via API:")
    print("   POST /api/user-history/validate-refs with limit=1000")
    print("2. Monitor progress via:")
    print("   GET /api/user-history/validation-status/<job_id>")
    print("3. Check results in MongoDB collections")
    print("\nSee README.md for full documentation.")

if __name__ == "__main__":
    main()

