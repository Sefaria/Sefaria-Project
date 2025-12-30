#!/usr/bin/env python
# -*- coding: utf-8 -*-

"""
Script to remove two specific Bomberg manuscript pages and adjust subsequent page numbers.
Removes pages 161 and 162, then renumbers subsequent images by -2.
"""

import django
django.setup()

from sefaria.model.manuscript import ManuscriptPageSet, ManuscriptPage
from sefaria.system.database import db
from google.cloud import storage
import re

BUCKET_NAME = 'manuscripts.sefaria.org'
STORAGE_CLIENT = storage.Client(project="production-deployment")

def rename_gcs_file(old_filename, new_filename, dry_run=True):
    """
    Rename a file in Google Cloud Storage
    """
    bucket = STORAGE_CLIENT.get_bucket(BUCKET_NAME)
    blob = bucket.blob(old_filename)

    if dry_run:
        print(f"  [DRY RUN] Would rename: {old_filename} -> {new_filename}")
    else:
        bucket.rename_blob(blob, new_filename)
        print(f"  Renamed: {old_filename} -> {new_filename}")

def extract_number_from_url(url):
    """
    Extract the number from a URL like 'https://manuscripts.sefaria.org/bomberg/masekhet_20_0161.jpg'
    Returns 161
    """
    match = re.search(r'masekhet_20_(\d+)\.jpg$', url)
    if match:
        return int(match.group(1))
    return None

def create_new_url(url, new_number):
    """
    Replace the number in the URL with a new number
    """
    return re.sub(r'masekhet_20_\d+\.jpg$', f'masekhet_20_{new_number:04d}.jpg', url)

def fix_bomberg_eruvin_pages(dry_run=True):
    """
    Renumber images starting from 163 down by 2.
    This will overwrite 161 and 162 with what used to be 163 and 164.
    """

    manuscript_slug = "bomberg-(venice)-pressing-(1523-ce)"

    print("=" * 80)
    if dry_run:
        print("DRY RUN MODE - No changes will be made")
    else:
        print("LIVE MODE - Changes will be made!")
    print("=" * 80)

    # Step 1: Get all pages for this manuscript that match the pattern
    all_pages = ManuscriptPageSet({
        "manuscript_slug": manuscript_slug,
        "image_url": {"$regex": "masekhet_20_\\d+\\.jpg$"}
    })

    print(f"\nFound {all_pages.count()} pages matching pattern for {manuscript_slug}")

    # Step 2: Find all pages numbered 163 and above to renumber
    pages_to_renumber = []

    for page in all_pages:
        img_num = extract_number_from_url(page.image_url)
        if img_num and img_num >= 163:
            pages_to_renumber.append(page)

    # Sort pages to renumber in FORWARD order (lowest numbers first)
    # This way 163 -> 161 happens first and overwrites the old 161
    pages_to_renumber.sort(key=lambda p: extract_number_from_url(p.image_url))

    print(f"\nFound {len(pages_to_renumber)} pages to renumber (numbers >= 163)")
    print(f"First page to renumber: {extract_number_from_url(pages_to_renumber[0].image_url) if pages_to_renumber else 'N/A'}")
    print(f"Last page to renumber: {extract_number_from_url(pages_to_renumber[-1].image_url) if pages_to_renumber else 'N/A'}")

    # Step 3: Rename files in Google Cloud Storage and update database records
    print("\n" + "=" * 80)
    print("STEP: Rename image files in GCS and update database URLs")
    print("=" * 80)
    print("Note: Renaming 163->161 will overwrite the old 161 file")
    print("Note: Renaming 164->162 will overwrite the old 162 file")

    for i, page in enumerate(pages_to_renumber, 1):
        old_img_num = extract_number_from_url(page.image_url)
        new_img_num = old_img_num - 2

        old_image_url = page.image_url
        new_image_url = create_new_url(old_image_url, new_img_num)

        old_thumbnail_url = page.thumbnail_url
        new_thumbnail_url = create_new_url(old_thumbnail_url, new_img_num)

        # Extract just the filename from the full URL for GCS operations
        old_image_filename = old_image_url.replace('https://manuscripts.sefaria.org/', '')
        new_image_filename = new_image_url.replace('https://manuscripts.sefaria.org/', '')
        old_thumbnail_filename = old_thumbnail_url.replace('https://manuscripts.sefaria.org/', '')
        new_thumbnail_filename = new_thumbnail_url.replace('https://manuscripts.sefaria.org/', '')

        print(f"\n[{i}/{len(pages_to_renumber)}] Page {old_img_num} -> {new_img_num}:")

        # Rename the image file in GCS
        rename_gcs_file(old_image_filename, new_image_filename, dry_run)

        # Rename the thumbnail file in GCS
        rename_gcs_file(old_thumbnail_filename, new_thumbnail_filename, dry_run)

        # Update the database record
        if dry_run:
            print(f"  [DRY RUN] Would update database record with new URLs")
        else:
            db.manuscript_pages.update_one(
                {"_id": page._id},
                {"$set": {
                    "image_url": new_image_url,
                    "thumbnail_url": new_thumbnail_url
                }}
            )
            print(f"  Updated database record with new URLs")

        if i % 10 == 0:
            print(f"\nProgress: {i}/{len(pages_to_renumber)} pages processed")

    print("\n" + "=" * 80)
    print("SUMMARY")
    print("=" * 80)
    print(f"  - Renamed {len(pages_to_renumber)} image files in GCS (starting from 163)")
    print(f"  - Updated {len(pages_to_renumber)} database records")
    print(f"  - Old files 161 and 162 were overwritten by 163 and 164")
    if dry_run:
        print("\nThis was a DRY RUN. To apply changes, run with dry_run=False")
    else:
        print("\nAll changes have been applied successfully!")

if __name__ == "__main__":
    # First run in dry-run mode to see what would happen
    # fix_bomberg_eruvin_pages(dry_run=True)

    # Uncomment the line below to actually apply the changes
    fix_bomberg_eruvin_pages(dry_run=False)
