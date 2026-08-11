import requests
from sefaria.settings import SLACK_URL


def send_message(channel, username, pretext, text, fallback=None, icon_emoji=':robot_face:', color="#a30200", timeout=None, mrkdwn=False):
    attachment = {
        "fallback": fallback or pretext,
        "color": color,
        "pretext": pretext,
        "text": text,
    }
    if mrkdwn:
        # Opt in to Slack mrkdwn rendering (bold/italic/`code`) for the text field;
        # off by default so callers passing literal *, _, ` aren't reformatted.
        attachment["mrkdwn_in"] = ["text"]
    post_object = {
            "icon_emoji": icon_emoji,
            "username": username,
            "channel": channel,
            "attachments": [attachment]
        }

    response = requests.post(SLACK_URL, json=post_object, timeout=timeout)
    return response


ENGINEERING_SIGNAL_CHANNEL = "#engineering-signal"


def notify_engineering_signal(message, level="warning"):
    """
    Post `message` to #engineering-signal.

    No-op when SLACK_URL is unset (local/test environments; it is only configured
    in prod and dev). Never raises: Slack delivery failures must not break the
    cache-rebuild/startup paths that call this.
    """
    if not SLACK_URL:
        return None
    color = "#a30200" if level == "error" else "#daa038"
    icon_emoji = ":rotating_light:" if level == "error" else ":warning:"
    try:
        return send_message(
            ENGINEERING_SIGNAL_CHANNEL,
            "Cache Rebuild Guard",
            level.upper(),
            message,
            icon_emoji=icon_emoji,
            color=color,
            # Bounded so a slow/hung Slack endpoint can't stall the startup
            # path these guards run on.
            timeout=3,
            # The summary is formatted with Slack mrkdwn (bold groups, `code` ids).
            mrkdwn=True,
        )
    except Exception:
        # basa. but slack posting failures (timeouts, connection errors, etc.)
        # should not crash startup.
        return None
