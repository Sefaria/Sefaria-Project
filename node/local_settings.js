
function fromEnv(name, defaultValue) {
  return (name in process.env) ? process.env[name] : defaultValue;
}

const local_settings = {

  NODEJS_PORT: function(){
    if ('NODEJS_PORT' in process.env) {
      return process.env.NODEJS_PORT;
    } else {
      return 3000; // default;
    }
  }(),

  // Redis / Redis Sentinel: mirrors sefaria.system.redis_sentinel's naming. Either
  // SENTINEL_HEADLESS_URL (prod/staging, via SENTINEL get-master-addr-by-name)
  // or REDIS_URL (a single plain instance, e.g. local dev) is used -- see server.js's
  // resolveSharedCacheRedisUrl(). This reads the same shared-cache keyspace Django's
  // CACHES["shared"] writes to.
  REDIS_URL: fromEnv('REDIS_URL', 'redis://127.0.0.1'),
  REDIS_PORT: fromEnv('REDIS_PORT', 6379),
  REDIS_PASSWORD: fromEnv('REDIS_PASSWORD', null),
  SENTINEL_HEADLESS_URL: fromEnv('SENTINEL_HEADLESS_URL', null),
  SENTINEL_PASSWORD: fromEnv('SENTINEL_PASSWORD', null),
  SENTINEL_MASTER_SET: fromEnv('SENTINEL_MASTER_SET', 'mymaster'),
  SHARED_CACHE_DB_NUM: fromEnv('SHARED_CACHE_DB_NUM', 1),
  // Mirrors Django's DEPLOY_ENV: the KEY_PREFIX of CACHES["shared"], so this reader finds the keys
  // Django wrote when several deployments share one Redis (e.g. cauldrons). Empty = no prefix.
  DEPLOY_ENV: fromEnv('DEPLOY_ENV', ''),

  DEBUG: function(){
    if ('DEBUG' in process.env) {
      return process.env.DEBUG;
    } else {
      return false; // default
    }
  }()
}

module.exports = local_settings;
