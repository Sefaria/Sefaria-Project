"""Writes to MongoDB Collection: chatrooms."""

from . import abstract


class Chatroom(abst.AbstractMongoRecord):
    """
    chats in Chavruta/Beit Midrash
    """

    collection = 'chatrooms'

    required_attrs = [
        'room_id',
        'messages'
    ]

    def post_message(self, room_id=None, sender_id=None, timestamp=None, message_content=None):
        self.room_id = room_id
        self.messages = {"sender_id": sender_id, "timestamp": timestamp, "message_content": message_content}
        return self


class ChatroomSet(abstract.AbstractMongoSet):
    recordClass = Chatroom

class Message(abstract.AbstractMongoRecord):
    collection = 'messages'

    required_attrs = [
        "room_id",
        "sender_id",
        "timestamp",
        "message"
    ]

    def client_contents(self):
        return self.contents()

class MessageSet(abstract.AbstractMongoSet):
    recordClass = Message

    def client_contents(self):
        return [x.client_contents() for x in self]
