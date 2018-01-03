import redis
import json
from sefaria.local_settings import MULTISERVER_ENABLED, MULTISERVER_REDIS_SERVER, \
    MULTISERVER_REDIS_PORT, MULTISERVER_REDIS_DB, MULTISERVER_REDIS_CHANNEL


class ServerCoordinator(object):
    def __init__(self):
        self.redis_client = redis.StrictRedis(host=MULTISERVER_REDIS_SERVER, port=MULTISERVER_REDIS_PORT, db=MULTISERVER_REDIS_DB)
        self.pubsub = self.redis_client.pubsub()
        self.pubsub.subscribe(MULTISERVER_REDIS_CHANNEL)
        self.pubsub.get_message()
        """ ^ After subscribe, this will produce a message like the below.  We're just popping the stack.
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

        payload = {
            obj: obj,
            method: method,
            args: args
        }
        self.redis_client.publish(MULTISERVER_REDIS_CHANNEL, json.dumps(payload))

    def sync(self):
        msg = self.pubsub.get_message()
        if not msg:
            return

        """  Expecting a message that looks like this:
        {'channel': 'msync',
         'data': '!!!!!!!!!',
         'pattern': None,
         'type': 'message'}
        """
        data = json.loads(msg["data"])
        data["obj"]
        data["method"]
        data["args"]