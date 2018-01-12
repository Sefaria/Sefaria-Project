
from sefaria.local_settings import MULTISERVER_ENABLED

from sefaria.system.multiserver.monitor import MultiServerMonitor

import logging
logger = logging.getLogger(__name__)


if __name__ == '__main__':
    if not MULTISERVER_ENABLED:
        logger.error("MULTISERVER_ENABLED is not set.  Exiting")
        exit()

    monitor = MultiServerMonitor()
    monitor.listen()
