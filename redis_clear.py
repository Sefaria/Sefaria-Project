import os
import redis

def clear_redis_cache():
    redis_url = os.getenv('REDIS_URL')
    if not redis_url:
        raise ValueError("Redis URL not provided as an environment variable.")
    
    # Connect to Redis
    try:
        r = redis.Redis.from_url(redis_url, ssl_cert_reqs=None)
        # Clear the Redis cache
        r.flushall()
        print("Redis cache cleared successfully.")
    except Exception as e:
        print(f"Failed to clear Redis cache: {e}")

if __name__ == "__main__":
    clear_redis_cache()