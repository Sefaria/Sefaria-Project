"""
notifications.py - handle user event notifications

Writes to MongoDB Collection: notifications
"""
import copy
from datetime import datetime
import simplejson as json
from pprint import pprint
from bson.objectid import ObjectId

from django.template.loader import render_to_string

from texts import db


class Notification(object):
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
		db.notifications.save(vars(self))
		return self

	def toJSON(self):
		notification = copy.deepcopy(vars(self))
		if "_id" in notification:
			notification["_id"] = self.id
		notification["date"] = notification["date"].isoformat()	
	
		return json.dumps(notification)

	def toHTML(self):
		return render_to_string("elements/notification.html", {"notification": self})

	@property
	def id(self):
		return str(self._id)


class NotificationSet(object):
	def __init__(self):
		self.notifications = []

	def from_query(self, query, limit=0, page=0):
		self.notifications = []
		notifications = db.notifications.find(query).sort([["_id", -1]]).skip(page*limit).limit(limit)
		self.has_more = notifications.count() == limit 
		for notification in notifications:
			self.notifications.append(Notification(obj=notification))
		return self

	def unread_for_user(self, uid):
		return self

	def recent_for_user(self, uid, limit=10, page=0):
		self.from_query({"uid": uid}, limit=limit, page=page)
		return self

	@property
	def count(self):
		return len(self.notifications)

	@property
	def unread_count(self):
		return len([n for n in self.notifications if not n.read])

	def toJSON(self):
		return "[%s]" % ", ".join(map(self.notifications, json.dumps))

	def toHTML(self):
		html = [n.toHTML() for n in self.notifications]
		return "".join(html)


def unread_notifications_count_for_user(uid):
	"""Returns the number of unread notifcations belonging to user uid"""
	return db.notifications.find({"uid": uid, "read": False}).count()