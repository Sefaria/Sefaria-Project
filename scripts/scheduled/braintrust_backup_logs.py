# -*- coding: utf-8 -*-
"""
Task 1: Backup logs from Braintrust last 7 days to CSV in GCS bucket "braintrust-logs".

This script is called from the init container of the braintrust-backup-logs cronjob.
The CSV is created in /tmp and will be uploaded by the main container.

Run weekly (e.g., Sundays).
"""
import sys
import os
import csv
import re
from datetime import datetime, timedelta, timezone

import structlog
import requests

logger = structlog.get_logger(__name__)


def get_braintrust_api_key():
    """Get Braintrust API key from environment."""
    api_key = os.getenv("BRAINTRUST_API_KEY")
    if not api_key:
        raise RuntimeError("BRAINTRUST_API_KEY environment variable is required")
    return api_key


def query_braintrust_logs(days=7):
    """
    Query logs from Braintrust using BTQL API.

    Args:
        days: Number of days back to retrieve

    Returns:
        List of log dicts
    """
    logger.info("querying_braintrust_logs", days=days)

    api_key = get_braintrust_api_key()
    project_id = os.getenv("BRAINTRUST_PROJECT_ID", "")

    if not project_id:
        raise RuntimeError("BRAINTRUST_PROJECT_ID environment variable is required")

    # Validate project_id format (UUID) to prevent BTQL injection
    uuid_pattern = re.compile(r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$', re.IGNORECASE)
    if not uuid_pattern.match(project_id):
        raise RuntimeError(f"BRAINTRUST_PROJECT_ID must be a valid UUID, got: {project_id!r}")

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json"
    }

    # Calculate date range
    days_ago = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()

    # SQL query to get logs from last N days
    query = f"""
SELECT *
FROM project_logs('{project_id}', shape => 'traces')
WHERE created >= '{days_ago}'
"""

    try:
        response = requests.post(
            "https://api.braintrust.dev/btql",
            headers=headers,
            json={"query": query, "fmt": "json"},
            timeout=60
        )
        response.raise_for_status()

        data = response.json()
        logs = data.get("results", [])

        logger.info("braintrust_logs_fetched", count=len(logs))
        return logs

    except requests.exceptions.RequestException as e:
        logger.error("query_braintrust_logs_failed", error=str(e), exc_info=True)
        raise


def logs_to_csv(logs, filepath):
    """
    Convert log entries to CSV format.

    Args:
        logs: List of log entry dicts
        filepath: Path to write CSV file to
    """
    if not logs:
        logger.warning("no_logs_to_export")
        return False

    logger.info("converting_to_csv", count=len(logs), filepath=filepath)

    # Get all unique keys from logs to use as CSV headers
    fieldnames = set()
    for log in logs:
        if isinstance(log, dict):
            fieldnames.update(log.keys())
    fieldnames = sorted(list(fieldnames))

    try:
        with open(filepath, 'w', newline='', encoding='utf-8') as f:
            writer = csv.DictWriter(f, fieldnames=fieldnames, restval='')
            writer.writeheader()
            for log in logs:
                if isinstance(log, dict):
                    # Flatten nested dicts to strings
                    flat_log = {}
                    for key, val in log.items():
                        if isinstance(val, (dict, list)):
                            flat_log[key] = str(val)
                        else:
                            flat_log[key] = val
                    writer.writerow(flat_log)

        logger.info("csv_created", filepath=filepath, rows=len(logs))
        return True

    except Exception as e:
        logger.error("csv_creation_failed", error=str(e), exc_info=True)
        raise


def main():
    logger.info("starting_braintrust_backup_logs")

    try:
        # Step 1: Query Braintrust logs from last 7 days
        logs = query_braintrust_logs(days=7)

        if not logs:
            logger.warning("no_logs_retrieved")
            sys.exit(0)  # Don't fail if no logs

        # Step 2: Create CSV file in /tmp (will be uploaded by main container)
        timestamp = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        csv_filename = f"/tmp/logs_backup_{timestamp}.csv"

        if logs_to_csv(logs, csv_filename):
            logger.info("completed_braintrust_backup_logs", csv_file=csv_filename)
        else:
            logger.warning("no_csv_created")
            sys.exit(0)

    except Exception as e:
        logger.error("braintrust_backup_logs_failed", error=str(e), exc_info=True)
        sys.exit(1)


if __name__ == "__main__":
    main()
