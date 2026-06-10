import os
from slack_sdk import WebClient
from slack_sdk.errors import SlackApiError

client = WebClient(token=os.environ['SLACK_BOT_TOKEN'])
ghaLink = "https://github.com/{}/actions/runs/{}".format(os.environ['GITHUB_REPOSITORY'], os.environ['GITHUB_RUN_ID'])
messageText="Starting test run for commit *{}* by *{}*.\nWatch run at {}".format(os.environ['GITHUB_SHA'],os.environ['GITHUB_ACTOR'], ghaLink)

targetChannel = os.environ['TARGET_SLACK_CHANNEL']

try:
    response = client.chat_postMessage(channel=targetChannel, text=messageText, icon_emoji=":alembic:", unfurl_links=False) # send this to myself first
    assert response["message"]["text"]
    print("Success")
except SlackApiError as e:# 
    assert e.response["ok"] is False
    assert e.response["error"]  # str like 'invalid_auth', 'channel_not_found'
    print(f"Got an error: {e.response['error']}")

