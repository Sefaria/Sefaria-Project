#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
Elasticsearch Reindexing Cronjob

This script performs a full reindex of Elasticsearch indexes for text and sheet content.
It includes:
- Verbose logging for better debugging
- Pre-flight checks for index existence
- Graceful failure handling (continues on individual failures, reports at end)
- Retry logic for transient errors
"""

from datetime import datetime
import requests
import traceback
import sys
import time

import django
django.setup()

from sefaria.model import *
from sefaria.search import index_all, get_new_and_current_index_names, index_client, es_client
from sefaria.local_settings import SEFARIA_BOT_API_KEY
from sefaria.pagesheetrank import update_pagesheetrank


class ReindexingResult:
    """Track reindexing results and failures."""
    
    def __init__(self):
        self.start_time = datetime.now()
        self.end_time = None
        self.steps_completed = []
        self.steps_failed = []
        self.warnings = []
        
        # Detailed failure tracking
        self.failed_text_versions = []
        self.skipped_text_versions = []
    
    def complete_step(self, step_name: str, details: str = None):
        """Mark a step as completed."""
        entry = {"step": step_name, "time": datetime.now().isoformat()}
        if details:
            entry["details"] = details
        self.steps_completed.append(entry)
        print(f"Step completed: {step_name}" + (f" - {details}" if details else ""))
    
    def fail_step(self, step_name: str, error: str):
        """Mark a step as failed."""
        entry = {
            "step": step_name, 
            "time": datetime.now().isoformat(),
            "error": error
        }
        self.steps_failed.append(entry)
        print(f"ERROR: Step failed: {step_name} - {error}")
    
    def add_warning(self, message: str, details: str = None):
        """Add a warning (non-fatal issue)."""
        entry = {"message": message, "time": datetime.now().isoformat()}
        if details:
            entry["details"] = details
        self.warnings.append(entry)
        print(f"WARNING: {message}" + (f" - {details}" if details else ""))
    
    def finalize(self):
        """Finalize the result and calculate duration."""
        self.end_time = datetime.now()
        self.duration = self.end_time - self.start_time
    
    def is_success(self) -> bool:
        """Return True if no critical failures occurred."""
        return len(self.steps_failed) == 0
    
    def summary(self) -> str:
        """Generate a human-readable summary."""
        self.finalize()
        lines = [
            "=" * 60,
            "ELASTICSEARCH REINDEXING SUMMARY",
            "=" * 60,
            f"Start Time: {self.start_time.isoformat()}",
            f"End Time:   {self.end_time.isoformat()}",
            f"Duration:   {self.duration}",
            f"Status:     {'SUCCESS' if self.is_success() else 'FAILED'}",
            "",
            f"Steps Completed: {len(self.steps_completed)}",
        ]
        for step in self.steps_completed:
            lines.append(f"  ✓ {step['step']}")
        
        if self.warnings:
            lines.append(f"\nWarnings: {len(self.warnings)}")
            for warning in self.warnings:
                lines.append(f"  ⚠ {warning['message']}")
        
        if self.steps_failed:
            lines.append(f"\nFailures: {len(self.steps_failed)}")
            for failure in self.steps_failed:
                lines.append(f"  ✗ {failure['step']}: {failure['error']}")
        
        lines.append("=" * 60)
        return "\n".join(lines)
    
    def detailed_failure_report(self) -> str:
        """Generate detailed report of all failures."""
        if not self.failed_text_versions and not self.skipped_text_versions:
            return ""
        
        lines = [
            "\n" + "=" * 80,
            "DETAILED FAILURE REPORT",
            "=" * 80,
        ]
        
        if self.failed_text_versions:
            lines.append(f"\nFailed Text Versions: {len(self.failed_text_versions)}")
            lines.append("-" * 40)
            for i, failure in enumerate(self.failed_text_versions[:50], 1):
                title = failure.get('title', 'Unknown')
                version = failure.get('version', 'Unknown')
                lang = failure.get('lang', 'Unknown')
                error_type = failure.get('error_type', 'Unknown')
                error = failure.get('error', 'Unknown error')[:100]
                lines.append(f"{i}. {title} ({version}, {lang})")
                lines.append(f"   Error: {error_type}: {error}")
            
            if len(self.failed_text_versions) > 50:
                lines.append(f"... and {len(self.failed_text_versions) - 50} more")
        
        if self.skipped_text_versions:
            lines.append(f"\nSkipped Text Versions: {len(self.skipped_text_versions)}")
            lines.append("-" * 40)
            for i, skip in enumerate(self.skipped_text_versions[:20], 1):
                title = skip.get('title', 'Unknown')
                version = skip.get('version', 'Unknown')
                reason = skip.get('reason', 'Unknown')
                lines.append(f"{i}. {title} ({version}) - {reason}")
            
            if len(self.skipped_text_versions) > 20:
                lines.append(f"... and {len(self.skipped_text_versions) - 20} more")
        
        lines.append("=" * 80)
        return "\n".join(lines)


def check_elasticsearch_connection() -> bool:
    """Verify Elasticsearch is reachable."""
    try:
        info = es_client.info()
        cluster_name = info.get('cluster_name')
        version = info.get('version', {}).get('number')
        print(f"Elasticsearch connection verified - cluster: {cluster_name}, version: {version}")
        return True
    except Exception as e:
        print(f"ERROR: Failed to connect to Elasticsearch - {str(e)}")
        return False


def check_index_exists(index_name: str) -> bool:
    """Check if an Elasticsearch index exists."""
    try:
        exists = index_client.exists(index=index_name)
        print(f"DEBUG: Index existence check - index: {index_name}, exists: {exists}")
        return exists
    except Exception as e:
        print(f"WARNING: Failed to check index existence - index: {index_name}, error: {str(e)}")
        return False


def get_index_doc_count(index_name: str) -> int:
    """Get document count for an index."""
    try:
        if not check_index_exists(index_name):
            return 0
        stats = index_client.stats(index=index_name)
        doc_count = stats.get('_all', {}).get('primaries', {}).get('docs', {}).get('count', 0)
        return doc_count
    except Exception as e:
        print(f"WARNING: Failed to get doc count - index: {index_name}, error: {str(e)}")
        return -1


def log_index_state(index_type: str, result: ReindexingResult):
    """Log the current state of indexes for a given type."""
    try:
        names = get_new_and_current_index_names(index_type, debug=False)
        current_index = names['current']
        new_index = names['new']
        alias = names['alias']
        
        current_count = get_index_doc_count(current_index)
        new_exists = check_index_exists(new_index)
        new_count = get_index_doc_count(new_index) if new_exists else 0
        
        print(f"Index state for {index_type} - alias: {alias}, current_index: {current_index}, "
              f"current_doc_count: {current_count}, new_index: {new_index}, "
              f"new_index_exists: {new_exists}, new_doc_count: {new_count}")
        
        # Warn if new index already exists with documents
        if new_exists and new_count > 0:
            result.add_warning(
                f"New {index_type} index already exists with {new_count} documents",
                f"Index {new_index} will be deleted and recreated"
            )
    except Exception as e:
        print(f"ERROR: Failed to get index state for {index_type} - {str(e)}")
        raise


def run_pagesheetrank_update(result: ReindexingResult) -> bool:
    """Run pagesheetrank update with error handling."""
    print("Starting pagesheetrank update")
    try:
        update_pagesheetrank()
        result.complete_step("pagesheetrank_update", "PageSheetRank values updated successfully")
        return True
    except Exception as e:
        result.fail_step("pagesheetrank_update", str(e))
        return False


def run_index_all(result: ReindexingResult) -> bool:
    """Run full index with error handling and failure capture."""
    print("Starting full index rebuild")
    try:
        index_all()
        
        # Capture failures from TextIndexer class after indexing
        from sefaria.search import TextIndexer
        result.failed_text_versions = TextIndexer._failed_versions.copy()
        result.skipped_text_versions = TextIndexer._skipped_versions.copy()
        
        # Log failure counts
        text_failures = len(result.failed_text_versions)
        text_skipped = len(result.skipped_text_versions)
        
        if text_failures > 0:
            print(f"WARNING: Text indexing completed with failures - "
                  f"failed_count: {text_failures}, skipped_count: {text_skipped}")
            result.complete_step("index_all", 
                               f"Completed with {text_failures} text failures, {text_skipped} skipped")
        else:
            result.complete_step("index_all", "Text and sheet indexes rebuilt successfully")
        
        return True
    except Exception as e:
        result.fail_step("index_all", str(e))
        return False


def run_sheets_by_timestamp(timestamp: str, result: ReindexingResult, max_retries: int = 3) -> bool:
    """
    Call the sheets-by-timestamp API with retry logic.
    
    This catches sheets created/modified during the reindexing process.
    """
    print(f"Starting sheets-by-timestamp API call - timestamp: {timestamp}")
    
    url = "https://www.sefaria.org/admin/index-sheets-by-timestamp"
    
    for attempt in range(1, max_retries + 1):
        try:
            print(f"DEBUG: API attempt {attempt}/{max_retries} - url: {url}")
            
            r = requests.post(
                url,
                data={"timestamp": timestamp, "apikey": SEFARIA_BOT_API_KEY},
                timeout=300  # 5 minute timeout
            )
            
            # Check for HTTP errors
            if r.status_code != 200:
                error_msg = f"HTTP {r.status_code}: {r.text[:500]}"
                print(f"WARNING: API returned non-200 status - attempt: {attempt}, "
                      f"status_code: {r.status_code}, response_preview: {r.text[:200]}")
                
                if attempt < max_retries:
                    wait_time = attempt * 30  # Exponential backoff
                    print(f"Retrying in {wait_time} seconds...")
                    time.sleep(wait_time)
                    continue
                else:
                    result.fail_step("sheets_by_timestamp", error_msg)
                    return False
            
            # Check for error in response body
            if "error" in r.text.lower():
                # Try to parse as JSON first
                try:
                    response_json = r.json()
                    if "error" in response_json:
                        error_msg = response_json["error"]
                        result.fail_step("sheets_by_timestamp", f"API error: {error_msg}")
                        return False
                except:
                    # If it's HTML (like a 500 error page), that's a failure
                    if "<html" in r.text.lower():
                        result.fail_step("sheets_by_timestamp", 
                                        f"API returned HTML error page instead of JSON: {r.text[:1000]}")
                        return False
            
            # Success!
            print(f"sheets-by-timestamp API completed successfully - response: {r.text[:200]}")
            result.complete_step("sheets_by_timestamp", f"Response: {r.text[:200]}")
            return True
            
        except requests.exceptions.Timeout:
            print(f"WARNING: API request timed out - attempt: {attempt}")
            if attempt < max_retries:
                time.sleep(attempt * 30)
                continue
            result.fail_step("sheets_by_timestamp", "Request timed out after all retries")
            return False
            
        except requests.exceptions.RequestException as e:
            print(f"WARNING: API request failed - attempt: {attempt}, error: {str(e)}")
            if attempt < max_retries:
                time.sleep(attempt * 30)
                continue
            result.fail_step("sheets_by_timestamp", f"Request failed: {str(e)}")
            return False


def main():
    """Main entry point for the reindexing cronjob."""
    result = ReindexingResult()
    
    print("=" * 60)
    print("ELASTICSEARCH REINDEXING CRONJOB")
    print(f"Started at: {result.start_time.isoformat()}")
    print("=" * 60)
    
    # Store timestamp before we start (sheets created after this will be caught by API)
    last_sheet_timestamp = datetime.now().isoformat()
    print(f"Captured start timestamp for sheet catch-up - timestamp: {last_sheet_timestamp}")
    
    # Pre-flight checks
    print("Running pre-flight checks...")
    
    # 1. Check Elasticsearch connection
    if not check_elasticsearch_connection():
        result.fail_step("preflight_elasticsearch", "Cannot connect to Elasticsearch")
        print(result.summary())
        sys.exit(1)
    result.complete_step("preflight_elasticsearch", "Elasticsearch connection verified")
    
    # 2. Log current index states
    try:
        log_index_state('text', result)
        log_index_state('sheet', result)
        result.complete_step("preflight_index_check", "Index states logged")
    except Exception as e:
        result.fail_step("preflight_index_check", str(e))
        print(result.summary())
        sys.exit(1)
    
    # Step 1: Update PageSheetRank
    print("=" * 40)
    print("STEP 1: PageSheetRank Update")
    print("=" * 40)
    
    if not run_pagesheetrank_update(result):
        # PageSheetRank failure is not critical - continue with warning
        result.add_warning("PageSheetRank update failed, continuing anyway")
    
    # Step 2: Full index rebuild
    print("=" * 40)
    print("STEP 2: Full Index Rebuild")
    print("=" * 40)
    
    if not run_index_all(result):
        # This is critical - but we still try the sheets API
        result.add_warning("Full index rebuild failed")
    
    # Step 3: Catch-up sheets by timestamp
    print("=" * 40)
    print("STEP 3: Sheets Catch-up by Timestamp")
    print("=" * 40)
    
    run_sheets_by_timestamp(last_sheet_timestamp, result)
    
    # Final summary
    print("\n")
    print(result.summary())
    
    # Print detailed failure report if there are failures
    detailed_report = result.detailed_failure_report()
    if detailed_report:
        print(detailed_report)
        
        # Save detailed report to file
        try:
            report_file = f"/tmp/reindex_failures_{datetime.now().strftime('%Y%m%d_%H%M%S')}.txt"
            with open(report_file, 'w') as f:
                f.write(result.summary())
                f.write("\n\n")
                f.write(detailed_report)
            print(f"Detailed failure report saved to: {report_file}")
        except Exception as e:
            print(f"WARNING: Could not save failure report to file - error: {str(e)}")
    
    # Log final index states
    print("Final index states:")
    try:
        log_index_state('text', result)
        log_index_state('sheet', result)
    except Exception as e:
        print(f"WARNING: Failed to log final index states - error: {str(e)}")
    
    # Exit with appropriate code
    if result.is_success():
        print("Reindexing completed successfully!")
        sys.exit(0)
    else:
        print("ERROR: Reindexing completed with errors. See summary above.")
        sys.exit(1)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("WARNING: Reindexing interrupted by user")
        sys.exit(130)
    except Exception as e:
        print(f"ERROR: Unexpected error in reindexing cronjob - error: {str(e)}")
        print(f"Traceback:\n{traceback.format_exc()}")
        sys.exit(1)
