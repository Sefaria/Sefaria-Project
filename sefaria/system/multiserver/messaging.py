import time
import redis
from sefaria.settings import MULTISERVER_REDIS_SERVER, MULTISERVER_REDIS_PORT, MULTISERVER_REDIS_DB

import structlog
logger = structlog.get_logger(__name__)


class MessagingNode(object):
    subscription_channels = []
    # Bare TCP connects with no timeout can hang far longer than this on a silently-dropped
    # connection (e.g. a security group eating packets rather than refusing them) - bound it,
    # and back off between retries so a persistently unreachable Redis doesn't add this delay
    # to every caller (e.g. a Celery task_prerun hook firing before every task).
    CONNECT_TIMEOUT_SECONDS = 2
    RECONNECT_BACKOFF_SECONDS = 30

    def connect(self):
        logger.info("Initializing {} with subscriptions: {}".format(self.__class__.__name__, self.subscription_channels))
        self._last_connect_attempt = time.time()
        try:
            self.redis_client = redis.StrictRedis(
                host=MULTISERVER_REDIS_SERVER, port=MULTISERVER_REDIS_PORT, db=MULTISERVER_REDIS_DB,
                decode_responses=True, encoding="utf-8",
                socket_connect_timeout=self.CONNECT_TIMEOUT_SECONDS, socket_timeout=self.CONNECT_TIMEOUT_SECONDS,
            )
            self.pubsub = self.redis_client.pubsub()
            if len(self.subscription_channels):
                self.pubsub.subscribe(*self.subscription_channels)
                time.sleep(0.2)
                for _ in self.subscription_channels:
                    self._pop_subscription_msg()
        except Exception:
            logger.error("Failed to establish connection to Redis")
            # Leave nothing half-initialized: _check_initialization() only retries when these
            # are unset, so a failure partway through (e.g. client built but subscribe timed
            # out) must not look like a successful connect to future callers.
            self.redis_client = None
            self.pubsub = None

    def _pop_subscription_msg(self):
        m = self.pubsub.get_message()
        if not m:
            logger.error("No subscribe message found")
        elif m["type"] != "subscribe":
            logger.error("Expecting subscribe message, found: {}".format(m))

    def _check_initialization(self):
        if getattr(self, "redis_client", None) and getattr(self, "pubsub", None):
            return
        if time.time() - getattr(self, "_last_connect_attempt", 0) < self.RECONNECT_BACKOFF_SECONDS:
            return
        self.connect()

    @staticmethod
    def event_description(data):
        return "{}.{}({}) [{}]".format(data["obj"], data["method"], str(data["args"]), data["id"])