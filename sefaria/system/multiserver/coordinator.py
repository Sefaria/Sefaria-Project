import json
import uuid

from django.core.exceptions import MiddlewareNotUsed
from django.utils.deprecation import MiddlewareMixin

from sefaria.local_settings import MULTISERVER_ENABLED, MULTISERVER_REDIS_EVENT_CHANNEL, MULTISERVER_REDIS_CONFIRM_CHANNEL

from messaging import MessagingNode

import logging
logger = logging.getLogger("multiserver")


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
            "id": uuid.uuid4().get_hex()
        }
        msg_data = json.dumps(payload)

        import socket
        import os
        logger.warning("publish_event from {}:{} - {}".format(socket.gethostname(), os.getpid(), msg_data))

        self.redis_client.publish(MULTISERVER_REDIS_EVENT_CHANNEL, msg_data)

        # Since we are subscribed to this channel as well, throw away the message we just sent.
        # It would be nice to assume that nothing new came through in the microseconds that it took to publish ##
        # But the below should insulate against even that case ##
        popped_msg = self.pubsub.get_message()
        while popped_msg:
            if popped_msg["data"] != msg_data:
                logger.warning("Multiserver Message collision!")
                self._process_message(popped_msg)
            popped_msg = self.pubsub.get_message()

    def sync(self):
        msg = self.pubsub.get_message()
        if not msg or msg["type"] == "subscribe":
            return

        if msg["type"] != "message":
            logger.error("Surprising redis message type: {}".format(msg["type"]))

        self._process_message(msg)
        self.sync()  # While there are still live messages, keep processing them.

    def _process_message(self, msg):
        """
        :param msg: JSON encoded message.
         Expecting a message that looks like this:
         {'channel': 'msync',
          'data': {
            "obj": obj,
            "method": method,
            "args": args or [],
            "id": uuid.uuid4().get_hex()
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
        import sefaria.model.topic as topic

        import socket
        import os
        host = socket.gethostname()
        pid = os.getpid()

        data = json.loads(msg["data"])

        obj = locals()[data["obj"]]
        method = getattr(obj, data["method"])

        try:
            method(*data["args"])
            logger.error("Processing succeeded for {} on {}:{}".format(self.event_description(data), host, pid))

            confirm_msg = {
                'event_id': data["id"],
                'host': host,
                'pid': pid,
                'status': 'success'
            }

        except Exception as e:
            logger.error("Processing failed for {} on {}:{} - {}".format(self.event_description(data), host, pid, e.message))

            confirm_msg = {
                'event_id': data["id"],
                'host': host,
                'pid': pid,
                'status': 'error',
                'error': e.message
            }

        # Send confirmation
        msg_data = json.dumps(confirm_msg)
        logger.warning("Sending confirm from {}:{} - {}".format(host, pid, msg["data"]))
        self.redis_client.publish(MULTISERVER_REDIS_CONFIRM_CHANNEL, msg_data)


class MultiServerEventListenerMiddleware(object):
    delay = 0  # Will check for library updates every X requests.  0 means every request.

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
