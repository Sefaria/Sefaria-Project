#!/usr/bin/env python3
"""
Comprehensive API endpoint testing script for Sefaria Django application.
Tests all /api/ endpoints to ensure no Django errors are thrown.
"""

import os
import sys
import json
import requests
from urllib.parse import urljoin
from datetime import datetime
import time
from dataclasses import dataclass
from typing import List, Dict, Any, Optional

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
from django.urls import reverse

@dataclass
class APIEndpointTest:
    """Represents a test for an API endpoint."""
    url: str
    method: str
    description: str
    params: Optional[Dict[str, Any]] = None
    data: Optional[Dict[str, Any]] = None
    requires_auth: bool = False
    expected_status: int = 200

@dataclass
class TestResult:
    """Represents the result of an API endpoint test."""
    endpoint: str
    method: str
    status_code: int
    success: bool
    error: Optional[str] = None
    response_time: float = 0.0
    django_error: bool = False

class APIEndpointTester:
    """Tests all API endpoints systematically."""
    
    def __init__(self, base_url: str = "http://127.0.0.1:8000"):
        self.base_url = base_url
        self.client = Client()
        self.session = requests.Session()
        self.results: List[TestResult] = []
        
        # Create test user for authenticated endpoints
        self.test_user = self.create_test_user()
        
        # Sample data for testing
        self.sample_data = {
            'tref': 'Genesis.1.1',
            'title': 'Genesis',
            'lang': 'en',
            'version': 'The Contemporary Torah, Jewish Publication Society, 2006',
            'sheet_id': '1',
            'user_id': '1',
            'topic': 'creation',
            'word': 'hello',
            'email': 'test@example.com',
            'name': 'Test User',
            'uid': '1',
            'slug': 'test-collection',
            'parasha': 'Bereishit',
            'book': 'Genesis',
            'cat': 'Tanakh',
            'domain': 'example.com',
            'refs': 'Genesis.1.1,Genesis.1.2'
        }
    
    def create_test_user(self) -> User:
        """Create a test user for authenticated endpoints."""
        try:
            user = User.objects.get(username='testuser')
        except User.DoesNotExist:
            user = User.objects.create_user(
                username='testuser',
                email='test@example.com',
                password='testpass123'
            )
        return user
    
    def get_test_endpoints(self) -> List[APIEndpointTest]:
        """Define all API endpoints to test."""
        return [
            # Text and Index API
            APIEndpointTest('/api/texts/versions/{tref}', 'GET', 'Get text versions'),
            APIEndpointTest('/api/texts/version-status/tree/', 'GET', 'Get version status tree'),
            APIEndpointTest('/api/texts/version-status/', 'GET', 'Get version status'),
            APIEndpointTest('/api/texts/parashat_hashavua', 'GET', 'Get current Torah portion'),
            APIEndpointTest('/api/texts/translations/', 'GET', 'Get translations'),
            APIEndpointTest('/api/texts/translations/{lang}', 'GET', 'Get translations by language'),
            APIEndpointTest('/api/texts/random', 'GET', 'Get random text'),
            APIEndpointTest('/api/texts/random-by-topic/', 'GET', 'Get random text by topic'),
            APIEndpointTest('/api/texts/{tref}', 'GET', 'Get text content'),
            APIEndpointTest('/api/v3/texts/{tref}', 'GET', 'Get text content (v3)'),
            APIEndpointTest('/api/versions/', 'GET', 'Get version information'),
            APIEndpointTest('/api/index/', 'GET', 'Get table of contents'),
            APIEndpointTest('/api/opensearch-suggestions/', 'GET', 'Get OpenSearch suggestions'),
            APIEndpointTest('/api/index/titles/', 'GET', 'Get text titles'),
            APIEndpointTest('/api/v2/raw/index/{title}', 'GET', 'Get raw index data'),
            APIEndpointTest('/api/v2/index/{title}', 'GET', 'Get index data (v2)'),
            APIEndpointTest('/api/index/{title}', 'GET', 'Get index data'),

            # Links and References API
            APIEndpointTest('/api/links/bare/{book}/{cat}', 'GET', 'Get bare link data'),
            APIEndpointTest('/api/links/{tref}', 'GET', 'Get links for reference'),
            APIEndpointTest('/api/link-summary/{tref}', 'GET', 'Get link summary'),
            APIEndpointTest('/api/related/{tref}', 'GET', 'Get related content'),

            # Notes API
            APIEndpointTest('/api/notes/all', 'GET', 'Get all notes', requires_auth=True),
            APIEndpointTest('/api/notes/{tref}', 'GET', 'Get notes for reference'),

            # Counts and Statistics API
            APIEndpointTest('/api/counts/links/{cat}/{cat}', 'GET', 'Get link counts'),
            APIEndpointTest('/api/counts/words/{title}/{version}/{lang}', 'GET', 'Get word counts'),
            APIEndpointTest('/api/counts/{title}', 'GET', 'Get text counts'),
            APIEndpointTest('/api/shape/{title}', 'GET', 'Get text shape'),
            APIEndpointTest('/api/preview/{title}', 'GET', 'Get text preview'),

            # Terms and Dictionary API
            APIEndpointTest('/api/terms/{name}', 'GET', 'Get term definition'),
            APIEndpointTest('/api/words/completion/{word}', 'GET', 'Get word completion'),
            APIEndpointTest('/api/words/{word}', 'GET', 'Get word definition'),

            # Calendar API
            APIEndpointTest('/api/calendars/next-read/{parasha}', 'GET', 'Get next Torah reading'),
            APIEndpointTest('/api/calendars/', 'GET', 'Get calendar information'),

            # Category and Name API
            APIEndpointTest('/api/name/{name}', 'GET', 'Get name information'),
            APIEndpointTest('/api/category/', 'GET', 'Get category information'),
            APIEndpointTest('/api/tag-category/', 'GET', 'Get tag category information'),

            # Notifications and Updates API
            APIEndpointTest('/api/notifications/', 'GET', 'Get notifications', requires_auth=True),
            APIEndpointTest('/api/updates/', 'GET', 'Get updates'),

            # User and Profile API
            APIEndpointTest('/api/profile/user_history', 'GET', 'Get user history', requires_auth=True),
            APIEndpointTest('/api/profile', 'GET', 'Get user profile', requires_auth=True),
            APIEndpointTest('/api/user_history/saved', 'GET', 'Get saved history', requires_auth=True),
            APIEndpointTest('/api/user_stats/{uid}', 'GET', 'Get user stats'),
            APIEndpointTest('/api/site_stats/', 'GET', 'Get site stats'),

            # Source Sheets API
            APIEndpointTest('/api/sheets/', 'GET', 'Get sheets'),
            APIEndpointTest('/api/sheets/{sheet_id}', 'GET', 'Get sheet'),
            APIEndpointTest('/api/sheets/{sheet_id}/likers', 'GET', 'Get sheet likers'),
            APIEndpointTest('/api/sheets/{sheet_id}/visualize', 'GET', 'Get sheet visualization'),
            APIEndpointTest('/api/sheets/user/{user_id}', 'GET', 'Get user sheets'),
            APIEndpointTest('/api/sheets/tag/', 'GET', 'Get sheets by tag'),
            APIEndpointTest('/api/v2/sheets/tag/', 'GET', 'Get sheets by tag (v2)'),
            APIEndpointTest('/api/sheets/trending-tags/', 'GET', 'Get trending tags'),
            APIEndpointTest('/api/sheets/tag-list/', 'GET', 'Get tag list'),
            APIEndpointTest('/api/sheets/ref/{tref}', 'GET', 'Get sheets by reference'),
            APIEndpointTest('/api/sheets/all-sheets/10/0', 'GET', 'Get all sheets (paginated)'),
            APIEndpointTest('/api/sheets/next-untagged/', 'GET', 'Get next untagged sheet'),
            APIEndpointTest('/api/sheets/next-uncategorized/', 'GET', 'Get next uncategorized sheet'),

            # Collections API
            APIEndpointTest('/api/collections/user-collections/{user_id}', 'GET', 'Get user collections'),
            APIEndpointTest('/api/collections/for-sheet/{sheet_id}', 'GET', 'Get collections for sheet'),
            APIEndpointTest('/api/collections/', 'GET', 'Get collections'),

            # Search API
            APIEndpointTest('/api/dummy-search', 'GET', 'Get dummy search results'),
            APIEndpointTest('/api/search-wrapper', 'GET', 'Search wrapper'),
            APIEndpointTest('/api/search-wrapper/es6', 'GET', 'Search wrapper (ES6)'),
            APIEndpointTest('/api/search-wrapper/es8', 'GET', 'Search wrapper (ES8)'),
            APIEndpointTest('/api/search-path-filter/{title}', 'GET', 'Search path filter'),

            # Topics API
            APIEndpointTest('/api/topics', 'GET', 'Get topics'),
            APIEndpointTest('/api/topics/{topic}', 'GET', 'Get topic'),
            APIEndpointTest('/api/v2/topics/{topic}', 'GET', 'Get topic (v2)'),
            APIEndpointTest('/api/topics-graph/{topic}', 'GET', 'Get topic graph'),
            APIEndpointTest('/api/topics/pools/{topic}', 'GET', 'Get topic pool'),
            APIEndpointTest('/api/ref-topic-links/{tref}', 'GET', 'Get topic-reference links'),
            APIEndpointTest('/api/topic/completion/{topic}', 'GET', 'Get topic completion'),
            APIEndpointTest('/api/recommend/topics/', 'GET', 'Get recommended topics'),

            # Portals API
            APIEndpointTest('/api/portals/{slug}', 'GET', 'Get portal'),

            # History API
            APIEndpointTest('/api/history/{tref}', 'GET', 'Get text history'),
            APIEndpointTest('/api/history/{tref}/{lang}/{version}', 'GET', 'Get version history'),

            # Edit Locks API
            APIEndpointTest('/api/locks/check/{tref}/{lang}/{version}', 'GET', 'Check edit lock'),

            # Image Generation API
            APIEndpointTest('/api/img-gen/{tref}', 'GET', 'Generate social image'),

            # Linker and Text Processing API
            APIEndpointTest('/api/regexs/{title}', 'GET', 'Get title regex'),
            APIEndpointTest('/api/websites/{domain}', 'GET', 'Get website data'),
            APIEndpointTest('/api/linker-data/{title}', 'GET', 'Get linker data'),
            APIEndpointTest('/api/bulktext/{refs}', 'GET', 'Get bulk text'),
            APIEndpointTest('/api/passages/{refs}', 'GET', 'Get passages'),

            # Newsletter API
            APIEndpointTest('/api/newsletter_mailing_lists/', 'GET', 'Get mailing lists'),

            # Statistics API
            APIEndpointTest('/api/stats/library-stats', 'GET', 'Get library stats'),
            APIEndpointTest('/api/stats/core-link-stats', 'GET', 'Get core link stats'),

            # Manuscripts API
            APIEndpointTest('/api/manuscripts/{tref}', 'GET', 'Get manuscripts'),

            # Background Data API
            APIEndpointTest('/api/background-data', 'GET', 'Get background data'),
        ]
    
    def substitute_params(self, url: str) -> str:
        """Substitute URL parameters with sample data."""
        # Replace URL parameters with sample data
        for key, value in self.sample_data.items():
            url = url.replace(f'{{{key}}}', str(value))
        return url
    
    def test_endpoint(self, endpoint: APIEndpointTest) -> TestResult:
        """Test a single API endpoint."""
        url = self.substitute_params(endpoint.url)
        
        start_time = time.time()
        
        try:
            # Log in test user if authentication is required
            if endpoint.requires_auth:
                self.client.force_login(self.test_user)
            
            # Make the request using Django test client
            if endpoint.method == 'GET':
                response = self.client.get(url)
            elif endpoint.method == 'POST':
                response = self.client.post(url, data=endpoint.data or {})
            elif endpoint.method == 'PUT':
                response = self.client.put(url, data=endpoint.data or {})
            elif endpoint.method == 'DELETE':
                response = self.client.delete(url)
            else:
                raise ValueError(f"Unsupported method: {endpoint.method}")
            
            end_time = time.time()
            response_time = end_time - start_time
            
            # Check if response indicates a Django error
            django_error = False
            error_message = None
            
            if response.status_code >= 500:
                django_error = True
                error_message = f"Server error: {response.status_code}"
            elif response.status_code == 404:
                # 404 might be expected for some endpoints, not necessarily an error
                error_message = "Not found"
            elif response.status_code >= 400:
                error_message = f"Client error: {response.status_code}"
            
            # Check response content for Django error traces
            if hasattr(response, 'content') and response.content:
                content = response.content.decode('utf-8', errors='ignore')
                if 'Traceback' in content and 'Exception' in content:
                    django_error = True
                    error_message = "Django traceback detected"
            
            success = not django_error and response.status_code < 500
            
            return TestResult(
                endpoint=url,
                method=endpoint.method,
                status_code=response.status_code,
                success=success,
                error=error_message,
                response_time=response_time,
                django_error=django_error
            )
            
        except Exception as e:
            end_time = time.time()
            response_time = end_time - start_time
            
            return TestResult(
                endpoint=url,
                method=endpoint.method,
                status_code=0,
                success=False,
                error=str(e),
                response_time=response_time,
                django_error=True
            )
    
    def run_tests(self) -> List[TestResult]:
        """Run all API endpoint tests."""
        endpoints = self.get_test_endpoints()
        results = []
        
        print(f"Testing {len(endpoints)} API endpoints...")
        print("=" * 80)
        
        for i, endpoint in enumerate(endpoints, 1):
            print(f"[{i:3d}/{len(endpoints)}] Testing {endpoint.method} {endpoint.url}")
            
            result = self.test_endpoint(endpoint)
            results.append(result)
            
            # Print result
            status_color = "✓" if result.success else "✗"
            print(f"         {status_color} {result.status_code} - {result.response_time:.3f}s")
            
            if result.error:
                print(f"           Error: {result.error}")
            
            # Small delay to avoid overwhelming the server
            time.sleep(0.1)
        
        return results
    
    def print_summary(self, results: List[TestResult]):
        """Print a summary of test results."""
        print("\n" + "=" * 80)
        print("TEST SUMMARY")
        print("=" * 80)
        
        total_tests = len(results)
        successful_tests = sum(1 for r in results if r.success)
        failed_tests = total_tests - successful_tests
        django_errors = sum(1 for r in results if r.django_error)
        
        print(f"Total endpoints tested: {total_tests}")
        print(f"Successful: {successful_tests}")
        print(f"Failed: {failed_tests}")
        print(f"Django errors: {django_errors}")
        
        if failed_tests > 0:
            print(f"\nFAILED ENDPOINTS:")
            print("-" * 40)
            for result in results:
                if not result.success:
                    error_type = "DJANGO ERROR" if result.django_error else "HTTP ERROR"
                    print(f"{error_type}: {result.method} {result.endpoint}")
                    print(f"  Status: {result.status_code}")
                    print(f"  Error: {result.error}")
                    print()
        
        # Group by status code
        status_counts = {}
        for result in results:
            status_counts[result.status_code] = status_counts.get(result.status_code, 0) + 1
        
        print(f"\nSTATUS CODE DISTRIBUTION:")
        print("-" * 40)
        for status_code, count in sorted(status_counts.items()):
            print(f"{status_code}: {count} endpoints")
        
        print(f"\nAverage response time: {sum(r.response_time for r in results) / len(results):.3f}s")

def main():
    """Main function to run the API endpoint tests."""
    print("Sefaria API Endpoint Testing Script")
    print("=" * 80)
    
    # Check if Django server is running
    try:
        import requests
        response = requests.get('http://127.0.0.1:8000/', timeout=5)
        print("✓ Django server is running")
    except Exception as e:
        print("✗ Django server is not accessible")
        print("Please start the Django server with: python manage.py runserver")
        return 1
    
    # Run tests
    tester = APIEndpointTester()
    results = tester.run_tests()
    
    # Print summary
    tester.print_summary(results)
    
    # Save results to file
    timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
    results_file = f'api_test_results_{timestamp}.json'
    
    with open(results_file, 'w') as f:
        json.dump([{
            'endpoint': r.endpoint,
            'method': r.method,
            'status_code': r.status_code,
            'success': r.success,
            'error': r.error,
            'response_time': r.response_time,
            'django_error': r.django_error
        } for r in results], f, indent=2)
    
    print(f"\nResults saved to: {results_file}")
    
    # Return exit code based on results
    django_errors = sum(1 for r in results if r.django_error)
    return 1 if django_errors > 0 else 0

if __name__ == '__main__':
    sys.exit(main())