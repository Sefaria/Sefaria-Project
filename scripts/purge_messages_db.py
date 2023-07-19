# Purge all Messages from the DB
# In cleaning out old Messages code, this purges any remaining messages in the database
import django
django.setup()
from sefaria.model import NotificationSet

def purge_messages():
    ns = NotificationSet({'type': 'message'})
    print(f"There are {len(ns)} messages in the database which are about to be purged")
    ns.delete(bulk_delete=True)

    ns = NotificationSet({'type': 'message'})
    if ns.count() == 0:
        print(f"Purged all messages from the database")

if __name__ == '__main__':
    purge_messages()

