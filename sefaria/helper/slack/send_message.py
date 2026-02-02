import requests
import logging
from typing import Optional, Dict, Any
from sefaria.settings import SLACK_URL

logger = logging.getLogger(__name__)


def send_message(
    channel: str,
    username: str,
    pretext: str,
    text: str,
    fallback: Optional[str] = None,
    icon_emoji: str = ":robot_face:",
    color: str = "#a30200",
) -> bool:
    """
    Send a Slack message using modern blocks format.

    Args:
        channel: Slack channel
        username: Display name for the bot
        pretext: Header text for the message
        text: Main message content
        fallback: Fallback text for notifications (unused in blocks format)
        icon_emoji: Emoji to display as bot icon
        color: Color parameter (unused in blocks format, kept for compatibility)

    Returns:
        True if message sent successfully, False otherwise
    """
    if not SLACK_URL:
        logger.warning("SLACK_URL not configured, skipping Slack notification")
        return False

    post_object: Dict[str, Any] = {
        "icon_emoji": icon_emoji,
        "username": username,
        "channel": channel,
        "blocks": [
            {
                "type": "section",
                "text": {"type": "mrkdwn", "text": f"*{pretext}*\n{text}"},
            }
        ],
    }

    try:
        response: requests.Response = requests.post(
            SLACK_URL, json=post_object, timeout=10
        )
        response.raise_for_status()
        logger.info(f"Slack message sent successfully to {channel}")
        return True
    except requests.exceptions.RequestException as e:
        logger.error(f"Failed to send Slack message to {channel}: {e}")
        return False
