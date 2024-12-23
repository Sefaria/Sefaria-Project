
import json
import pickle
import base64
import json

class RedisHashPrefix:
    """
    Behaves like a dictionary (for one "prefix"),
    storing all items as fields in a single Redis hash.
    """
    def __init__(self, redis_client, hash_name, prefix):
        self.redis_client = redis_client
        self.hash_name = hash_name
        self.prefix = prefix

    def __getitem__(self, key):
        # The Redis field is "<prefix>:<key>"
        field = f"{self.prefix}:{key}"
        raw_value = self.redis_client.hget(self.hash_name, field)
        if raw_value is None:
            raise KeyError(key)
        return json.loads(raw_value)

    def __setitem__(self, key, value):
        field = f"{self.prefix}:{key}"
        self.redis_client.hset(self.hash_name, field, json.dumps(value))

    def __delitem__(self, key):
        field = f"{self.prefix}:{key}"
        deleted_count = self.redis_client.hdel(self.hash_name, field)
        if deleted_count == 0:
            raise KeyError(key)

    def get(self, key, default=None):
        try:
            return self[key]
        except KeyError:
            return default

    def keys(self):
        """
        Return only the keys that match our prefix.
        """
        all_fields = self.redis_client.hkeys(self.hash_name)
        # hkeys returns a list of bytes/strings. We'll filter by prefix.
        prefix_with_colon = f"{self.prefix}:"
        return [
            f[len(prefix_with_colon):]
            for f in all_fields
            if f.startswith(prefix_with_colon)
        ]

    def __iter__(self):
        return iter(self.keys())

    def items(self):
        """
        Yield (k, v) pairs for everything under this prefix.
        """
        for k in self.keys():
            yield (k, self[k])

    def __len__(self):
        return len(self.keys())


class RedisNestedHash:
    """
    Behaves like a dictionary of dictionaries:
      e.g. usage => nested_dict["en"]["Genesis"] = ...
    Each nested dictionary is mapped to a prefix in a Redis hash.
    """
    def __init__(self, redis_client, hash_name):
        self.redis_client = redis_client
        self.hash_name = hash_name

    def __getitem__(self, prefix):
        # Return a "sub-dict" for this prefix
        return RedisHashPrefix(self.redis_client, self.hash_name, prefix)

    def __setitem__(self, prefix, dict_value):
        """
        If you do something like:

            some_nested_hash["en"] = {"Genesis": val1, "Exodus": val2}

        We'll store each item as "en:Genesis" and "en:Exodus" in the Redis hash.
        """
        if not isinstance(dict_value, dict):
            raise ValueError("Assigned value must be a dictionary.")

        # First, clear out old keys that match this prefix
        all_fields = self.redis_client.hkeys(self.hash_name)
        prefix_with_colon = f"{prefix}:"
        for field in all_fields:
            if field.startswith(prefix_with_colon):
                self.redis_client.hdel(self.hash_name, field)

        # Now set each new key
        for k, v in dict_value.items():
            field = f"{prefix}:{k}"
            self.redis_client.hset(self.hash_name, field, json.dumps(v))

    def __delitem__(self, prefix):
        """
        Deleting a top-level key => remove all subkeys that match that prefix.
        """
        all_fields = self.redis_client.hkeys(self.hash_name)
        prefix_with_colon = f"{prefix}:"
        deleted_any = False
        for field in all_fields:
            if field.startswith(prefix_with_colon):
                self.redis_client.hdel(self.hash_name, field)
                deleted_any = True
        if not deleted_any:
            raise KeyError(prefix)

    def get(self, prefix, default=None):
        """
        Return a sub-dict if it exists; otherwise return `default`.
        """
        sub_dict = RedisHashPrefix(self.redis_client, self.hash_name, prefix)
        # We can check if it has any keys
        if len(sub_dict) == 0:
            return default
        return sub_dict


class RedisPickleHash:
    """
    Behaves like a dict that stores arbitrary Python objects as pickled bytes in a single Redis hash.
    Ideal for `__tref_oref_map` because values are custom Python objects.
    """
    def __init__(self, redis_client, hash_key_name):
        self.redis_client = redis_client
        self.hash_key_name = hash_key_name

    def __getitem__(self, key):
        val = self.redis_client.hget(self.hash_key_name, key)
        if val is None:
            raise KeyError(key)
        # val is stored as base64-encoded pickle. Decode, then unpickle.
        pickled_bytes = base64.b64decode(val)
        try:
            return pickle.loads(pickled_bytes)
        except Exception as e:
            raise ValueError(f"Failed to unpickle value for key '{key}'") from e

    def __setitem__(self, key, value):
        # Pickle + base64-encode to ensure it's safe as a Redis string
        pickled_bytes = pickle.dumps(value, protocol=pickle.HIGHEST_PROTOCOL)
        encoded = base64.b64encode(pickled_bytes).decode('ascii')
        self.redis_client.hset(self.hash_key_name, key, encoded)

    def __delitem__(self, key):
        removed = self.redis_client.hdel(self.hash_key_name, key)
        if removed == 0:
            raise KeyError(key)

    def __contains__(self, key):
        return self.redis_client.hexists(self.hash_key_name, key)

    def get(self, key, default=None):
        try:
            return self[key]
        except KeyError:
            return default

    def keys(self):
        # hkeys returns list of all fields in the hash
        return self.redis_client.hkeys(self.hash_key_name)

    def __len__(self):
        return self.redis_client.hlen(self.hash_key_name)

    def clear(self):
        """Remove the entire hash from Redis."""
        self.redis_client.delete(self.hash_key_name)


class RedisJsonHash:
    """
    Behaves like a dict that stores lists (or other JSON-serializable data)
    in a single Redis hash. Perfect for `__index_tref_map` because values are arrays.
    """
    def __init__(self, redis_client, hash_key_name):
        self.redis_client = redis_client
        self.hash_key_name = hash_key_name

    def __getitem__(self, key):
        val = self.redis_client.hget(self.hash_key_name, key)
        if val is None:
            raise KeyError(key)
        return json.loads(val)

    def __setitem__(self, key, value):
        # Ensure `value` is JSON-serializable (lists, dicts, etc.)
        self.redis_client.hset(self.hash_key_name, key, json.dumps(value))

    def __delitem__(self, key):
        removed = self.redis_client.hdel(self.hash_key_name, key)
        if removed == 0:
            raise KeyError(key)

    def __contains__(self, key):
        return self.redis_client.hexists(self.hash_key_name, key)

    def get(self, key, default=None):
        try:
            return self[key]
        except KeyError:
            return default

    def keys(self):
        return self.redis_client.hkeys(self.hash_key_name)

    def __len__(self):
        return self.redis_client.hlen(self.hash_key_name)

    def clear(self):
        """Remove the entire hash from Redis."""
        self.redis_client.delete(self.hash_key_name)
