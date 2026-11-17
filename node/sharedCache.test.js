/**
 * @jest-environment node
 */
const { createSharedCache } = require('./sharedCache');

const cacheKeyMapping = { toc: 'toc', terms: 'term_mapping' };

// redisValues is read on every call, so a test can remove or replace a key
// after the cache has been loaded.
const makeCache = (redisValues) => {
  const getAsync = jest.fn(async key =>
    Object.prototype.hasOwnProperty.call(redisValues, key) ? redisValues[key] : null);
  const logger = { debug: jest.fn(), error: jest.fn() };
  return { ...createSharedCache({ getAsync, cacheKeyMapping, logger }), getAsync, logger };
};

const fullRedis = () => ({
  toc: JSON.stringify([{ title: 'first' }]),
  term_mapping: JSON.stringify({ a: 1 }),
});

describe('loadSharedData failure handling', () => {
  test('rejects when a required key is missing from Redis', async () => {
    const cache = makeCache({ toc: JSON.stringify([]) });  // term_mapping absent

    await expect(cache.loadSharedData({ startup: true })).rejects.toThrow('term_mapping');
    expect(cache.data.terms).toBeNull();
    expect(cache.data.last_cached).toBeNull();
    expect(cache.logger.error).toHaveBeenCalled();
  });

  test('rejects when the Redis read itself fails', async () => {
    const getAsync = jest.fn(() => Promise.reject(new Error('connection lost')));
    const logger = { debug: jest.fn(), error: jest.fn() };
    const { loadSharedData } = createSharedCache({ getAsync, cacheKeyMapping, logger });

    await expect(loadSharedData({ startup: true })).rejects.toThrow('connection lost');
  });

  test('a failed Redis read keeps the previous data and timestamp', async () => {
    const redis = fullRedis();
    const cache = makeCache(redis);
    await cache.loadSharedData({ last_cached_to_compare: 100 });

    cache.getAsync.mockImplementation(() => Promise.reject(new Error('connection lost')));

    await expect(cache.loadSharedData({ last_cached_to_compare: 200 })).rejects.toThrow('connection lost');
    expect(cache.data.last_cached).toBe(100);
    expect(cache.data.toc).toEqual([{ title: 'first' }]);
  });

  test('a missing key keeps its last good value, logs, and still refreshes the other keys', async () => {
    const redis = fullRedis();
    const cache = makeCache(redis);
    await cache.loadSharedData({ last_cached_to_compare: 100 });

    redis.toc = JSON.stringify([{ title: 'second' }]);
    delete redis.term_mapping;

    await expect(cache.loadSharedData({ last_cached_to_compare: 200 })).resolves.toBeUndefined();
    expect(cache.data.terms).toEqual({ a: 1 });
    expect(cache.data.toc).toEqual([{ title: 'second' }]);
    expect(cache.logger.error).toHaveBeenCalledWith(expect.stringContaining('last good value for terms'));
  });

  test('a key that kept its last good value is retried on the next request', async () => {
    const redis = fullRedis();
    const cache = makeCache(redis);
    await cache.loadSharedData({ last_cached_to_compare: 100 });
    delete redis.term_mapping;
    await cache.loadSharedData({ last_cached_to_compare: 200 });
    expect(cache.data.last_cached).toBe(100);

    redis.term_mapping = JSON.stringify({ a: 2 });
    await cache.loadSharedData({ last_cached_to_compare: 200 });
    expect(cache.data.terms).toEqual({ a: 2 });
    expect(cache.data.last_cached).toBe(200);
  });

  test('a cold node with no last good value still fails when a key is missing', async () => {
    const redis = fullRedis();
    const cache = makeCache(redis);
    await cache.loadSharedData({ last_cached_to_compare: 100 });
    // Only terms exists on this node; toc was never loaded here.
    cache.data.toc = null;
    delete redis.toc;

    await expect(cache.loadSharedData({ last_cached_to_compare: 200 })).rejects.toThrow('toc');
    expect(cache.data.terms).toEqual({ a: 1 });
  });
});

describe('overlapping refreshes', () => {
  test('an older load finishing after a newer one does not overwrite it', async () => {
    const resolvers = {};
    const getAsync = jest.fn(key => new Promise(resolve => {
      (resolvers[key] = resolvers[key] || []).push(resolve);
    }));
    const logger = { debug: jest.fn(), error: jest.fn() };
    const cache = createSharedCache({ getAsync, cacheKeyMapping, logger });

    const older = cache.loadSharedData({ last_cached_to_compare: 100 });
    const newer = cache.loadSharedData({ last_cached_to_compare: 200 });
    // Every key has one pending read per load: [older, newer]. Newer finishes first.
    for (const key of Object.values(cacheKeyMapping)) {
      resolvers[key][1](JSON.stringify({ from: 'new' }));
    }
    await newer;
    for (const key of Object.values(cacheKeyMapping)) {
      resolvers[key][0](JSON.stringify({ from: 'old' }));
    }
    await older;

    expect(cache.data.last_cached).toBe(200);
    expect(cache.data.toc).toEqual({ from: 'new' });
    expect(cache.data.terms).toEqual({ from: 'new' });
  });
});

describe('refresh generations', () => {
  // Two overlapping loads; the second-started one finishes first, then the first-started one.
  const overlap = async (firstTimestamp, secondTimestamp, firstStartup = false) => {
    const resolvers = {};
    const getAsync = jest.fn(key => new Promise(resolve => {
      (resolvers[key] = resolvers[key] || []).push(resolve);
    }));
    const logger = { debug: jest.fn(), error: jest.fn() };
    const cache = createSharedCache({ getAsync, cacheKeyMapping, logger });
    const first = cache.loadSharedData({ last_cached_to_compare: firstTimestamp, startup: firstStartup });
    const second = cache.loadSharedData({ last_cached_to_compare: secondTimestamp, startup: true });
    for (const key of Object.values(cacheKeyMapping)) {
      resolvers[key][1](JSON.stringify({ from: 'second' }));
    }
    await second;
    for (const key of Object.values(cacheKeyMapping)) {
      resolvers[key][0](JSON.stringify({ from: 'first' }));
    }
    await first;
    return cache;
  };

  test('out-of-order completion keeps the later-started refresh', async () => {
    const cache = await overlap(100, 200, true);
    expect(cache.data.toc).toEqual({ from: 'second' });
    expect(cache.data.last_cached).toBe(200);
  });

  test('a missing timestamp is still ordered by start', async () => {
    const cache = await overlap(undefined, undefined, true);
    expect(cache.data.toc).toEqual({ from: 'second' });
    expect(cache.data.terms).toEqual({ from: 'second' });
  });

  test('an invalid timestamp is still ordered by start', async () => {
    const cache = await overlap('not-a-timestamp', 'also-bad', true);
    expect(cache.data.toc).toEqual({ from: 'second' });
    expect(cache.data.last_cached).toBeNull();
  });

  test('a cache hit that finishes while a real refresh is in flight does not block it', async () => {
    const redis = fullRedis();
    const resolvers = {};
    let hold = false;
    const getAsync = jest.fn(key => hold
      ? new Promise(resolve => { (resolvers[key] = resolvers[key] || []).push(resolve); })
      : Promise.resolve(redis[key]));
    const logger = { debug: jest.fn(), error: jest.fn() };
    const cache = createSharedCache({ getAsync, cacheKeyMapping, logger });
    await cache.loadSharedData({ last_cached_to_compare: 100 });

    hold = true;
    const refresh = cache.loadSharedData({ last_cached_to_compare: 200 });
    const hit = cache.loadSharedData({ last_cached_to_compare: 100 });  // nothing to fetch
    await hit;
    for (const key of Object.values(cacheKeyMapping)) {
      resolvers[key][0](JSON.stringify({ from: 'refresh' }));
    }
    await refresh;

    expect(cache.data.toc).toEqual({ from: 'refresh' });
    expect(cache.data.last_cached).toBe(200);
  });

  test('refreshes completing in start order both commit', async () => {
    const cache = makeCache(fullRedis());
    await cache.loadSharedData({ last_cached_to_compare: 100 });
    await cache.loadSharedData({ last_cached_to_compare: 200 });
    expect(cache.data.last_cached).toBe(200);
  });
});

describe('staleness comparison', () => {
  test('a newer timestamp refreshes every key and stores it as a number', async () => {
    const cache = makeCache(fullRedis());
    await cache.loadSharedData({ last_cached_to_compare: 100 });
    const callsBefore = cache.getAsync.mock.calls.length;

    await cache.loadSharedData({ last_cached_to_compare: '200' });

    expect(cache.getAsync.mock.calls.length).toBe(callsBefore + 2);
    expect(cache.data.last_cached).toBe(200);
  });

  test('an equal or older timestamp does not refetch', async () => {
    const cache = makeCache(fullRedis());
    await cache.loadSharedData({ last_cached_to_compare: 100 });
    const callsBefore = cache.getAsync.mock.calls.length;

    await cache.loadSharedData({ last_cached_to_compare: 100 });
    await cache.loadSharedData({ last_cached_to_compare: 50 });

    expect(cache.getAsync.mock.calls.length).toBe(callsBefore);
  });

  test('a non-numeric timestamp forces a refresh', async () => {
    const cache = makeCache(fullRedis());
    await cache.loadSharedData({ last_cached_to_compare: 100 });
    const callsBefore = cache.getAsync.mock.calls.length;

    await cache.loadSharedData({ last_cached_to_compare: 'not-a-timestamp' });

    expect(cache.getAsync.mock.calls.length).toBe(callsBefore + 2);
  });

  test('a missing timestamp forces a refresh of the comparison', () => {
    const cache = makeCache(fullRedis());

    expect(cache.cacheTimestampNeedsUpdating('last_cached', undefined)).toBe(true);
    expect(cache.cacheTimestampNeedsUpdating('last_cached', null)).toBe(true);
  });
});
