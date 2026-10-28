
function fromEnv(name, defaultValue) {
  return (name in process.env) ? process.env[name] : defaultValue;
}

const local_settings = {

  NODEJS_PORT: fromEnv('NODEJS_PORT', 3000),

  // Same names as Django's settings. With SENTINEL_HEADLESS_URL set, the master is looked up
  // through Sentinel; otherwise REDIS_URL is used directly (see server.js).
  REDIS_URL: fromEnv('REDIS_URL', 'redis://127.0.0.1'),
  REDIS_PORT: fromEnv('REDIS_PORT', 6379),
  REDIS_PASSWORD: fromEnv('REDIS_PASSWORD', null),
  SENTINEL_HEADLESS_URL: fromEnv('SENTINEL_HEADLESS_URL', null),
  SENTINEL_PASSWORD: fromEnv('SENTINEL_PASSWORD', null),
  SENTINEL_MASTER_SET: fromEnv('SENTINEL_MASTER_SET', 'mymaster'),
  SHARED_CACHE_DB_NUM: fromEnv('SHARED_CACHE_DB_NUM', 1),
  // KEY_PREFIX of Django's CACHES["shared"]
  DEPLOY_ENV: fromEnv('DEPLOY_ENV', ''),

  DEBUG: fromEnv('DEBUG', false),
}

module.exports = local_settings;
