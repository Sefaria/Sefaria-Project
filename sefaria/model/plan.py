from sefaria.system.database import db
from bson import ObjectId
from sefaria.model import *
from sefaria.model.abstract import AbstractMongoRecord, AbstractMongoSet
from sefaria.system.exceptions import InputError
from datetime import datetime

class Plan:
    collection = 'plans'

    def __init__(self, attrs=None):
        self._id = None
        self.title = ""
        self.categories = []
        self.description = ""
        self.image = ""
        self.total_days = 0
        self.content = {}  # Will store {day_number: sheet_id} mapping
        self.sheet_contents = {}  # Cache for sheet data
        
        if attrs:
            self.load_from_dict(attrs)

    def load_from_dict(self, d):
        for key, value in d.items():
            setattr(self, key, value)
        self.content = {day: int(info['sheet_id']) for day, info in d.get('content', {}).items()}
        return self

    def load(self, query):
        obj = db[self.collection].find_one(query)
        if obj:
            return self.load_from_dict(obj)
        return None

    def contents(self):
        base_content = {
            "id": str(self._id),
            "title": self.title,
            "categories": self.categories,
            "description": self.description,
            "image": self.image,
            "total_days": self.total_days,
        }
        
        # For the plan overview, just return the sheet IDs
        if self.title == "Mindful Healing After Loss":
            base_content["content"] = self.content
        else:
            base_content["content"] = self.content
            
        return base_content

    def get_day_content(self, day_number):
        """Get the sheet content for a specific day"""
        from sefaria.sheets import get_sheet_for_panel
        
        day_key = f"day {day_number}"
        if day_key not in self.content:
            return None
            
        sheet_id = self.content[day_key]
        if day_key not in self.sheet_contents:
            try:
                self.sheet_contents[day_key] = get_sheet_for_panel(sheet_id)
            except Exception as e:
                return None
                
        return self.sheet_contents[day_key]

class PlanSet:
    def __init__(self, query=None):
        self.query = query or {}
        
    def contents(self):
        plans = []
        for obj in db['plans'].find(self.query):
            plan = Plan(obj)
            plans.append(plan.contents())
        return plans

    @classmethod
    def get_all_plans(cls):
        return cls().array()

    @classmethod
    def get_plan_by_id(cls, plan_id):
        return cls().filter({"id": plan_id}).first() 