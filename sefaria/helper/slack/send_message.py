from slack_sdk import WebClient
from slack_sdk.errors import SlackApiError
import structlog
try:
    from sefaria.settings import TEXT_UPLOAD_SLACK_TOKEN
    client = WebClient(token=TEXT_UPLOAD_SLACK_TOKEN)
except ImportError:
    client = None

logger = structlog.get_logger(__name__)


def send_message(text, channel='#engineering-signal'):
    try:
        if client is not None:
            client.chat_postMessage(channel=channel, text=text)
        else:
            logger.info(text)
    except SlackApiError as e:
        logger.error(f"Error sending message: {e.response['error']}")
