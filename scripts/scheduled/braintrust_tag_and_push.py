# -*- coding: utf-8 -*-
"""
Braintrust automation: Tag ALL logs with Claude, then push to relevant datasets.

CORRECT FLOW:
1. Retrieve ALL tags from Braintrust
2. Filter tags: keep only those with "dataset-tagging" in their DESCRIPTION
3. Retrieve ALL logs from last 24 hours (NO filtering)
4. Tag ALL logs using Claude, constrained to use only the filtered tags
5. Save tagged logs to shared storage
6. Retrieve ALL datasets from Braintrust
7. Filter datasets: keep only those with [[relevant_tags: ["a","b"]]] in their DESCRIPTION
8. Match logs to datasets based on relevant_tags and insert (with deduplication)

Run daily at 2 AM.
"""
import sys
import os
import json
import re
from datetime import datetime, timedelta, timezone

import structlog
import requests
from langchain_anthropic import ChatAnthropic
import braintrust

logger = structlog.get_logger(__name__)

# Constant filter for dataset tagging tags
DATASET_TAGGING_FILTER = "dataset-tagging"

# Shared storage path (from environment variable)
SHARED_STORAGE_PATH = os.getenv("BRAINTRUST_SHARED_STORAGE", "/shared/braintrust")
TAGGED_LOGS_FILE = os.path.join(SHARED_STORAGE_PATH, "tagged_logs.jsonl")


def get_braintrust_api_key():
    """Get Braintrust API key from environment."""
    api_key = os.getenv("BRAINTRUST_API_KEY")
    if not api_key:
        raise RuntimeError("BRAINTRUST_API_KEY environment variable is required")
    return api_key


def get_anthropic_api_key():
    """Get Anthropic API key from environment."""
    api_key = os.getenv("ANTHROPIC_API_KEY")
    if not api_key:
        raise RuntimeError("ANTHROPIC_API_KEY environment variable is required")
    return api_key


def fetch_and_filter_tags():
    """
    Step 1: Fetch ALL tags, then filter for "dataset-tagging".

    IMPORTANT: We look at tag.description and keep only tags whose description
    contains "dataset-tagging". These filtered tag names are the ones Claude
    will be allowed to assign to logs.

    Returns:
        List of tag names (strings) whose description contains "dataset-tagging"
    """
    logger.info("fetching_and_filtering_tags")

    api_key = get_braintrust_api_key()
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json"
    }

    try:
        response = requests.get(
            "https://api.braintrust.dev/v1/project_tag",
            headers=headers,
            timeout=30
        )
        response.raise_for_status()

        data = response.json()
        all_tags = data.get("objects", [])

        # Filter: Check if tag.description contains "dataset-tagging"
        # Return: The tag names (these will be used as available tags for Claude)
        filtered_tags = [
            tag["name"] for tag in all_tags
            if tag.get("description", "") and DATASET_TAGGING_FILTER.lower() in tag.get("description", "").lower()
        ]

        logger.info(
            "tags_filtered",
            total_tags=len(all_tags),
            filtered_tags_count=len(filtered_tags),
            filtered_tag_names=filtered_tags
        )

        return filtered_tags

    except requests.exceptions.RequestException as e:
        logger.error("fetch_tags_failed", error=str(e), exc_info=True)
        raise


def query_all_logs(hours=24):
    """
    Step 2: Query ALL logs from the last N hours (NO filtering by tags).

    We get all logs because we will tag them all with Claude.

    Args:
        hours: Number of hours back to retrieve

    Returns:
        List of log dicts
    """
    logger.info("querying_all_logs", hours=hours)

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

    # Calculate time range
    hours_ago = (datetime.now(timezone.utc) - timedelta(hours=hours)).isoformat()

    # SQL query to get ALL logs from last N hours (NO tag filter)
    query = f"""
SELECT *
FROM project_logs('{project_id}', shape => 'traces')
WHERE created >= '{hours_ago}'
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

        logger.info("all_logs_fetched", count=len(logs))
        return logs

    except requests.exceptions.RequestException as e:
        logger.error("query_logs_failed", error=str(e), exc_info=True)
        raise


def get_claude_client():
    """Initialize Claude client from environment."""
    api_key = get_anthropic_api_key()

    return ChatAnthropic(
        model="claude-3-5-haiku-20241022",
        temperature=0,
        max_tokens=256,
        api_key=api_key
    )


def tag_log_with_claude(client, log_entry, available_tags):
    """
    Step 3: Use Claude to assign relevant tags from available_tags to a log.

    Args:
        client: ChatAnthropic client
        log_entry: Dict with log data
        available_tags: List of valid tag names to choose from (filtered to "dataset-tagging" tags)

    Returns:
        List of relevant tags (strings)
    """
    message = str(log_entry.get("input", log_entry.get("message", "")))[:500]
    output = str(log_entry.get("output", ""))[:500]
    log_id = log_entry.get("id", "")

    tags_str = ", ".join(available_tags)

    prompt = f"""Analyze this log entry and assign relevant tags that categorize it.
Select from ONLY these available tags: {tags_str}

You may select 1-3 tags. If none of the available tags are appropriate, return an empty array.

Log ID: {log_id}
Input: {message}
Output: {output}

Return ONLY a JSON array of tags, like: ["tag1", "tag2"] or []
"""

    try:
        response = client.invoke(prompt)
        response_text = response.content.strip()

        # Parse JSON response
        try:
            tags = json.loads(response_text)
        except json.JSONDecodeError as e:
            logger.warning("invalid_claude_json", error=str(e), log_id=log_id)
            return []

        if isinstance(tags, list):
            # Validate that returned tags are in available_tags
            return [str(t).strip() for t in tags if str(t).strip() in available_tags]
        else:
            logger.warning("invalid_claude_response_type", response_type=type(tags).__name__, log_id=log_id)
            return []

    except Exception as e:
        logger.error("claude_tagging_error", error=str(e), log_id=log_id)
        return []


def tag_all_logs(logs, available_tags):
    """
    Step 4: Tag ALL logs using Claude with the filtered available tags.

    Args:
        logs: List of ALL log entries
        available_tags: List of valid tag names (filtered to "dataset-tagging" tags)

    Returns:
        List of logs with 'relevant_tags' field added
    """
    if not logs:
        logger.warning("no_logs_to_tag")
        return []

    logger.info("tagging_all_logs", total_logs=len(logs), available_tags_count=len(available_tags))
    client = get_claude_client()
    tagged_logs = []

    for idx, log in enumerate(logs):
        tags = tag_log_with_claude(client, log, available_tags)
        log["relevant_tags"] = tags
        tagged_logs.append(log)

        if (idx + 1) % 10 == 0:
            logger.info("tagging_progress", processed=idx + 1, total=len(logs))

    logger.info("completed_tagging", total_logs=len(tagged_logs))
    return tagged_logs


def save_tagged_logs(tagged_logs):
    """
    Step 5: Save tagged logs to shared storage.

    Args:
        tagged_logs: List of tagged log dicts
    """
    if not tagged_logs:
        logger.warning("no_tagged_logs_to_save")
        return

    os.makedirs(SHARED_STORAGE_PATH, exist_ok=True)

    try:
        with open(TAGGED_LOGS_FILE, 'w', encoding='utf-8') as f:
            for log in tagged_logs:
                f.write(json.dumps(log) + '\n')

        logger.info("saved_tagged_logs", file=TAGGED_LOGS_FILE, count=len(tagged_logs))

    except Exception as e:
        logger.error("save_failed", error=str(e), exc_info=True)
        raise


def init_step():
    """
    Init step: Steps 1-5: Filter tags, query all logs, tag them, save.
    """
    logger.info("starting_init_step")

    try:
        # Step 1: Filter tags to those with "dataset-tagging" in description
        available_tags = fetch_and_filter_tags()

        if not available_tags:
            logger.warning("no_dataset_tagging_tags_found")
            return

        # Step 2: Query ALL logs from last 24 hours (no filtering)
        logs = query_all_logs(hours=24)

        if not logs:
            logger.warning("no_logs_retrieved")
            return

        # Remove duplicates by log ID
        unique_logs = {}
        logs_without_id = 0
        for log in logs:
            log_id = log.get("id")
            if log_id:
                unique_logs[log_id] = log
            else:
                logs_without_id += 1
        if logs_without_id > 0:
            logger.warning("logs_missing_id", count=logs_without_id)
        logs = list(unique_logs.values())

        # Step 3-4: Tag all logs with Claude using filtered tags
        tagged_logs = tag_all_logs(logs, available_tags)

        # Step 5: Save tagged logs to shared storage
        save_tagged_logs(tagged_logs)

        logger.info("completed_init_step", total_tagged=len(tagged_logs))

    except Exception as e:
        logger.error("init_step_failed", error=str(e), exc_info=True)
        raise


def load_tagged_logs():
    """
    Load tagged logs from shared storage.

    Returns:
        List of tagged log dicts
    """
    if not os.path.exists(TAGGED_LOGS_FILE):
        logger.warning("no_tagged_logs_file", file=TAGGED_LOGS_FILE)
        return []

    logger.info("loading_tagged_logs", file=TAGGED_LOGS_FILE)
    logs = []

    try:
        with open(TAGGED_LOGS_FILE, 'r', encoding='utf-8') as f:
            for line in f:
                line = line.strip()
                if line:
                    logs.append(json.loads(line))

        logger.info("loaded_tagged_logs", count=len(logs))
        return logs

    except Exception as e:
        logger.error("load_tagged_logs_failed", error=str(e), exc_info=True)
        raise


def fetch_all_datasets():
    """
    Step 6: Fetch ALL datasets from Braintrust API.

    Returns:
        List of dataset dicts with metadata
    """
    logger.info("fetching_all_datasets")

    api_key = get_braintrust_api_key()
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json"
    }

    try:
        response = requests.get(
            "https://api.braintrust.dev/v1/dataset",
            headers=headers,
            timeout=30
        )
        response.raise_for_status()

        data = response.json()
        datasets = data.get("objects", [])

        logger.info("all_datasets_fetched", count=len(datasets))
        return datasets

    except requests.exceptions.RequestException as e:
        logger.error("fetch_datasets_failed", error=str(e), exc_info=True)
        raise


def extract_relevant_tags_from_description(description):
    """
    Extract relevant_tags from dataset description.

    IMPORTANT: Datasets specify which tags they accept using this pattern in their description:
    [[relevant_tags: ["tag1", "tag2", "tag3"]]]

    This method parses that pattern and returns the tags.

    Args:
        description: Dataset description string

    Returns:
        Set of tag names, or empty set if pattern not found
    """
    if not description:
        return set()

    try:
        # Find pattern [[relevant_tags: ["tag1", "tag2"]]]
        # More robust pattern: match up to first ]] to avoid nested bracket issues
        pattern = r'\[\[relevant_tags:\s*\[([^\]]*)\]\s*\]\]'
        match = re.search(pattern, description)

        if not match:
            return set()

        # Extract tags from JSON array
        tags_str = "[" + match.group(1) + "]"
        try:
            tags = json.loads(tags_str)
        except json.JSONDecodeError as e:
            logger.warning("extract_tags_json_error", description=description[:100], error=str(e))
            return set()

        if not isinstance(tags, list):
            logger.warning("extract_tags_not_list", description=description[:100], tag_type=type(tags).__name__)
            return set()

        return set(str(tag).strip() for tag in tags if tag)

    except Exception as e:
        logger.warning("extract_tags_error", description=description[:100], error=str(e))
        return set()


def filter_datasets_by_relevant_tags(datasets):
    """
    Step 6b: Filter datasets that have [[relevant_tags: [...]]] in their DESCRIPTION.

    Returns:
        Dict mapping dataset_id -> {dataset_obj, relevant_tags}
    """
    logger.info("filtering_datasets_by_relevant_tags")

    filtered = {}

    for dataset in datasets:
        # Look at dataset.description and extract the [[relevant_tags: [...]]] pattern
        relevant_tags = extract_relevant_tags_from_description(dataset.get("description", ""))

        if relevant_tags:
            filtered[dataset["id"]] = {
                "dataset": dataset,
                "relevant_tags": relevant_tags
            }

    logger.info("datasets_filtered", total=len(datasets), filtered_count=len(filtered))
    return filtered


def optimize_matching_order(logs_count, datasets_count):
    """
    Determine optimal matching strategy (leet code style optimization).

    If fewer logs, iterate logs and find matching datasets.
    If fewer datasets, iterate datasets and find matching logs.

    Args:
        logs_count: Number of logs
        datasets_count: Number of datasets

    Returns:
        "logs_first" or "datasets_first"
    """
    if logs_count <= datasets_count:
        return "logs_first"
    else:
        return "datasets_first"


def match_logs_to_datasets(logs, filtered_datasets):
    """
    Match logs to datasets based on relevant_tags.

    Optimized matching: iterate through smaller set first.

    Args:
        logs: List of tagged logs
        filtered_datasets: Dict of dataset_id -> {dataset_obj, relevant_tags}

    Returns:
        Dict mapping dataset_id -> list of logs to insert
    """
    logger.info("matching_logs_to_datasets", logs_count=len(logs), datasets_count=len(filtered_datasets))

    # Choose optimal iteration order
    strategy = optimize_matching_order(len(logs), len(filtered_datasets))

    matches = {ds_id: [] for ds_id in filtered_datasets.keys()}

    if strategy == "logs_first":
        # Iterate logs, find matching datasets
        logger.info("using_logs_first_strategy")
        for log in logs:
            log_tags = set(log.get("relevant_tags", []))

            for ds_id, ds_info in filtered_datasets.items():
                dataset_tags = ds_info["relevant_tags"]

                # Check if any log tags match dataset tags (set intersection)
                if log_tags & dataset_tags:
                    matches[ds_id].append(log)

    else:
        # Iterate datasets, find matching logs (more efficient)
        logger.info("using_datasets_first_strategy")
        log_tag_map = {}  # Map: tag -> list of logs with that tag
        for log in logs:
            for tag in log.get("relevant_tags", []):
                if tag not in log_tag_map:
                    log_tag_map[tag] = []
                log_tag_map[tag].append(log)

        for ds_id, ds_info in filtered_datasets.items():
            dataset_tags = ds_info["relevant_tags"]

            # Collect all logs that match any dataset tag (deduplicate by object identity)
            seen = set()
            matching_logs = []
            for tag in dataset_tags:
                if tag in log_tag_map:
                    for log in log_tag_map[tag]:
                        if id(log) not in seen:
                            seen.add(id(log))
                            matching_logs.append(log)

            matches[ds_id] = matching_logs

    logger.info("matching_complete", total_matches=sum(len(v) for v in matches.values()))
    return matches


def get_existing_log_ids_in_dataset(dataset):
    """
    Query Braintrust dataset to get IDs of logs already inserted.

    Args:
        dataset: Braintrust dataset instance

    Returns:
        Set of log IDs that already exist in the dataset
    """
    try:
        existing_ids = set()

        for row in dataset:
            log_id = row.get("id") or (row.get("input", {}).get("id") if isinstance(row.get("input"), dict) else None)
            if log_id:
                existing_ids.add(str(log_id))

        return existing_ids

    except Exception as e:
        logger.warning("query_dataset_logs_error", error=str(e))
        return set()


def push_logs_to_dataset(dataset, logs):
    """
    Push logs to a single dataset, deduplicating against existing records.

    Args:
        dataset: Braintrust dataset instance
        logs: List of logs to insert

    Returns:
        (inserted_count, skipped_count)

    Raises:
        RuntimeError: If insertion failures exceed 10% of logs
    """
    if not logs:
        return 0, 0

    inserted_count = 0
    skipped_count = 0
    failed_count = 0
    failed_ids = []

    existing_ids = get_existing_log_ids_in_dataset(dataset)

    for log in logs:
        log_id = str(log.get("id", ""))

        if not log_id:
            logger.warning("skipping_log_without_id", log_keys=list(log.keys())[:5])
            skipped_count += 1
            continue

        if log_id in existing_ids:
            skipped_count += 1
            continue

        try:
            dataset.insert(
                input=log,
                expected=None,
                metadata={
                    "relevant_tags": log.get("relevant_tags", []),
                    "timestamp": log.get("created", ""),
                }
            )
            inserted_count += 1

        except Exception as e:
            failed_count += 1
            failed_ids.append(log_id)
            logger.error("insert_log_failed", log_id=log_id, error=str(e))

    # Check for excessive failures
    total_attempted = inserted_count + failed_count
    if total_attempted > 0:
        failure_rate = failed_count / total_attempted
        if failure_rate > 0.1:  # More than 10% failure rate
            raise RuntimeError(
                f"Insertion failure rate ({failure_rate:.1%}) exceeds threshold. "
                f"Failed logs: {failed_ids[:10]}"
            )

    return inserted_count, skipped_count


def push_step():
    """
    Push step: Steps 6-8: Load logs, fetch datasets, match, and insert.
    """
    logger.info("starting_push_step")

    try:
        # Load tagged logs from shared storage
        logs = load_tagged_logs()

        if not logs:
            logger.warning("no_tagged_logs_to_push")
            return

        # Step 6: Fetch all datasets
        datasets = fetch_all_datasets()

        # Step 6b: Filter datasets by [[relevant_tags: [...]]] pattern in description
        filtered_datasets = filter_datasets_by_relevant_tags(datasets)

        if not filtered_datasets:
            logger.warning("no_datasets_with_relevant_tags")
            return

        # Step 7: Match logs to datasets based on relevant_tags
        matches = match_logs_to_datasets(logs, filtered_datasets)

        # Step 8: Insert logs to each dataset (with deduplication)
        total_inserted = 0
        total_skipped = 0
        failed_datasets = []

        for ds_id, ds_info in filtered_datasets.items():
            if ds_id not in matches or not matches[ds_id]:
                continue

            dataset_obj = ds_info["dataset"]
            logs_for_dataset = matches[ds_id]

            logger.info("pushing_to_dataset", dataset_id=ds_id, dataset_name=dataset_obj.get("name"), logs_count=len(logs_for_dataset))

            try:
                # Initialize Braintrust dataset
                dataset = braintrust.init_dataset(
                    project=dataset_obj.get("project_name", ""),
                    name=dataset_obj.get("name", "")
                )

                inserted, skipped = push_logs_to_dataset(dataset, logs_for_dataset)
                total_inserted += inserted
                total_skipped += skipped

                logger.info("dataset_push_complete", dataset_id=ds_id, inserted=inserted, skipped=skipped)

            except Exception as e:
                failed_datasets.append(ds_id)
                logger.error("dataset_push_failed", dataset_id=ds_id, error=str(e))

        logger.info("completed_push_step", total_inserted=total_inserted, total_skipped=total_skipped)

        if failed_datasets:
            raise RuntimeError(f"Push failed for {len(failed_datasets)} dataset(s): {failed_datasets}")

    except Exception as e:
        logger.error("push_step_failed", error=str(e), exc_info=True)
        raise


def main():
    if len(sys.argv) < 2:
        print("Usage: braintrust_tag_and_push.py [init|push|all]")
        print("  init - Init step: filter tags, query all logs, tag them, save")
        print("  push - Push step: load logs, fetch datasets, match, and insert")
        print("  all  - Run both steps sequentially")
        sys.exit(1)

    command = sys.argv[1].lower()

    try:
        if command == "init":
            init_step()
        elif command == "push":
            push_step()
        elif command == "all":
            init_step()
            push_step()
        else:
            print(f"Unknown command: {command}")
            sys.exit(1)

    except Exception as e:
        logger.error("execution_failed", error=str(e), exc_info=True)
        sys.exit(1)


if __name__ == "__main__":
    main()
