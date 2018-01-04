import redis
import json
from sefaria.local_settings import MULTISERVER_ENABLED, MULTISERVER_REDIS_SERVER, \
    MULTISERVER_REDIS_PORT, MULTISERVER_REDIS_DB, MULTISERVER_REDIS_CHANNEL
import logging
from django.core.exceptions import MiddlewareNotUsed

logger = logging.getLogger(__name__)


class ServerCoordinator(object):

    def __init__(self):
        self.redis_client = redis.StrictRedis(host=MULTISERVER_REDIS_SERVER, port=MULTISERVER_REDIS_PORT, db=MULTISERVER_REDIS_DB)
        self.pubsub = self.redis_client.pubsub()
        self.pubsub.subscribe(MULTISERVER_REDIS_CHANNEL)
        self.pubsub.get_message()
        """ ^ After subscribe, this will produce a message like the below.  Here, we're just popping the stack.
        {
         'channel': 'msync',
         'data': 1L,
         'pattern': None,
         'type': 'subscribe'
        }
        """

    def publish_event(self, obj, method, args):
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
            obj: obj,
            method: method,
            args: args
        }
        msg_data = json.dumps(payload)
        self.redis_client.publish(MULTISERVER_REDIS_CHANNEL, msg_data)

        # Since we are subscribed to this channel as well, throw away the message we just sent.
        # It would be nice to assume that nothing new came through in the miscroseconds that it took to publish ##
        # But the below should insulate against even that case ##
        popped_msg = self.pubsub.get_message()
        while popped_msg:
            if popped_msg["data"] != msg_data:
                logger.warning("Multiserver Message collision!")
                self._process_message(popped_msg)
            popped_msg = self.pubsub.get_message()

    def sync(self):
        msg = self.pubsub.get_message()
        if not msg:
            return
        self._process_message(msg)
        self.sync()  # While there are still live messages, keep processing them.

    def _process_message(self, msg):
        """

        :param msg: JSON encoded message.
         Expecting a message that looks like this:
         {'channel': 'msync',
          'data': '!!!!!!!!!',
          'pattern': None,
          'type': 'message'}

        :return:
        """

        # A list of all of the objects that be referenced
        from sefaria.model import library

        data = json.loads(msg["data"])
        o = locals()[data["obj"]]
        m = o.getattr(data["method"])

        # Does this need to be starred, or otherwise unpacked?
        m(data["args"])


server_coordinator = ServerCoordinator()


class MultiServerMiddleware(object):
    """
    """
    delay = 200  # Will check for library updates every X requests

    def __init__(self):
        if not MULTISERVER_ENABLED:
            raise MiddlewareNotUsed
        self.req_counter = 0

    def process_request(self, request):
        if self.req_counter == self.delay:
            server_coordinator.sync()
            self.req_counter = 0
        else:
            self.req_counter += 1

        return None