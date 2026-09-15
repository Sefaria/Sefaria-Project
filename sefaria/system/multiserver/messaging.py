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
        """
        (Re)build the connection used for one-off operations: publish_event()'s publish,
        sync()'s non-blocking get_message() poll, and _process_message()'s confirm publish.
        socket_timeout=CONNECT_TIMEOUT_SECONDS is correct here -- every caller either doesn't
        block on the socket at all (get_message() checks can_read(timeout=0) first) or is a
        single request/response that should fail fast.

        Deliberately NOT used for ServerCoordinator's background listener thread -- see
        connect_listener() below.
        """
        self._last_connect_attempt = time.time()
        try:
            self.redis_client, self.pubsub = self._new_connection(self.CONNECT_TIMEOUT_SECONDS)
        except Exception:
            logger.error("Failed to establish connection to Redis")
            # Leave nothing half-initialized: _check_initialization() only retries when these
            # are unset, so a failure partway through (e.g. client built but subscribe timed
            # out) must not look like a successful connect to future callers.
            self.redis_client = None
            self.pubsub = None

    def connect_listener(self):
        """
        (Re)build a second, independent connection dedicated to a long-lived blocking
        pubsub.listen() loop (ServerCoordinator._listener_loop). This must NOT reuse connect()'s
        client/pubsub or its CONNECT_TIMEOUT_SECONDS socket_timeout:

        listen() does a genuinely blocking socket read, unlike get_message()'s non-blocking
        poll. With a short socket_timeout, any CONNECT_TIMEOUT_SECONDS of silence on the channel
        (completely normal -- multiserver events are infrequent) raises redis.exceptions.
        TimeoutError, which looks exactly like a dead connection to the caller. That was caught
        by _listener_loop's `except Exception`, torn down, and left to sit through a full
        RECONNECT_BACKOFF_SECONDS before reconnecting -- so the listener was actually capable of
        receiving an event only during the ~CONNECT_TIMEOUT_SECONDS right after each reconnect,
        i.e. a small fraction of the time, silently. socket_timeout=None here lets an idle
        listen() block indefinitely, as intended; a real disconnect still surfaces as
        ConnectionError from the socket layer and is handled the same way.

        Kept as separate state (_listener_redis_client / _listener_pubsub /
        _last_listener_connect_attempt) rather than sharing connect()'s redis_client/pubsub, so
        the two are independent failure domains: a listener-side reconnect never tears down the
        connection MultiServerEventListenerMiddleware's sync() poll depends on (the documented
        "zero-cost fallback" if the listener thread ever dies), and vice versa.
        """
        self._last_listener_connect_attempt = time.time()
        try:
            self._listener_redis_client, self._listener_pubsub = self._new_connection(None)
        except Exception:
            logger.error("Failed to establish listener connection to Redis")
            self._listener_redis_client = None
            self._listener_pubsub = None

    def _new_connection(self, socket_timeout):
        logger.info("Initializing {} at {}:{}/{} with subscriptions: {} (socket_timeout={})".format(
            self.__class__.__name__, MULTISERVER_REDIS_SERVER, MULTISERVER_REDIS_PORT, MULTISERVER_REDIS_DB,
            self.subscription_channels, socket_timeout
        ))
        client = redis.StrictRedis(
            host=MULTISERVER_REDIS_SERVER, port=MULTISERVER_REDIS_PORT, db=MULTISERVER_REDIS_DB,
            decode_responses=True, encoding="utf-8",
            socket_connect_timeout=self.CONNECT_TIMEOUT_SECONDS, socket_timeout=socket_timeout,
        )
        pubsub = client.pubsub()
        if len(self.subscription_channels):
            pubsub.subscribe(*self.subscription_channels)
            time.sleep(0.2)
            for _ in self.subscription_channels:
                self._pop_subscription_msg(pubsub)
        return client, pubsub

    def _pop_subscription_msg(self, pubsub):
        m = pubsub.get_message()
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

    def _check_listener_initialization(self):
        if getattr(self, "_listener_redis_client", None) and getattr(self, "_listener_pubsub", None):
            return
        if time.time() - getattr(self, "_last_listener_connect_attempt", 0) < self.RECONNECT_BACKOFF_SECONDS:
            return
        self.connect_listener()

    @staticmethod
    def event_description(data):
        return "{}.{}({}) [{}]".format(data["obj"], data["method"], str(data["args"]), data["id"])
