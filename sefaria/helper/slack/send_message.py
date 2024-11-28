import requests
from sefaria.settings import SLACK_URL


def send_message(channel, username, pretext, text, fallback=None, icon_emoji=':robot_face:', color="#a30200"):
    post_object = {
            "icon_emoji": icon_emoji,
            "username": username,
            "channel": channel,
            "attachments": [
                {
                    "fallback": fallback or pretext,
                    "color": color,
                    "pretext": pretext,
                    "text": text
                }
            ]
        }

    requests.post(SLACK_URL, json=post_object)
