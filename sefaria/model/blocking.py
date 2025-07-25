"""
blocking.py - handle block relationships between users

Writes to MongoDB Collection: blocking
"""
from datetime import datetime

from sefaria.system.database import db
from sefaria.system.cache import django_cache

import structlog

logger = structlog.get_logger(__name__)


class BlockRelationship(object):
    def __init__(self, blocker=None, blockee=None):
        self.blocker = blocker
        self.blockee = blockee
        self.block_date = datetime.now()

    def exists(self):
        return bool(db.blocking.find_one({"blocker": self.blocker, "blockee": self.blockee}))

    def block(self):
        db.blocking.replace_one(
            {"blocker": self.blocker, "blockee": self.blockee},
            vars(self),
            upsert=True
        )
        return self

    def unblock(self):
        db.blocking.delete_one({"blocker": self.blocker, "blockee": self.blockee})


class BlockSet(object):
    def __init__(self):
        self.uids = []
        return self

    @property
    def count(self):
        return len(self.uids)


class BlockersSet(BlockSet):
    def __init__(self, uid):
        self.uids = db.blocking.find({"blockee": uid}).distinct("blocker")


class BlockeesSet(BlockSet):
    def __init__(self, uid):
        self.uids = db.blocking.find({"blocker": uid}).distinct("blockee")

