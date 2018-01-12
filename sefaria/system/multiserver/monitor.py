import json
import time

from sefaria.local_settings import MULTISERVER_REDIS_EVENT_CHANNEL, MULTISERVER_REDIS_CONFIRM_CHANNEL

import logging
logging.basicConfig()
logger = logging.getLogger("multiserver")
logger.setLevel(logging.INFO)

from messaging import MessagingNode


class MultiServerMonitor(MessagingNode):
    subscription_channels = [MULTISERVER_REDIS_EVENT_CHANNEL, MULTISERVER_REDIS_CONFIRM_CHANNEL]

    def __init__(self):
        super(MultiServerMonitor, self).__init__()
        self.events = {}
        self.event_order = []

    def listen(self):
        while True:
            time.sleep(0.2)
            self.process_messages()

    def process_messages(self):
        msg = self.pubsub.get_message()
        if not msg:
            return

        if msg["type"] != "message":
            logger.error("Surprising redis message type: {}".format(msg))

        elif msg["channel"] == MULTISERVER_REDIS_EVENT_CHANNEL:
            data = json.loads(msg["data"])
            self._process_event(data)
        elif msg["channel"] == MULTISERVER_REDIS_CONFIRM_CHANNEL:
            data = json.loads(msg["data"])
            self._process_confirm(data)
        else:
            logger.error("Surprising redis message channel: {}".format(msg["channel"]))

        # There may be more than one message waiting
        self.process_messages()

    def _process_event(self, data):
        event_id = data["id"]
        (_, subscribers) = self.redis_client.execute_command('PUBSUB', 'NUMSUB', MULTISERVER_REDIS_EVENT_CHANNEL)
        expected = int(subscribers - 1)
        self.events[event_id] = {
            "data": data,
            "expected": expected,
            "confirmed": 0,
            "confirmations": [],
            "complete": False}
        self.event_order += [event_id]
        logger.info("Received new event: {} - expecting {} confirmations".format(
            self.event_description(data), expected))

    def _process_confirm(self, data):

        # todo: check status - success/error
        event_id = data["event_id"]
        event_record = self.events.get(event_id)

        if not event_record:
            logger.error("Got confirmation of unknown event. {}".format(data))

        event_record["confirmed"] += 1
        event_record["confirmations"] += [data]
        logger.info("Received {} of {} confirmations for {}".format(
            event_record["confirmed"], event_record["expected"], data["event_id"]))

        if event_record["confirmed"] == event_record["expected"]:
            event_record["complete"] = True
            self._process_completion(event_record["data"])

    @staticmethod
    def event_description(data):
        return "{}.{}({}) [{}]".format(data["obj"], data["method"], ", ".join(data["args"]), data["id"])

    def _process_completion(self, data):
        data["obj"]
        data["method"]
        data["args"]

