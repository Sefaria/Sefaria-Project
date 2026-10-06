const Redis = require('ioredis');

/*
Client for Django's CACHES["shared"]. With SENTINEL_HEADLESS_URL set, ioredis asks Sentinel
for the current master on every (re)connect, and failoverDetector reconnects as soon as
Sentinel announces a new master; otherwise it connects to REDIS_URL/REDIS_PORT directly.
*/
const createSharedCacheClient = function(settings){
  const opts = {
    db: Number(settings.SHARED_CACHE_DB_NUM),
    // Django's cache key is "<KEY_PREFIX>:<version>:<key>"; KEY_PREFIX is DEPLOY_ENV (empty when unset).
    keyPrefix: `${settings.DEPLOY_ENV}:1:`,
    password: settings.REDIS_PASSWORD || undefined,
  };
  if (settings.SENTINEL_HEADLESS_URL) {
    return new Redis({
      ...opts,
      sentinels: [{host: settings.SENTINEL_HEADLESS_URL, port: Number(settings.REDIS_PORT)}],
      name: settings.SENTINEL_MASTER_SET,
      sentinelPassword: settings.SENTINEL_PASSWORD || undefined,
      failoverDetector: true,
    });
  }
  return new Redis({
    ...opts,
    host: settings.REDIS_URL.replace('redis://', ''),
    port: Number(settings.REDIS_PORT),
  });
};

module.exports = createSharedCacheClient;
