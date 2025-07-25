import django
django.setup()

from sefaria.settings import MULTISERVER_ENABLED
from sefaria.system.multiserver.monitor import MultiServerMonitor
import structlog
logger = structlog.get_logger(__name__)


if __name__ == '__main__':
    if not MULTISERVER_ENABLED:
        logger.error(u"MULTISERVER_ENABLED is not set.  Exiting")
        exit()

    monitor = MultiServerMonitor()
    monitor.listen()
