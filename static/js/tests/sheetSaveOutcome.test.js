import { createDeferredRefresh, isFailedSave } from '../sheetSaveOutcome';

describe('isFailedSave', () => {
  test('a response with an error is a failed save', () => {
    expect(isFailedSave({ error: 'Sheet was modified elsewhere' })).toBe(true);
  });

  test('a response asking for a rebuild is a failed save', () => {
    expect(isFailedSave({ id: 1, rebuild: true })).toBe(true);
  });

  test('an empty response is a failed save', () => {
    expect(isFailedSave(undefined)).toBe(true);
  });

  test('a normal saved sheet is not a failed save', () => {
    expect(isFailedSave({ id: 1, rebuild: false, dateModified: '2026-01-01' })).toBe(false);
  });
});

describe('createDeferredRefresh', () => {
  test('a deferred refresh is applied once after the next successful save', () => {
    const deferred = createDeferredRefresh();
    expect(deferred.take()).toBe(false);
    deferred.defer();
    deferred.defer();
    expect(deferred.isPending()).toBe(true);
    expect(deferred.take()).toBe(true);
    expect(deferred.take()).toBe(false);
  });
});
