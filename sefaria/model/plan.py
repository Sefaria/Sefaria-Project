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
        self.imageUrl = ""
        self.total_days = 0
        self.content = {}  # Will store {day_number: sheet_id} mapping
        self.sheet_contents = {}  # Cache for sheet data
        self.creator = None
        self.lastModified = datetime.now()
        self.listed = False
        
        if attrs:
            self.load_from_dict(attrs)

    def load_from_dict(self, d):
      
         for key, value in d.items():
             setattr(self, key, value)
             # self.content = {
             #     "day 1": 41,  # Sheet ID for Day 1
             #     "day 2": 760,  # Sheet ID for Day 2
             # }
         self.content = {day: int(info['sheet_id']) for day, info in d.get('content', {}).items()}
         return self

    def load(self, query):
        obj = db[self.collection].find_one(query)
        if obj:
            return self.load_from_dict(obj)
        return None

    def save(self):
        """Save the plan to the database"""
        if not self._validate():
            return False

        self.lastModified = datetime.now()
        
        if not self._id:  # New plan
            self._id = db[self.collection].insert_one(self._saveable_attrs()).inserted_id
        else:  # Update existing
            db[self.collection].update_one({"_id": self._id}, {"$set": self._saveable_attrs()})
        
        return True

    def _validate(self):
        """Validate plan data before saving"""
        if not self.title:
            raise InputError("Plan title cannot be empty")
        if not self.description:
            raise InputError("Plan description cannot be empty")
        if not self.categories:
            raise InputError("Plan must have at least one category")
        if self.total_days < 1:
            raise InputError("Plan must be at least 1 day long")
        if not self.creator:
            raise InputError("Plan must have a creator")
        return True

    def _saveable_attrs(self):
        """Get a dictionary of attributes for saving to the database"""
        return {
            "title": self.title,
            "categories": self.categories,
            "description": self.description,
            "imageUrl": self.imageUrl,
            "total_days": self.total_days,
            "content": self.content,
            "creator": self.creator,
            "lastModified": self.lastModified,
            "listed": self.listed
        }

    def contents(self):
        base_content = {
            "id": str(self._id),
            "title": self.title,
            "categories": self.categories,
            "description": self.description,
            "imageUrl": self.imageUrl,
            "total_days": self.total_days,
            "creator": self.creator,
            "lastModified": str(self.lastModified),
            "listed": self.listed
        }
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
            # Convert ObjectId to string before creating Plan object
            if '_id' in obj:
                obj['_id'] = str(obj['_id'])
            plan = Plan(obj)
            plans.append(plan.contents())
        return plans

    @classmethod
    def get_all_plans(cls):
        return cls().array()

    @classmethod
    def get_plan_by_id(cls, plan_id):
        try:
            # Try to convert the string ID to ObjectId
            object_id = ObjectId(plan_id)
            return cls().filter({"_id": object_id}).first()
        except Exception as e:
            # Handle invalid ObjectId format
            print(f"Error converting plan_id to ObjectId: {str(e)}")
            return None

    def array(self):
        """Return list of Plan objects matching the query"""
        return [Plan(obj) for obj in db['plans'].find(self.query)]

    def filter(self, query):
        """Add additional query parameters"""
        self.query.update(query)
        return self

    def first(self):
        """Return first matching Plan object"""
        obj = db['plans'].find_one(self.query)
        return Plan(obj) if obj else None