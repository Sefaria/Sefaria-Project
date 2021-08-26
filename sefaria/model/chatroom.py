"""
chatroom.py
Writes to MongoDB Collection: chatrooms
"""

from . import abstract as abst

class Chatroom(abst.AbstractMongoRecord):
    """
    chats in Chavruta/Beit Midrash
    """

    collection = 'chatrooms'
    history_noun = 'chatroom'

    required_attrs = [
        'room_id',
        'sender_id',
        'message',
        'timestamp'
    ]