#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
Script to find and analyze sheets with slugless topics.

Usage:
    python scripts/find_slugless_topics.py [options]

Options:
    --count-only    Only show counts, don't list sheets
    --verbose       Show detailed information for each sheet
    --export-csv    Export results to CSV file
    --fix           Fix all slugless topics (requires confirmation)
"""

import sys
import os
import csv
from datetime import datetime

# Add project root to path
p = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, p)

from sefaria.system.database import db
from sefaria.sheets import update_sheet_topics


def find_sheets_with_slugless_topics():
    """
    Find all sheets that have topics without slug fields.

    Returns:
        cursor: MongoDB cursor with matching sheets
    """
    query = {
        "topics": {
            "$elemMatch": {
                "slug": {"$exists": False}
            }
        }
    }

    projection = {
        "id": 1,
        "title": 1,
        "owner": 1,
        "topics": 1,
        "dateCreated": 1,
        "dateModified": 1,
        "status": 1
    }

    return db.sheets.find(query, projection)


def count_sheets_with_slugless_topics():
    """
    Count total sheets with slugless topics.

    Returns:
        int: Number of affected sheets
    """
    query = {
        "topics": {
            "$elemMatch": {
                "slug": {"$exists": False}
            }
        }
    }

    return db.sheets.count_documents(query)


def count_total_sheets_with_topics():
    """
    Count total sheets that have any topics.

    Returns:
        int: Number of sheets with topics
    """
    query = {
        "topics": {
            "$exists": True,
            "$ne": []
        }
    }

    return db.sheets.count_documents(query)


def get_affected_users():
    """
    Get list of users who have sheets with slugless topics.

    Returns:
        list: List of dicts with user_id and sheet_count
    """
    pipeline = [
        {
            "$match": {
                "topics": {
                    "$elemMatch": {
                        "slug": {"$exists": False}
                    }
                }
            }
        },
        {
            "$group": {
                "_id": "$owner",
                "sheet_count": {"$sum": 1},
                "sheet_ids": {"$push": "$id"}
            }
        },
        {
            "$sort": {"sheet_count": -1}
        }
    ]

    return list(db.sheets.aggregate(pipeline))


def get_slugless_topics_summary():
    """
    Get summary of all slugless topics across sheets.

    Returns:
        list: List of dicts with asTyped text and count
    """
    pipeline = [
        {
            "$match": {
                "topics": {
                    "$elemMatch": {
                        "slug": {"$exists": False}
                    }
                }
            }
        },
        {
            "$unwind": "$topics"
        },
        {
            "$match": {
                "topics.slug": {"$exists": False}
            }
        },
        {
            "$group": {
                "_id": "$topics.asTyped",
                "count": {"$sum": 1},
                "sheet_ids": {"$push": "$id"}
            }
        },
        {
            "$sort": {"count": -1}
        },
        {
            "$project": {
                "_id": 0,
                "asTyped": "$_id",
                "count": 1,
                "sheet_ids": 1
            }
        }
    ]

    return list(db.sheets.aggregate(pipeline))


def print_summary():
    """Print summary statistics of the issue."""
    print("\n" + "="*70)
    print("SLUGLESS TOPICS ANALYSIS SUMMARY")
    print("="*70)

    # Overall counts
    affected_count = count_sheets_with_slugless_topics()
    total_with_topics = count_total_sheets_with_topics()
    total_sheets = db.sheets.count_documents({})

    print(f"\n📊 OVERALL STATISTICS:")
    print(f"   Total sheets in database: {total_sheets:,}")
    print(f"   Sheets with topics: {total_with_topics:,}")
    print(f"   Sheets with slugless topics: {affected_count:,}")

    if total_with_topics > 0:
        percentage = (affected_count / total_with_topics) * 100
        print(f"   Percentage affected: {percentage:.2f}%")

    # User breakdown
    print(f"\n👥 AFFECTED USERS:")
    affected_users = get_affected_users()
    print(f"   Total users affected: {len(affected_users)}")
    print(f"\n   Top 10 users by affected sheets:")
    for i, user in enumerate(affected_users[:10], 1):
        print(f"      {i}. User {user['_id']}: {user['sheet_count']} sheet(s)")

    # Topic breakdown
    print(f"\n🏷️  SLUGLESS TOPICS BREAKDOWN:")
    slugless_topics = get_slugless_topics_summary()
    print(f"   Total unique slugless topics: {len(slugless_topics)}")
    print(f"\n   Top 20 most common slugless topics:")
    for i, topic in enumerate(slugless_topics[:20], 1):
        print(f"      {i}. '{topic['asTyped']}': {topic['count']} occurrence(s)")

    print("\n" + "="*70 + "\n")


def print_detailed_list(limit=None):
    """Print detailed list of affected sheets."""
    print("\n" + "="*70)
    print("DETAILED SHEET LIST")
    print("="*70 + "\n")

    sheets = find_sheets_with_slugless_topics()

    count = 0
    for sheet in sheets:
        count += 1
        if limit and count > limit:
            print(f"\n... (showing first {limit} sheets)")
            break

        print(f"Sheet ID: {sheet['id']}")
        print(f"  Title: {sheet.get('title', 'Untitled')[:80]}")
        print(f"  Owner: {sheet['owner']}")
        print(f"  Status: {sheet.get('status', 'unknown')}")
        print(f"  Created: {sheet.get('dateCreated', 'unknown')}")
        print(f"  Modified: {sheet.get('dateModified', 'unknown')}")
        print(f"  Slugless topics:")
        for topic in sheet.get('topics', []):
            if 'slug' not in topic:
                print(f"    - asTyped: '{topic.get('asTyped', 'N/A')}'")
        print()


def export_to_csv(filename=None):
    """Export affected sheets to CSV file."""
    if not filename:
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"slugless_topics_{timestamp}.csv"

    sheets = find_sheets_with_slugless_topics()

    with open(filename, 'w', newline='', encoding='utf-8') as csvfile:
        fieldnames = ['sheet_id', 'title', 'owner', 'status', 'date_created',
                      'date_modified', 'slugless_topic_asTyped', 'url']
        writer = csv.DictWriter(csvfile, fieldnames=fieldnames)

        writer.writeheader()

        count = 0
        for sheet in sheets:
            slugless_topics = [t for t in sheet.get('topics', []) if 'slug' not in t]

            for topic in slugless_topics:
                writer.writerow({
                    'sheet_id': sheet['id'],
                    'title': sheet.get('title', 'Untitled'),
                    'owner': sheet['owner'],
                    'status': sheet.get('status', 'unknown'),
                    'date_created': sheet.get('dateCreated', ''),
                    'date_modified': sheet.get('dateModified', ''),
                    'slugless_topic_asTyped': topic.get('asTyped', ''),
                    'url': f"https://www.sefaria.org/sheets/{sheet['id']}"
                })
                count += 1

        print(f"\n✅ Exported {count} slugless topics from affected sheets to: {filename}")


def fix_all_slugless_topics(dry_run=True):
    """
    Fix all sheets with slugless topics by running them through update_sheet_topics.

    Args:
        dry_run (bool): If True, only show what would be fixed without actually fixing
    """
    affected_sheets = list(find_sheets_with_slugless_topics())
    total = len(affected_sheets)

    print(f"\n{'DRY RUN: ' if dry_run else ''}Found {total} sheet(s) to fix")

    if dry_run:
        print("\nThis is a DRY RUN. No changes will be made.")
        print("Sheets that would be fixed:")
        for sheet in affected_sheets[:10]:
            slugless = [t.get('asTyped', 'N/A') for t in sheet.get('topics', []) if 'slug' not in t]
            print(f"  Sheet {sheet['id']}: {slugless}")
        if total > 10:
            print(f"  ... and {total - 10} more")
        return

    print("\n⚠️  WARNING: This will modify sheets in the database!")
    response = input("Are you sure you want to continue? (yes/no): ")

    if response.lower() != 'yes':
        print("Aborted.")
        return

    fixed_count = 0
    error_count = 0

    print(f"\nFixing {total} sheet(s)...")

    for i, sheet in enumerate(affected_sheets, 1):
        try:
            old_topics = sheet.get('topics', [])
            # update_sheet_topics will create slugs for topics without them
            result = update_sheet_topics(sheet['id'], old_topics, [])

            if result.get('status') == 'ok':
                fixed_count += 1
                if i % 10 == 0:
                    print(f"  Progress: {i}/{total} ({(i/total)*100:.1f}%)")
            else:
                error_count += 1
                print(f"  ❌ Error fixing sheet {sheet['id']}: {result}")

        except Exception as e:
            error_count += 1
            print(f"  ❌ Exception fixing sheet {sheet['id']}: {e}")

    print(f"\n✅ Fixed: {fixed_count} sheet(s)")
    if error_count > 0:
        print(f"❌ Errors: {error_count} sheet(s)")


def main():
    """Main function to run the script."""
    import argparse

    parser = argparse.ArgumentParser(
        description='Find and analyze sheets with slugless topics'
    )
    parser.add_argument(
        '--count-only',
        action='store_true',
        help='Only show counts, don\'t list sheets'
    )
    parser.add_argument(
        '--verbose',
        action='store_true',
        help='Show detailed information for each sheet'
    )
    parser.add_argument(
        '--limit',
        type=int,
        default=None,
        help='Limit number of sheets to display in verbose mode'
    )
    parser.add_argument(
        '--export-csv',
        action='store_true',
        help='Export results to CSV file'
    )
    parser.add_argument(
        '--csv-filename',
        type=str,
        default=None,
        help='Custom filename for CSV export'
    )
    parser.add_argument(
        '--fix',
        action='store_true',
        help='Fix all slugless topics (creates slugs)'
    )
    parser.add_argument(
        '--dry-run',
        action='store_true',
        help='Dry run mode for --fix (show what would be fixed)'
    )

    args = parser.parse_args()

    # Always show summary
    print_summary()

    # Handle different modes
    if args.export_csv:
        export_to_csv(args.csv_filename)

    if args.fix:
        fix_all_slugless_topics(dry_run=args.dry_run)

    if args.verbose and not args.count_only:
        print_detailed_list(limit=args.limit)

    if not args.export_csv and not args.fix and not args.verbose:
        print("💡 TIP: Use --verbose to see detailed sheet list")
        print("💡 TIP: Use --export-csv to export to CSV file")
        print("💡 TIP: Use --fix --dry-run to see what would be fixed")
        print("💡 TIP: Use --fix to actually fix the issues")


if __name__ == "__main__":
    main()

