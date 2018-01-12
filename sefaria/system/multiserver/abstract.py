
import redis
from sefaria.local_settings import MULTISERVER_REDIS_SERVER, MULTISERVER_REDIS_PORT, MULTISERVER_REDIS_DB
from sefaria.model import *

import logging
logger = logging.getLogger(__name__)


class MessagingNode(object):
    subscription_channels = []

    def __init__(self):
        self.redis_client = redis.StrictRedis(host=MULTISERVER_REDIS_SERVER, port=MULTISERVER_REDIS_PORT, db=MULTISERVER_REDIS_DB)
        self.pubsub = self.redis_client.pubsub()
        if len(self.subscription_channels):
            self.pubsub.subscribe(*self.subscription_channels)
            for _ in self.subscription_channels:
                self._pop_subscription_msg()

    def _pop_subscription_msg(self):
        m = self.pubsub.get_message()
        if not m:
            logger.error("No subscribe message found")
        elif m["type"] != "subscribe":
            logger.error("Expecting subscribe message, found: {}".format(m))