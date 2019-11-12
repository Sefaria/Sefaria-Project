# -*- coding: utf-8 -*-
from datetime import datetime, timedelta
from collections import defaultdict

from sefaria.history import make_leaderboard
from sefaria.system.database import db

def update_top_contributors(days=None):
    """
    Calculate leaderboard scores for the past n 'days', or all time if 'days' is None.
    Store in a collection named for the length of time.
    Remove old scores.
    """

    if days:
        cutoff = datetime.now() - timedelta(days)
        #condition = { "date": { "$gt": cutoff }, "method": {"$ne": "API"} }
        condition = { "date": { "$gt": cutoff } }
        collection = "leaders_%d" % days
    else:
        cutoff = None
        #condition = { "method": {"$ne": "API"} }
        condition = {}
        collection = "leaders_alltime"

    leaders = make_leaderboard(condition)

    oldtime = datetime.now()

    # Tally points for Public Source Sheets
    query = {"status": "public" }
    if cutoff:
        query["$or"] = [
            {"dateCreated": {"$gt": cutoff.isoformat()}},
            {"datePublished": {"$gt": cutoff.isoformat()}},
        ]
    sheets = db.sheets.find(query)
    sheet_points = defaultdict(int)
    sheet_counts = defaultdict(int)
    for sheet in sheets:
        sheet_points[sheet["owner"]] += len(sheet["sources"]) * 50
        sheet_counts[sheet["owner"]] += 1

    for l in leaders:
        points = l["count"] + sheet_points[l["user"]]
        del sheet_points[l["user"]]
        if points:
            doc = {
                "_id":            l["user"],
                "count":          points,
                "translateCount": int(l["translateCount"]),
                "editCount":      int(l["editCount"]),
                "addCount":       int(l["addCount"]),
                "noteCount":      int(l["noteCount"]),
                "linkCount":      int(l["linkCount"]),
                "reviewCount":    int(l["reviewCount"]),
                "sheetCount":     sheet_counts[l["user"]],
                "texts":          sorted(l["texts"], key=lambda key: -l["texts"][key]),
                "date":           datetime.now()
                }
            db[collection].save(doc)
    
    # Add points for those who only have sheet points
    for s in list(sheet_points.items()):
        if s[1]:
            doc = {
                "_id": s[0], 
                "count": s[1],
                "sheetCount": sheet_counts[s[0]], 
                "date": datetime.now()}
            db[collection].save(doc)

    if cutoff:    
        db[collection].remove({"date": {"$lt": oldtime }})

update_top_contributors()
update_top_contributors(1)
update_top_contributors(7)
update_top_contributors(30)