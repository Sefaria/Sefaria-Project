import redis
import json
import time

from sefaria.local_settings import MULTISERVER_ENABLED, MULTISERVER_REDIS_SERVER, \
    MULTISERVER_REDIS_PORT, MULTISERVER_REDIS_DB, MULTISERVER_REDIS_EVENT_CHANNEL, \
    MULTISERVER_REDIS_CONFIRM_CHANNEL

from sefaria.system.multiserver import MultiServerMonitor

import logging
logger = logging.getLogger(__name__)


def log_message():
    pass

if __name__ == '__main__':
    monitor = MultiServerMonitor()

