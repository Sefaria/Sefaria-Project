import json
import threading
import time
import uuid

from django.core.exceptions import MiddlewareNotUsed

from sefaria.settings import MULTISERVER_ENABLED, MULTISERVER_REDIS_EVENT_CHANNEL, MULTISERVER_REDIS_CONFIRM_CHANNEL

from .messaging import MessagingNode

import structlog
logger = structlog.get_logger(__name__)

# Guards the dispatch of a multiserver-applied method (library.rebuild, refresh_index_record_in_cache,
# etc.) against overlapping callers within one process -- e.g. the background listener thread
# (ServerCoordinator.start_background_listener) and a middleware-triggered sync() on a request thread
# both draining the same pubsub connection. Held only around the method call itself, never around
# reads, so normal hot-path cache lookups pay no locking cost.
_CACHE_MUTATION_LOCK = threading.Lock()


class ServerCoordinator(MessagingNode):
    """
    Runs on each instance of the server.
    publish_event() - Used for publishing events to other servers
    sync() - used for listening for events. Invoked periodically from MultiServerEventListenerMiddleware
    """
    subscription_channels = [MULTISERVER_REDIS_EVENT_CHANNEL]

    def publish_event(self, obj, method, args = None):
        """

        :param obj:
        :param method:
        :param args:
        :return:
        """
        # Check to see if there's any messages in the queue before pushing/popping a new one.
        ## Edge case - needs thought - does the order of operations make for trouble in this case?##
        self.sync()

        payload = {
            "obj": obj,
            "method": method,
            "args": args or [],
            "id": uuid.uuid4().hex
        }
        msg_data = json.dumps(payload)

        import socket
        import os
        logger.info("publish_event from {}:{} - {}".format(socket.gethostname(), os.getpid(), msg_data))
        try:
            self.redis_client.publish(MULTISERVER_REDIS_EVENT_CHANNEL, msg_data)
        except Exception:
            logger.error("Failed to connect to Redis instance while doing message publish.")
            return

        # Since we are subscribed to this channel as well, throw away the message we just sent.
        # It would be nice to assume that nothing new came through in the microseconds that it took to publish ##
        # But the below should insulate against even that case ##
        try:
            popped_msg = self.pubsub.get_message()
        except Exception:
            logger.error("Failed to connect to Redis instance while doing message publish listen.")
            popped_msg = None

        while popped_msg:
            if popped_msg["data"] != msg_data:
                logger.warning("Multiserver Message collision!")
                self._process_message(popped_msg)
            try:
                popped_msg = self.pubsub.get_message()
            except Exception:
                logger.error("Failed to connect to Redis instance while doing message publish listen.")
                popped_msg = None

    def sync(self):
        self._check_initialization()
        try:
            msg = self.pubsub.get_message()
        except Exception:
            logger.error("Failed to connect to Redis instance while doing multiserver sync.")
            return
        if not msg or msg["type"] == "subscribe":
            return

        if msg["type"] != "message":
            logger.error("Surprising redis message type: {}".format(msg["type"]))

        self._process_message(msg)
        self.sync()  # While there are still live messages, keep processing them.

    def start_background_listener(self):
        """
        Start a persistent daemon thread that blocks on the multiserver pubsub connection and
        applies events as they arrive, instead of waiting for MultiServerEventListenerMiddleware's
        every-20th-request poll. Idempotent -- safe to call more than once (e.g. a re-entrant
        post_fork hook) since it's a no-op if a listener thread is already running.

        Must only be started from a place that runs after this process's own connect() -- i.e.
        gunicorn's post_fork hook, never from code that can run before fork (see the module docs
        in reader/startup.py / gunicorn.conf.py about the pre-fork-connection hazard this avoids).
        """
        if getattr(self, "_listener_thread", None) and self._listener_thread.is_alive():
            return
        self._listener_thread = threading.Thread(
            target=self._listener_loop, name="multiserver-listener", daemon=True
        )
        self._listener_thread.start()

    def _listener_loop(self):
        """
        Blocking loop: waits on the pubsub connection and applies each event as it arrives, self-
        healing on any connection failure. Runs for the life of the process. `pubsub.listen()`
        raises out of its generator when the connection drops, which the outer except catches --
        clearing the (now-dead) client/pubsub so the next _check_initialization() call reconnects,
        same backoff as every other caller of this class.
        """
        while True:
            try:
                self._check_initialization()
                if not self.pubsub:
                    time.sleep(self.RECONNECT_BACKOFF_SECONDS)
                    continue
                for message in self.pubsub.listen():
                    self._listener_heartbeat = time.time()
                    if message["type"] == "message":
                        self._process_message(message)
            except Exception:
                logger.exception("multiserver_listener:crashed_reconnecting")
                self.redis_client = None
                self.pubsub = None
                time.sleep(self.RECONNECT_BACKOFF_SECONDS)

    def _process_message(self, msg):
        """
        :param msg: JSON encoded message.
         Expecting a message that looks like this:
         {'channel': 'msync',
          'data': {
            "obj": obj,
            "method": method,
            "args": args or [],
            "id": uuid.uuid4().hex
          }
          'pattern': None,
          'type': 'message',
         }

        :return:
        """


        # A list of all of the objects that be referenced
        from sefaria.model import library
        import sefaria.system.cache as scache
        import sefaria.model.text as text
        from sefaria.system.cache import in_memory_cache

        import socket
        import os
        host = socket.gethostname()
        pid = os.getpid()

        data = json.loads(msg["data"])

        obj = locals()[data["obj"]]
        method = getattr(obj, data["method"])

        try:
            with _CACHE_MUTATION_LOCK:
                method(*data["args"])
            logger.info("Processing succeeded for {} on {}:{}".format(self.event_description(data), host, pid))

            confirm_msg = {
                'event_id': data["id"],
                'host': host,
                'pid': pid,
                'status': 'success'
            }

        except Exception as e:
            logger.error("Processing failed for {} on {}:{} - {}".format(self.event_description(data), host, pid, str(e)))

            confirm_msg = {
                'event_id': data["id"],
                'host': host,
                'pid': pid,
                'status': 'error',
                'error': str(e)
            }

        # Send confirmation
        msg_data = json.dumps(confirm_msg)
        logger.info("Sending confirm from {}:{} - {}".format(host, pid, msg["data"]))
        try:
            self.redis_client.publish(MULTISERVER_REDIS_CONFIRM_CHANNEL, msg_data)
        except Exception:
            logger.error("Failed to connect to Redis instance while doing confirm publish")


class MultiServerEventListenerMiddleware(object):
    delay = 20  # Will check for library updates every X requests.  0 means every request.

    def __init__(self, get_response):
        self.get_response = get_response

        if not MULTISERVER_ENABLED:
            raise MiddlewareNotUsed
        self.req_counter = 0

    def __call__(self, request):
        if self.req_counter == self.delay:
            server_coordinator.sync()
            self.req_counter = 0
        else:
            self.req_counter += 1

        response = self.get_response(request)
        return response

server_coordinator = ServerCoordinator() if MULTISERVER_ENABLED else None
