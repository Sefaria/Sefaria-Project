#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
Elasticsearch Reindexing Cronjob

This script performs a full reindex of Elasticsearch indexes for text and sheet content.
It includes:
- Print-based logging (instead of Python logging) for Kubernetes stdout/stderr capture
- Pre-flight checks for index existence
- Graceful failure handling (continues on individual failures, reports at end)
- Retry logic for transient errors

Note: We use print() statements instead of Python's logging module because Kubernetes
captures stdout/stderr for `kubectl logs`, making print() the most reliable way to
ensure logs are visible in the Kubernetes environment.
"""

from datetime import datetime
import json
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

# Constants for consistent formatting
SEPARATOR_LINE = "=" * 60
SUBSECTION_LINE = "=" * 40


class ReindexingResult:
    """Track reindexing results and failures."""
    
    def __init__(self):
        self.start_time = datetime.now()
        self.end_time = None
        self.duration = None
        self.steps_completed = []
        self.steps_failed = []
        self.warnings = []
        
        # Detailed failure tracking
        self.failed_text_versions = []
        self.skipped_text_versions = []
    
    def record_step_success(self, step_name: str, details: str = None):
        """Record a step that completed successfully."""
        try:
            entry = {"step": step_name, "time": datetime.now().isoformat()}
            if details:
                entry["details"] = details
            self.steps_completed.append(entry)
            print(f"Step completed: {step_name}" + (f" - {details}" if details else ""))
        except Exception as e:
            print(f"WARNING: Failed to record step success - step: {step_name}, error: {str(e)}")
    
    def record_step_failure(self, step_name: str, message: str):
        """Record a step that failed."""
        try:
            entry = {
                "step": step_name, 
                "time": datetime.now().isoformat(),
                "message": message
            }
            self.steps_failed.append(entry)
            print(f"ERROR: Step failed: {step_name} - {message}")
        except Exception as e:
            print(f"WARNING: Failed to record step failure - step: {step_name}, error: {str(e)}")
    
    def add_warning(self, message: str, details: str = None):
        """Add a warning (non-fatal issue)."""
        try:
            entry = {"message": message, "time": datetime.now().isoformat()}
            if details:
                entry["details"] = details
            self.warnings.append(entry)
            print(f"WARNING: {message}" + (f" - {details}" if details else ""))
        except Exception as e:
            print(f"WARNING: Failed to add warning - message_preview: {message[:50]}, error: {str(e)}")
    
    def is_success(self) -> bool:
        """Return True if no critical failures occurred."""
        return len(self.steps_failed) == 0
    
    def get_summary(self) -> str:
        """Generate a human-readable summary and finalize timings."""
        # Finalize timing calculations
        if self.end_time is None:
            self.end_time = datetime.now()
        if self.duration is None:
            self.duration = self.end_time - self.start_time
        
        try:
            lines = [
                SEPARATOR_LINE,
                "ELASTICSEARCH REINDEXING SUMMARY",
                SEPARATOR_LINE,
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
                    lines.append(f"  ✗ {failure['step']}: {failure.get('message', 'No message')}")
            
            lines.append(SEPARATOR_LINE)
            return "\n".join(lines)
        except Exception as e:
            return f"ERROR: Failed to generate summary - {str(e)}"
    
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


def safe_print(message: str):
    """Safely print a message, catching any exceptions to prevent logging from breaking the script."""
    try:
        print(message)
    except Exception as e:
        # Last resort - try to print error without using variables
        try:
            print(f"WARNING: Failed to print log message: {str(e)}")
        except:
            pass  # If even this fails, give up silently


def check_elasticsearch_connection() -> bool:
    """Verify Elasticsearch is reachable."""
    try:
        info = es_client.info()
        cluster_name = info.get('cluster_name')
        version = info.get('version', {}).get('number')
        safe_print(f"Elasticsearch connection verified - cluster: {cluster_name}, version: {version}")
        return True
    except Exception as e:
        safe_print(f"ERROR: Failed to connect to Elasticsearch - {str(e)}")
        return False


def check_index_exists(index_name: str) -> bool:
    """Check if an Elasticsearch index exists."""
    try:
        exists = index_client.exists(index=index_name)
        safe_print(f"DEBUG: Index existence check - index: {index_name}, exists: {exists}")
        return exists
    except Exception as e:
        safe_print(f"WARNING: Failed to check index existence - index: {index_name}, error: {str(e)}")
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
        safe_print(f"WARNING: Failed to get doc count - index: {index_name}, error: {str(e)}")
        return -1


def log_index_state(index_type: str, result: ReindexingResult):
    """Log the current state of indexes for a given type."""
    try:
        names = get_new_and_current_index_names(index_type, debug=False)
        if not names:
            safe_print(f"ERROR: Could not get index names for type {index_type}")
            raise ValueError(f"get_new_and_current_index_names returned None for {index_type}")
        
        current_index = names.get('current')
        new_index = names.get('new')
        alias = names.get('alias')
        
        if not all([current_index, new_index, alias]):
            safe_print(f"ERROR: Missing required index name fields - current: {current_index}, new: {new_index}, alias: {alias}")
            raise ValueError(f"Missing required index name fields for {index_type}")
        
        current_count = get_index_doc_count(current_index)
        new_exists = check_index_exists(new_index)
        new_count = get_index_doc_count(new_index) if new_exists else 0
        
        safe_print(f"Index state for {index_type} - alias: {alias}, current_index: {current_index}, "
              f"current_doc_count: {current_count}, new_index: {new_index}, "
              f"new_index_exists: {new_exists}, new_doc_count: {new_count}")
        
        # Warn if new index already exists with documents
        if new_exists and new_count > 0:
            result.add_warning(
                f"New {index_type} index already exists with {new_count} documents",
                f"Index {new_index} will be deleted and recreated"
            )
    except Exception as e:
        safe_print(f"ERROR: Failed to get index state for {index_type} - {str(e)}")
        raise


def run_pagesheetrank_update(result: ReindexingResult) -> bool:
    """Run pagesheetrank update with error handling."""
    print("Starting pagesheetrank update")
    try:
        update_pagesheetrank()
        result.record_step_success("pagesheetrank_update", "PageSheetRank values updated successfully")
        return True
    except Exception as e:
        result.record_step_failure("pagesheetrank_update", str(e))
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
            safe_print(f"WARNING: Text indexing completed with failures - "
                  f"failed_count: {text_failures}, skipped_count: {text_skipped}")
            result.record_step_success("index_all", 
                               f"Completed with {text_failures} text failures, {text_skipped} skipped")
        else:
            result.record_step_success("index_all", "Text and sheet indexes rebuilt successfully")
        
        return True
    except Exception as e:
        result.record_step_failure("index_all", str(e))
        return False


def run_sheets_by_timestamp(timestamp: str, result: ReindexingResult, max_retries: int = 3) -> bool:
    """
    Call the sheets-by-timestamp API with retry logic.
    
    This catches sheets created/modified during the reindexing process.
    """
    safe_print(f"Starting sheets-by-timestamp API call - timestamp: {timestamp}")
    
    url = "https://www.sefaria.org/admin/index-sheets-by-timestamp"
    
    for attempt in range(1, max_retries + 1):
        try:
            safe_print(f"DEBUG: API attempt {attempt}/{max_retries} - url: {url}")
            
            r = requests.post(
                url,
                data={"timestamp": timestamp, "apikey": SEFARIA_BOT_API_KEY},
                timeout=300  # 5 minute timeout
            )
            
            # Check for HTTP errors
            if r.status_code != 200:
                error_msg = f"HTTP {r.status_code}: {r.text[:500]}"
                safe_print(f"WARNING: API returned non-200 status - attempt: {attempt}, "
                      f"status_code: {r.status_code}, response_preview: {r.text[:200]}")
                
                if attempt < max_retries:
                    wait_time = attempt * 30  # Linear backoff (30s, 60s, 90s)
                    safe_print(f"Retrying in {wait_time} seconds...")
                    time.sleep(wait_time)
                    continue
                else:
                    result.record_step_failure("sheets_by_timestamp", error_msg)
                    return False
            
            # Check for error in response body
            if "error" in r.text.lower():
                # Try to parse as JSON first
                try:
                    response_json = r.json()
                    if "error" in response_json.get("error", "").lower():
                        error_msg = response_json["error"]
                        result.record_step_failure("sheets_by_timestamp", f"API error: {error_msg}")
                        return False
                except json.JSONDecodeError:
                    # If it's HTML (like a 500 error page), that's a failure
                    if "<html" in r.text.lower():
                        result.record_step_failure("sheets_by_timestamp", 
                                        f"API returned HTML error page instead of JSON: {r.text[:1000]}")
                        return False
                except Exception as e:
                    safe_print(f"WARNING: Error parsing response JSON - error: {str(e)}")
            
            # Success!
            result.record_step_success("sheets_by_timestamp", f"Response: {r.text[:200]}")
            return True
            
        except requests.exceptions.Timeout:
            safe_print(f"WARNING: API request timed out - attempt: {attempt}")
            if attempt < max_retries:
                time.sleep(attempt * 30)
                continue
            result.record_step_failure("sheets_by_timestamp", "Request timed out after all retries")
            return False
            
        except requests.exceptions.RequestException as e:
            safe_print(f"WARNING: API request failed - attempt: {attempt}, error: {str(e)}")
            if attempt < max_retries:
                time.sleep(attempt * 30)
                continue
            result.record_step_failure("sheets_by_timestamp", f"Request failed: {str(e)}")
            return False


def main():
    """Main entry point for the reindexing cronjob."""
    result = ReindexingResult()
    
    print(SEPARATOR_LINE)
    print("ELASTICSEARCH REINDEXING CRONJOB")
    safe_print(f"Started at: {result.start_time.isoformat()}")
    print(SEPARATOR_LINE)
    
    # Store timestamp before we start (sheets created after this will be caught by API)
    last_sheet_timestamp = datetime.now().isoformat()
    safe_print(f"Captured start timestamp for sheet catch-up - timestamp: {last_sheet_timestamp}")
    
    # Pre-flight checks
    print("Running pre-flight checks...")
    
    # 1. Check Elasticsearch connection
    if not check_elasticsearch_connection():
        result.record_step_failure("preflight_elasticsearch", "Cannot connect to Elasticsearch")
        safe_print(result.get_summary())
        sys.exit(1)
    result.record_step_success("preflight_elasticsearch", "Elasticsearch connection verified")
    
    # 2. Log current index states
    try:
        log_index_state('text', result)
        log_index_state('sheet', result)
        result.record_step_success("preflight_index_check", "Index states logged")
    except Exception as e:
        result.record_step_failure("preflight_index_check", str(e))
        safe_print(result.get_summary())
        sys.exit(1)
    
    # Step 1: Update PageSheetRank
    print(SUBSECTION_LINE)
    print("STEP 1: PageSheetRank Update")
    print(SUBSECTION_LINE)
    
    if not run_pagesheetrank_update(result):
        # PageSheetRank failure is not critical - continue with warning
        result.add_warning("PageSheetRank update failed, continuing anyway")
    
    # Step 2: Full index rebuild
    print(SUBSECTION_LINE)
    print("STEP 2: Full Index Rebuild")
    print(SUBSECTION_LINE)
    
    if not run_index_all(result):
        # This is critical - but we still try the sheets API
        result.add_warning("Full index rebuild failed")
    
    # Step 3: Catch-up sheets by timestamp
    print(SUBSECTION_LINE)
    print("STEP 3: Sheets Catch-up by Timestamp")
    print(SUBSECTION_LINE)
    
    run_sheets_by_timestamp(last_sheet_timestamp, result)
    
    # Only print summary and detailed report if there are failures or skips
    if result.failed_text_versions or result.skipped_text_versions or result.steps_failed:
        print("\n")
        safe_print(result.get_summary())
        
        # Print detailed failure report if there are failures
        detailed_report = result.detailed_failure_report()
        if detailed_report:
            safe_print(detailed_report)
        
        # Save detailed report to file
        try:
            report_file = f"/tmp/reindex_failures_{datetime.now().strftime('%Y%m%d_%H%M%S')}.txt"
            with open(report_file, 'w') as f:
                f.write(result.get_summary())
                f.write("\n\n")
                f.write(detailed_report)
            safe_print(f"Detailed failure report saved to: {report_file}")
        except Exception as e:
            safe_print(f"WARNING: Could not save failure report to file - error: {str(e)}")
    
    # Only log final index states if there were failures
    if result.failed_text_versions or result.skipped_text_versions or result.steps_failed:
        print("Final index states:")
        try:
            log_index_state('text', result)
            log_index_state('sheet', result)
        except Exception as e:
            safe_print(f"WARNING: Failed to log final index states - error: {str(e)}")
    
    # Exit with appropriate code
    if result.is_success():
        # Print success message
        if result.failed_text_versions or result.skipped_text_versions:
            print("Reindexing completed with some failures (see summary above).")
        else:
            print(SEPARATOR_LINE)
            print("Reindexing completed successfully!")
            safe_print(f"Duration: {result.duration}")
            print(SEPARATOR_LINE)
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
        safe_print(f"ERROR: Unexpected error in reindexing cronjob - error: {str(e)}")
        safe_print(f"Traceback:\n{traceback.format_exc()}")
        sys.exit(1)
