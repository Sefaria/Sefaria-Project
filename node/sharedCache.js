// In-process copy of the shared library data that Django places in Redis.
// The Redis getter and the logger are injected so the staleness rules and the
// failure handling can be unit tested without a Redis connection.

// Timestamps are unix seconds. Numbers and numeric strings are accepted; a missing,
// empty or non-numeric value normalizes to null.
const normalizeTimestamp = function(value) {
  if(value === null || value === undefined || value === ""){
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const createSharedCache = function({ getAsync, cacheKeyMapping, logger }) {
  const sharedCacheData = {
    /*
    Not data, but a unix timestamp (originally) passed from django indicating when data was last updated on this node process. i
    if a later date comes in on a request, it will trigger an update
     */
    "last_cached": null,
    /* data */
    "toc": null,
    "topic_toc": null,
    "terms": null,
    "books": null,
    "virtualBooks": null,
  };

  // Every refresh takes a generation number when it starts. Refreshes can finish in any order, so a
  // refresh commits only if no refresh that started after it has already committed. The payload
  // timestamp below is a second check, but it cannot order refreshes that carry none.
  let nextGeneration = 0;
  let committedGeneration = 0;

  const loadSharedData = async function({ last_cached_to_compare = null, startup = false } = {}){
    const generation = ++nextGeneration;
    logger.debug("Load Shared Data - Input last cached timestamp to compare: " + last_cached_to_compare);
    //TODO: If the data wasnt placed in Redis by django to begin with, well, we're screwed.
    // Or you know, fix it so Node does send a signal to Django to populate cache.
    const keysToFetch = Object.keys(cacheKeyMapping).filter(key =>
      startup || last_cached_to_compare == null || needsUpdating(key, last_cached_to_compare));
    // Every key is read before anything is committed. A key that is missing from Redis keeps its last
    // good value on this node and is logged; only a node with no value for it yet (a cold start) fails
    // the load. A failed Redis read always rejects the load.
    const keptLastGood = [];
    let fetched;
    try{
      const results = await Promise.all(keysToFetch.map(async key => {
        const redisKey = cacheKeyMapping[key];
        const resp = await getAsync(redisKey);
        const parsed = resp ? JSON.parse(resp) : null;
        if(parsed === null || parsed === undefined){
          if(sharedCacheData[key] === null || sharedCacheData[key] === undefined){
            throw new Error(`Error with ${key}: ${redisKey} not found in cache`);
          }
          logger.error(`Shared cache key ${redisKey} is missing from Redis; keeping the last good value for ${key}`);
          keptLastGood.push(key);
          return null;
        }
        return [key, parsed];
      }));
      fetched = results.filter(entry => entry !== null);
    }catch(e) {
      logger.error(`Shared cache load failed: ${e.message}`);
      throw e;
    }
    // A cache hit fetched nothing, so it commits nothing and must not rank above a real refresh that
    // started earlier and is still running.
    if(keysToFetch.length === 0){
      return;
    }
    // Refreshes can overlap. A load that started before one already committed must not put its
    // older data back, whatever timestamp it carries (or lacks), so it commits nothing.
    if(generation < committedGeneration){
      logger.debug(`Load Shared Data - Discarding superseded refresh #${generation}; #${committedGeneration} is committed`);
      return;
    }
    const incoming = normalizeTimestamp(last_cached_to_compare);
    const committed = normalizeTimestamp(sharedCacheData["last_cached"]);
    if(incoming !== null && committed !== null && incoming < committed){
      logger.debug(`Load Shared Data - Discarding stale refresh for ${incoming}; cache is at ${committed}`);
      return;
    }
    committedGeneration = generation;
    for (const [key, parsed] of fetched) {
      sharedCacheData[key] = parsed;
    }
    // A key that kept its last good value is still behind, so the timestamp stays put and the next request retries it.
    if(keptLastGood.length === 0 && cacheTimestampNeedsUpdating("last_cached", last_cached_to_compare)){
      // A null timestamp means the next request refreshes again.
      sharedCacheData["last_cached"] = normalizeTimestamp(last_cached_to_compare);
    }
  };

  const cacheTimestampNeedsUpdating = function(cache_timestamp = "last_cached", timestamp_to_compare){
    const incoming = normalizeTimestamp(timestamp_to_compare);
    if(incoming === null){
      // No usable request timestamp: refresh rather than trust the cached copy.
      return true;
    }
    const cached = normalizeTimestamp(sharedCacheData[cache_timestamp]);
    return cached === null || cached < incoming;
  };

  const needsUpdating = function(cachekey, last_cached_to_compare){
    return !sharedCacheData[cachekey] || cacheTimestampNeedsUpdating("last_cached", last_cached_to_compare);
  };

  return { data: sharedCacheData, loadSharedData, cacheTimestampNeedsUpdating, needsUpdating };
};

module.exports = { createSharedCache };
