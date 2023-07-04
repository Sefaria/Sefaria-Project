# Purge all Messages from the DB
# In cleaning out old Messages code, this purges any remaining messages in the database
import django
django.setup()
from sefaria.model import NotificationSet

def purge_messages():
    count = 0
    ns = NotificationSet({'type': 'message'})
    print(f"There are {len(ns)} messages in the database which are about to be purged")
    for message in ns:
        message.delete()
        count += 1
    print(f"Purged {count} messages from the database")

if __name__ == '__main__':
    purge_messages()

