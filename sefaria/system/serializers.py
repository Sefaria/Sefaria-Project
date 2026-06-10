import json

from django.core.serializers.json import DjangoJSONEncoder


class BaseSerializer:
    def __init__(self, options):
        pass

    def dumps(self, value):
        raise NotImplementedError

    def loads(self, value):
        raise NotImplementedError


class JSONSerializer(BaseSerializer):
    def dumps(self, value):
        return json.dumps(value, cls=DjangoJSONEncoder, ensure_ascii=False).encode()

    def loads(self, value):
        return json.loads(value.decode())


