"""
notifications.py - handle user event notifications

Writes to MongoDB Collection: notifications
"""
import copy
from datetime import datetime
import simplejson as json
from bson.objectid import ObjectId

from texts import db


class Notification:
	def __init__(self, uid=None, date=None, obj=None, _id=None):
		if uid:
			# create a new notification for uid
			self.uid  = uid
			self.date = date or datetime.now()
			self.read = False
			self.type = "unset"
		elif obj:
			# load an existing notification from a dictionary
			self.__dict__.update(obj)
		elif _id:
			# look up notifications by _id from db
			if isinstance(_id, basestring):
				# allow _id as either string or ObjectId
				_id = ObjectId(_id)
			notification = db.notifications.find_one({"_id":_id})
			if notification:
				self.__init__(obj=notification)

	def mark_read(self):
		self.read = True
		return self

	def save(self):
		db.notifications.save(self.__dict__)
		return self

	def toJSON(self):
		notification = copy.deepcopy(self.__dict__)
		if "_id" in notification:
			notification["_id"] = self.id
		notification["date"] = notification["date"].isoformat()	
	
		return json.dumps(notification)

	def toHTML(self):
		pass

	@property
	def id(self):
		return str(self._id)


class NotificationSet:
	def __init__(self):
		self.notifications = []

	def from_query(self, query, limit=None, page=0):
		notifications = db.notifications.find(query)
		if page:  notifications = notifications.skip(page*limit)
		if limit: notifications = notifications.limit(limit)
		for notification in notifications:
			self.notifications.append(Notification(obj=notification))
		return self

	def unread_for_user(self, uid):
		self.from_query({"uid":uid, "read":False})
		return self

	def recent_for_user(self, uid, limit=10, page=0):
		self.from_query({"uid": uid}, limit=limit, page=page)
		return self

	def count(self):
		return len(self.notifications)

	def toJSON(self):
		return "[%s]" % ", ".join(map(self.notifications, json.dumps))

	def toHTML(self):
		pass


