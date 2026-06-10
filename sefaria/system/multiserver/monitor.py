import json
import time

from sefaria.settings import MULTISERVER_REDIS_EVENT_CHANNEL, MULTISERVER_REDIS_CONFIRM_CHANNEL

import structlog
logger = structlog.get_logger(__name__)

from .messaging import MessagingNode
from sefaria.system.varnish.thin_wrapper import invalidate_title


class MultiServerMonitor(MessagingNode):
    subscription_channels = [MULTISERVER_REDIS_EVENT_CHANNEL, MULTISERVER_REDIS_CONFIRM_CHANNEL]

    def __init__(self):
        super(MultiServerMonitor, self).__init__()
        self.connect()
        self.events = {}
        self.event_order = []

    def listen(self):
        while True:
            time.sleep(0.2)
            self.process_messages()

    def process_messages(self):
        """

        :return:
        """
        try:
            msg = self.pubsub.get_message()
        except Exception:
            logger.error("Failed to connect to Redis instance while getting new message")
            return
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
        """

        :param data:
        :return:
        """
        event_id = data["id"]
        try:
            (_, subscribers) = self.redis_client.execute_command('PUBSUB', 'NUMSUB', MULTISERVER_REDIS_EVENT_CHANNEL)
        except Exception:
            logger.error("Failed to connect to Redis instance while getting subscriber count")
            return
        expected = int(subscribers - 2)  # No confirms from the publisher or the monitor => subscribers - 2
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
        """

        :param data:
        :return:
        """

        # todo: check status - success/error
        event_id = data["event_id"]
        event_record = self.events.get(event_id)

        if not event_record:
            logger.error("Got confirmation of unknown event. {}".format(data))
            return

        event_record["confirmed"] += 1
        event_record["confirmations"] += [data]
        logger.info("Received {} of {} confirmations for {}".format(
            event_record["confirmed"], event_record["expected"], data["event_id"]))

        if event_record["confirmed"] == event_record["expected"]:
            event_record["complete"] = True
            logger.info("Received all {} responses for {}".format(
                event_record["confirmed"], data["event_id"]))
            self._process_completion(event_record["data"])

    def _process_completion(self, data):
        """

        :param data:
            data["obj"]
            data["method"]
            data["args"]
            data["id"]
        :return:
        """
        if data["obj"] == "library":

            if data["method"] == "refresh_index_record_in_cache":
                title = data["args"][-1]  # Sometimes this is first arg, sometimes second.  Always last.
                logger.info("Invalidating {} in Varnish".format(title))
                invalidate_title(title)

            if data["method"] == "remove_index_record_from_cache":
                title = data["args"][0]
                logger.info("Invalidating {} in Varnish".format(title))
                invalidate_title(title)


