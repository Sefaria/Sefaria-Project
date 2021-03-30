import time
import redis
from sefaria.settings import MULTISERVER_REDIS_SERVER, MULTISERVER_REDIS_PORT, MULTISERVER_REDIS_DB

import structlog
logger = structlog.get_logger(__name__)


class MessagingNode(object):
    subscription_channels = []

    def connect(self):
        logger.info("Initializing {} with subscriptions: {}".format(self.__class__.__name__, self.subscription_channels))
        try:
            self.redis_client = redis.StrictRedis(host=MULTISERVER_REDIS_SERVER, port=MULTISERVER_REDIS_PORT, db=MULTISERVER_REDIS_DB, decode_responses=True, encoding="utf-8")
            self.pubsub = self.redis_client.pubsub()
        except Exception:
            logger.error("Failed to establish connection to Redis")
            return
        if len(self.subscription_channels):
            self.pubsub.subscribe(*self.subscription_channels)
            time.sleep(0.2)
            for _ in self.subscription_channels:
                self._pop_subscription_msg()

    def _pop_subscription_msg(self):
        m = self.pubsub.get_message()
        if not m:
            logger.error("No subscribe message found")
        elif m["type"] != "subscribe":
            logger.error("Expecting subscribe message, found: {}".format(m))

    def _check_initialization(self):
        if not getattr(self, "redis_client", None) or not getattr(self, "pubsub", None):
            self.connect()

    @staticmethod
    def event_description(data):
        return "{}.{}({}) [{}]".format(data["obj"], data["method"], str(data["args"]), data["id"])