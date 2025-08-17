#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
Script to update sheet redirects based on SHEET_REDIRECTS configuration.

This script loads all sheets in SHEET_REDIRECTS and modifies their 'redirect' property.
For each sheet, it creates or updates a 'redirect' JSON object with 'en' and 'he' properties.
"""

import django
django.setup()

from sefaria.system.database import db
from pymongo import UpdateOne
from tqdm import tqdm
import json

def update_sheet_redirects():
    """
    Update sheet redirects based on SHEET_REDIRECTS configuration.
    """
    sheet_redirects = {
		"en": {
			"215584": "https://help.sefaria.org/hc/en-us/sections/12756520483868-Text-Formatting-Accessibility",
			"218610": "https://help.sefaria.org/hc/en-us/sections/18613320256156-Translations",
			"231440": "https://help.sefaria.org/hc/en-us/categories/12756350371100-Donations",
			"210670": "https://help.sefaria.org/hc/en-us/categories/13368526623132-Getting-Started",
			"218612": "https://help.sefaria.org/hc/en-us/sections/12756518640668-How-to-Reuse-Download-and-Otherwise-Reproduce-Texts",
			"225828": "https://help.sefaria.org/hc/en-us/categories/12756353030044-Source-Sheets",
			"219447": "https://help.sefaria.org/hc/en-us/articles/18472472138652-Quick-Guide-Meet-the-Resource-Panel",
			"228381": "https://help.sefaria.org/hc/en-us/sections/12756518640668-How-to-Reuse-Download-and-Otherwise-Reproduce-Texts",
			"220945": "https://help.sefaria.org/hc/en-us/categories/19814642862876-Sefaria-s-Mobile-Apps",
			"233647": "https://help.sefaria.org/hc/en-us/sections/12756555356956-Study-and-Reference-Tools",
			"211565": "https://help.sefaria.org/hc/en-us/sections/12721846793116-How-to-Find-Texts",
			"393695": "https://help.sefaria.org/hc/en-us/categories/12756353030044-Source-Sheets",
			"429277": "https://help.sefaria.org/hc/en-us/articles/18472614956956-Quick-Guide-Meet-the-A-%D7%90-menu",
			"231377": "https://help.sefaria.org/hc/en-us/sections/20094169893276-All-About-Topics-Pages",
			"519205": "https://help.sefaria.org/hc/en-us/articles/18472576952988-Quick-Guide-Meet-the-Table-of-Contents",
			"274871": "https://help.sefaria.org/hc/en-us/sections/12756555356956-Study-and-Reference-Tools",
			"303276": "https://help.sefaria.org/hc/en-us/categories/12756351595932-Your-Account",
			"379494": "https://help.sefaria.org/hc/en-us/sections/12756538060956-Text-Specific-Special-Features",
			"359083": "https://help.sefaria.org/hc/en-us/sections/17430252462236-Managing-Your-Donation",
			"483970": "https://help.sefaria.org/hc/en-us/sections/18613320256156-Translations-and-Language-Preferences",
			"511573": "https://help.sefaria.org/hc/en-us/sections/18613320256156-Translations-and-Language-Preferences",
			"497893": "https://help.sefaria.org/hc/en-us/sections/12756555356956-Study-and-Reference-Tools",
			"477118": "https://help.sefaria.org/hc/en-us/sections/18472260943900-Sefaria-101-Quick-Guides-and-Sefaria-Basics",
			"212911": "https://help.sefaria.org/hc/en-us/sections/20094783356956-All-About-Source-Sheets",
			"529099": "https://help.sefaria.org/hc/en-us/sections/20235182393244-Sefaria-for-Google-Docs",
			"584561": "https://help.sefaria.org/hc/en-us/sections/20235182393244-Sefaria-for-Google-Docs",
		},
		"he": {
			"328503": "https://help.sefaria.org/hc/he/articles/20234245638428-%D7%9B%D7%99%D7%A6%D7%93-%D7%9C%D7%9E%D7%A6%D7%95%D7%90-%D7%9E%D7%99%D7%93%D7%A2-%D7%91%D7%99%D7%95%D7%92%D7%A8%D7%A4%D7%99-%D7%90%D7%95%D7%93%D7%95%D7%AA-%D7%93%D7%9E%D7%95%D7%99%D7%95%D7%AA-%D7%9E%D7%94%D7%AA%D7%9C%D7%9E%D7%95%D7%93",
			"243658": "https://help.sefaria.org/hc/he/categories/19814642862876-%D7%94%D7%A9%D7%99%D7%9E%D7%95%D7%A9-%D7%91%D7%99%D7%99%D7%A9%D7%95%D7%9E%D7%95%D7%9F-%D7%A1%D7%A4%D7%A8%D7%99%D7%90",
			"241176": "https://help.sefaria.org/hc/he/sections/12756518640668-%D7%A9%D7%97%D7%96%D7%95%D7%A8-%D7%94%D7%93%D7%A4%D7%A1%D7%94-%D7%95%D7%94%D7%A4%D7%A6%D7%AA-%D7%9E%D7%A7%D7%95%D7%A8%D7%95%D7%AA",
			"288330": "https://help.sefaria.org/hc/he/sections/12756518640668-%D7%A9%D7%97%D7%96%D7%95%D7%A8-%D7%94%D7%93%D7%A4%D7%A1%D7%94-%D7%95%D7%94%D7%A4%D7%A6%D7%AA-%D7%9E%D7%A7%D7%95%D7%A8%D7%95%D7%AA",
			"399333": "https://help.sefaria.org/hc/he/sections/20094783356956-%D7%99%D7%A6%D7%99%D7%A8%D7%AA-%D7%93%D7%A4%D7%99-%D7%9E%D7%A7%D7%95%D7%A8%D7%95%D7%AA-%D7%91%D7%A1%D7%A4%D7%A8%D7%99%D7%90",
			"242573": "https://help.sefaria.org/hc/he/articles/18490652948508-%D7%9B%D7%99%D7%A6%D7%93-%D7%9C%D7%94%D7%93%D7%A4%D7%99%D7%A1-%D7%9E%D7%A7%D7%95%D7%A8%D7%95%D7%AA-%D7%9E%D7%94%D7%A1%D7%A4%D7%A8%D7%99%D7%99%D7%94",
			"244351": "https://help.sefaria.org/hc/he/sections/12721846793116-%D7%92%D7%99%D7%A9%D7%94-%D7%9C%D7%9E%D7%A7%D7%95%D7%A8%D7%95%D7%AA",
			"615752": "https://help.sefaria.org/hc/he/sections/12756520483868-%D7%90%D7%A4%D7%A9%D7%A8%D7%95%D7%99%D7%95%D7%AA-%D7%A4%D7%95%D7%A8%D7%9E%D7%98-%D7%98%D7%A7%D7%A1%D7%98-%D7%95%D7%A0%D7%92%D7%99%D7%A9%D7%95%D7%AA",
			"239441": "https://help.sefaria.org/hc/he/sections/12756520483868-%D7%90%D7%A4%D7%A9%D7%A8%D7%95%D7%99%D7%95%D7%AA-%D7%A4%D7%95%D7%A8%D7%9E%D7%98-%D7%98%D7%A7%D7%A1%D7%98-%D7%95%D7%A0%D7%92%D7%99%D7%A9%D7%95%D7%AA",
			"288327": "https://help.sefaria.org/hc/he/articles/18472472138652-%D7%9E%D7%93%D7%A8%D7%99%D7%9A-%D7%9E%D7%94%D7%99%D7%A8-%D7%94%D7%9B%D7%99%D7%A8%D7%95-%D7%90%D7%AA-%D7%A1%D7%A8%D7%92%D7%9C-%D7%94%D7%A7%D7%99%D7%A9%D7%95%D7%A8%D7%99%D7%9D-%D7%95%D7%94%D7%9B%D7%9C%D7%99%D7%9D",
			"569973": "https://help.sefaria.org/hc/he/sections/20235182393244-%D7%AA%D7%95%D7%A1%D7%A3-%D7%A1%D7%A4%D7%A8%D7%99%D7%90-%D7%9C-Google-Docs",
			"382833": "https://help.sefaria.org/hc/he/sections/12756538060956-%D7%A4%D7%99%D7%A6-%D7%A8%D7%99%D7%9D-%D7%9C%D7%A9%D7%99%D7%9E%D7%95%D7%A9-%D7%A2%D7%9D-%D7%9E%D7%A7%D7%95%D7%A8%D7%95%D7%AA-%D7%9E%D7%A1%D7%95%D7%99%D7%9E%D7%99%D7%9D",
			"332893": "https://help.sefaria.org/hc/he/articles/18472380899484-%D7%9E%D7%93%D7%A8%D7%99%D7%9A-%D7%9E%D7%94%D7%99%D7%A8-%D7%94%D7%9B%D7%99%D7%A8%D7%95-%D7%90%D7%AA-%D7%A2%D7%9E%D7%95%D7%93-%D7%94%D7%91%D7%99%D7%AA",
			"242826": "https://help.sefaria.org/hc/he/articles/18613227644316-%D7%9B%D7%99%D7%A6%D7%93-%D7%9C%D7%90%D7%AA%D7%A8-%D7%9E%D7%A7%D7%95%D7%A8%D7%95%D7%AA-%D7%9E%D7%A7%D7%95%D7%A9%D7%A8%D7%99%D7%9D",
			"239814": "https://help.sefaria.org/hc/he/categories/12721826687772-%D7%94%D7%A9%D7%99%D7%9E%D7%95%D7%A9-%D7%91%D7%A1%D7%A4%D7%A8%D7%99%D7%90",
			"293375": "https://help.sefaria.org/hc/he/categories/20332917021212-%D7%99%D7%A6%D7%99%D7%A8%D7%AA-%D7%93%D7%A4%D7%99-%D7%9E%D7%A7%D7%95%D7%A8%D7%95%D7%AA-%D7%95%D7%A9%D7%99%D7%9E%D7%95%D7%A9-%D7%91%D7%AA%D7%95%D7%A1%D7%A4%D7%99%D7%9D-%D7%9C%D7%93%D7%A4%D7%93%D7%A4%D7%9F",
			"288326": "https://help.sefaria.org/hc/he/sections/12756555356956-%D7%9B%D7%9C%D7%99%D7%9D-%D7%9C%D7%9C%D7%99%D7%9E%D7%95%D7%93-%D7%91%D7%A1%D7%A4%D7%A8%D7%99%D7%90",
		}
	}
    
    # Collect all sheet IDs that need to be updated
    all_sheet_ids = set()
    for lang, redirects in sheet_redirects.items():
        all_sheet_ids.update(redirects.keys())
    
    print(f"Found {len(all_sheet_ids)} unique sheet IDs to process")
    
    # Process each sheet ID
    updates = []
    processed_count = 0
    not_found_count = 0
    
    for sheet_id in tqdm(all_sheet_ids, desc="Processing sheets"):
        # Find the sheet in the database
        sheet = db.sheets.find_one({"id": int(sheet_id)})
        
        if not sheet:
            print(f"Warning: Sheet with ID {sheet_id} not found in database")
            not_found_count += 1
            continue
        
        # Initialize redirect object if it doesn't exist
        if "redirect" not in sheet:
            sheet["redirect"] = {"en": "", "he": ""}
        elif not isinstance(sheet["redirect"], dict):
            # If redirect exists but is not a dict, initialize it
            sheet["redirect"] = {"en": "", "he": ""}
        else:
            # Ensure both 'en' and 'he' properties exist
            if "en" not in sheet["redirect"]:
                sheet["redirect"]["en"] = ""
            if "he" not in sheet["redirect"]:
                sheet["redirect"]["he"] = ""
        
        # Update redirect URLs for each language
        for lang, redirects in sheet_redirects.items():
            if sheet_id in redirects:
                sheet["redirect"][lang] = redirects[sheet_id]
        
        # Prepare update operation
        updates.append(
            UpdateOne(
                {"id": int(sheet_id)},
                {"$set": {"redirect": sheet["redirect"]}}
            )
        )
        
        processed_count += 1
    
    # Execute bulk updates
    if updates:
        print(f"Executing {len(updates)} database updates...")
        result = db.sheets.bulk_write(updates, ordered=False)
        print(f"Successfully updated {result.modified_count} sheets")
        print(f"Processed {processed_count} sheets")
        print(f"Not found: {not_found_count} sheets")
    else:
        print("No updates to perform")

def main():
    """
    Main function to run the sheet redirect update.
    """
    print("Starting sheet redirect update...")
    update_sheet_redirects()
    print("Sheet redirect update completed!")

if __name__ == "__main__":
    main() 