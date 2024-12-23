import redis
from sefaria.settings import MULTISERVER_REDIS_SERVER, MULTISERVER_REDIS_PORT, MULTISERVER_REDIS_DB

class RedisClient:
    _instance = None
    _params = {}

    def __init__(self,
                 host=MULTISERVER_REDIS_SERVER, 
                 port=MULTISERVER_REDIS_PORT, 
                 db=MULTISERVER_REDIS_DB, 
                 decode_responses=True, 
                 encoding="utf-8"):
        if RedisClient._instance is not None:
            raise Exception("This class is a singleton!")
        self.client = redis.StrictRedis(
            host=host,
            port=port,
            db=db,
            decode_responses=decode_responses,
            encoding=encoding
        )
        RedisClient._instance = self
        RedisClient._params = {
            'host': host,
            'port': port,
            'db': db,
            'decode_responses': decode_responses,
            'encoding': encoding
        }

    @staticmethod
    def get_instance(
        host=MULTISERVER_REDIS_SERVER, 
        port=MULTISERVER_REDIS_PORT, 
        db=MULTISERVER_REDIS_DB, 
        decode_responses=True, 
        encoding="utf-8"):
        if (RedisClient._instance is None or 
            RedisClient._params['host'] != host or 
            RedisClient._params['port'] != port or 
            RedisClient._params['db'] != db or 
            RedisClient._params['decode_responses'] != decode_responses or 
            RedisClient._params['encoding'] != encoding):
            RedisClient(host, port, db, decode_responses, encoding)
        return RedisClient._instance.client

def get_redis_client(
        host=MULTISERVER_REDIS_SERVER, 
        port=MULTISERVER_REDIS_PORT, 
        db=MULTISERVER_REDIS_DB, 
        decode_responses=True, 
        encoding="utf-8"):
    return RedisClient.get_instance(host, port, db, decode_responses, encoding)