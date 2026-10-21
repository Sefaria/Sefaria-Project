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

  test('a failed refresh keeps the previous data and timestamp', async () => {
    const redis = fullRedis();
    const cache = makeCache(redis);
    await cache.loadSharedData({ last_cached_to_compare: 100 });

    redis.toc = JSON.stringify([{ title: 'second' }]);
    delete redis.term_mapping;

    await expect(cache.loadSharedData({ last_cached_to_compare: 200 })).rejects.toThrow('term_mapping');
    expect(cache.data.last_cached).toBe(100);
    expect(cache.data.toc).toEqual([{ title: 'first' }]);
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
