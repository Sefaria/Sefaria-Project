from sefaria.model import *
from sefaria.client.util import jsonResponse
from django.views import View
from sefaria.model.plan import Plan, PlanSet
from bson import ObjectId
import logging
import re
from sefaria.system.database import db
from datetime import datetime, timedelta

logger = logging.getLogger(__name__)

class UserPlan:
    """
    UserPlan - Represents a user's progress through a learning plan
    """
    collection = 'user_plans'

    def __init__(self, attrs=None):
        """
        Initialize a UserPlan object
        :param attrs: A dictionary of attributes
        """
        self._id = None
        self.user_id = None  # Reference to user
        self.plan_id = None  # Reference to Plan
        self.started_at = datetime.now()
        self.current_day = 1  # The day the user is currently on
        self.completed_days = []  # List of completed day numbers
        self.last_activity_at = datetime.now()  # Last time user interacted with the plan
        self.is_completed = False  # Whether the user has completed the plan
        self.progress = {
            "total_days": 0,  # Total days in the plan
            "days_completed": 0,  # Number of days completed
            "days_remaining": 0,  # Number of days remaining
            "completion_percentage": 0,  # Percentage of completion
            "daily_progress": {}  # Dictionary mapping day numbers to progress info
            # Example format for daily_progress:
            # {
            #   "1": {
            #     "completed": True,
            #     "completed_at": datetime,
            #     "started_at": datetime,
            #     "timezone": "UTC" need to check whether need it or not
            #   }
            # }
        }
        self.settings = {
            "notification_enabled": True,
            "reminder_time": "07:00",
            "locale": "en"
            # "timezone": "UTC" need to check whether need it or not
        }
        
        if attrs:
            self.load_from_dict(attrs)
            
    def load_from_dict(self, d):
        """
        Load object attributes from a dictionary
        :param d: The dictionary to load from
        """
        for key, value in d.items():
            if key == 'id' or key == '_id':
                self._id = str(value)
            else:
                setattr(self, key, value)
                
        # Initialize progress object with plan details if not already set
        if self.plan_id and self.progress["total_days"] == 0:
            self._update_progress_statistics()
    
    def load(self, query):
        """
        Load the UserPlan from the database
        :param query: A dictionary of attributes to match
        :return: The loaded UserPlan object or None
        """
        obj = db[self.collection].find_one(query)
        if obj:
            self.load_from_dict(obj)
            return self
        return None
        
    def _validate(self):
        """
        Validate UserPlan data before saving
        """
        if not self.user_id:
            raise InputError("User ID is required")
        if not self.plan_id:
            raise InputError("Plan ID is required")
        
        # Check if plan exists
        plan = PlanSet().get_plan_by_id(self.plan_id)
        if not plan:
            raise InputError(f"Plan with ID {self.plan_id} does not exist")
    
    def start_plan(self, user_id, plan_id):
        """
        Start a new plan for a user
        :param user_id: The ID of the user
        :param plan_id: The ID of the plan to start
        :return: self
        """
        self.user_id = user_id
        self.plan_id = plan_id
        self.started_at = datetime.now()
        self.current_day = 1
        self.completed_days = []
        self.last_activity_at = datetime.now()
        
        plan = PlanSet().get_plan_by_id(plan_id)
        if not plan:
            raise InputError(f"Plan with ID {plan_id} does not exist")
            
        # Initialize progress with plan details
        self.progress["total_days"] = plan.total_days
        self.progress["days_remaining"] = plan.total_days
        self.progress["days_completed"] = 0
        self.progress["completion_percentage"] = 0
        
        return self
    
    def _update_progress_statistics(self):
        """
        Update progress statistics based on completed days
        """
        plan = PlanSet().get_plan_by_id(self.plan_id)
        if not plan:
            return
            
        self.progress["total_days"] = plan.total_days
        self.progress["days_completed"] = len(self.completed_days)
        self.progress["days_remaining"] = plan.total_days - len(self.completed_days)
        
        if plan.total_days > 0:
            self.progress["completion_percentage"] = (len(self.completed_days) / plan.total_days) * 100
        
        if len(self.completed_days) >= plan.total_days:
            self.is_completed = True
    
    def mark_day_complete(self, day_number):
        """
        Mark a specific day as completed
        :param day_number: The day number to mark as completed
        """
        if day_number not in self.completed_days:
            self.completed_days.append(day_number)
            
        # Update daily progress information
        if str(day_number) not in self.progress["daily_progress"]:
            self.progress["daily_progress"][str(day_number)] = {}
            
        self.progress["daily_progress"][str(day_number)].update({
            "completed": True,
            "completed_at": datetime.now()
        })
        
        # If we haven't recorded a start time, set it now
        if "started_at" not in self.progress["daily_progress"][str(day_number)]:
            self.progress["daily_progress"][str(day_number)]["started_at"] = datetime.now()
            
        # Automatically advance to next day if this was the current day
        if day_number == self.current_day and self.current_day < self.progress["total_days"]:
            self.current_day += 1
            
        self.last_activity_at = datetime.now()  
        self._update_progress_statistics()
        return self
    
    def start_day(self, day_number):
        """
        Mark that a user has started working on a specific day
        :param day_number: The day number to start
        """
        if str(day_number) not in self.progress["daily_progress"]:
            self.progress["daily_progress"][str(day_number)] = {}
            
        self.progress["daily_progress"][str(day_number)]["started_at"] = datetime.now()
        self.current_day = day_number
        self.last_activity_at = datetime.now() 
        return self
        
    def get_current_day_content(self):
        """
        Get the content for the current day
        :return: The content for the current day
        """
        plan = PlanSet().get_plan_by_id(self.plan_id)
        if not plan:
            return None
        return plan.get_day_content(self.current_day)
    
    def safe_isoformat(self, dt_value):
        """Convert datetime objects to ISO format strings, 
        or return the value unchanged if it's already a string."""
        if hasattr(dt_value, 'isoformat'):
            return dt_value.isoformat()
        return dt_value


    def get_progress_summary(self):
        """
        Get a summary of the user's progress
        :return: Dictionary with progress summary
        """
        return {
            "current_day": self.current_day,
            "total_days": self.progress["total_days"],
            "days_completed": self.progress["days_completed"],
            "days_remaining": self.progress["days_remaining"],
            "completion_percentage": self.progress["completion_percentage"],
            "started_at": self.safe_isoformat(self.started_at),
            "last_activity_at": self.safe_isoformat(self.last_activity_at),
            "is_completed": self.is_completed
        }
    
    def _saveable_attrs(self):
        """
        Get a dictionary of saveable attributes
        :return: Dictionary ready for saving to database
        """
        return {
            "_id": ObjectId(self._id) if self._id else None,
            "user_id": self.user_id,
            "plan_id": self.plan_id,
            "started_at": self.safe_isoformat(self.started_at),
            "current_day": self.current_day,
            "completed_days": self.completed_days,
            "last_activity_at": self.safe_isoformat(self.last_activity_at),
            "is_completed": self.is_completed,
            "progress": self.progress,
            "settings": self.settings
        }
    
    def save(self):
        """
        Save the UserPlan to the database
        :return: The ID of the saved UserPlan
        """
        self._validate()
        
        attrs = self._saveable_attrs()
        if attrs["_id"]:
            db[self.collection].update_one({"_id": attrs["_id"]}, {"$set": attrs})
            return self._id
        else:
            del attrs["_id"]
            result = db[self.collection].insert_one(attrs)
            self._id = str(result.inserted_id)
            return self._id
            
    def delete(self):
        """
        Delete the UserPlan from the database
        """
        if not self._id:
            raise InputError("Cannot delete UserPlan without ID")
        db[self.collection].delete_one({"_id": ObjectId(self._id)})


class UserPlanSet:
    """
    A set of UserPlans
    """
    recordClass = UserPlan
    
    def __init__(self, query=None):
        """
        Initialize a set of UserPlans
        :param query: A dictionary of query parameters
        """
        self.query = query
        self.collection = UserPlan.collection
        self.records = []
        if query:
            self._load_from_query()
        
    def _load_from_query(self):
        """
        Load UserPlans from the database matching the query
        """
        if self.query is None:
            self.query = {}
        cursor = db[self.collection].find(self.query)
        self.records = [self.recordClass(r) for r in cursor]
        return self
    
    def get_for_user(self, user_id):
        """
        Get all UserPlans for a specific user
        :param user_id: The user ID to get plans for
        :return: UserPlanSet containing user's plans
        """
        if self.query is None:
            self.query = {}
        self.query.update({"user_id": user_id})
        return self._load_from_query()
        
    def get_active_plans_for_user(self, user_id):
        """
        Get all active (non-completed) UserPlans for a specific user
        :param user_id: The user ID to get plans for
        :return: UserPlanSet containing user's active plans with associated plan data
        """
        if self.query is None:
            self.query = {}
        self.query.update({"user_id": user_id})
        
        # Load user plans using the original approach
        self._load_from_query()
        
        # Attach plan data to each UserPlan object
        user_plans = []
        for user_plan in self.records:
            # Fetch the associated plan data
            plan = PlanSet().get_plan_by_id(user_plan.plan_id)
            
            if plan:
                # Add plan title and other relevant fields directly to user_plan
                user_plan.title = plan.title if hasattr(plan, 'title') else ""
                user_plan.description = plan.description if hasattr(plan, 'description') else ""
                user_plan.categories = plan.categories if hasattr(plan, 'categories') else []
                user_plan.plan = plan  # Store full plan object for access to all fields
            user_plans.append(user_plan)
        return  user_plans
        
    def get_user_plan(self, user_id, plan_id):
        """
        Get a specific UserPlan for a user
        :param user_id: The user ID
        :param plan_id: The plan ID
        :return: UserPlan object or None
        """
        obj = db[self.collection].find_one({"user_id": user_id, "plan_id": plan_id})
        return UserPlan(obj) if obj else None
        
    def array(self):
        """
        Return list of UserPlan objects matching the query
        :return: List of UserPlan objects
        """
        self._load_from_query()
        return self.records
        
    def filter(self, query):
        """
        Add additional query parameters
        :param query: A dictionary of query parameters
        :return: self
        """
        self.query.update(query)
        return self
        
    def first(self):
        """
        Return first matching UserPlan object
        :return: UserPlan object or None
        """
        self._load_from_query()
        return self.records[0] if len(self.records) > 0 else None

# # Start a new plan for a user
# new_plan = UserPlan().start_plan(user_id="user123", plan_id="plan456")
# new_plan.save()

# # Mark a day as complete
# user_plan = UserPlanSet().get_user_plan("user123", "plan456")
# user_plan.mark_day_complete(day_number=1)
# user_plan.save()

# # Get all active plans for a user
# active_plans = UserPlanSet().get_active_plans_for_user("user123").array()

# # Get progress summary
# progress = user_plan.get_progress_summary()