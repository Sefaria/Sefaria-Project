/* Testing done using Jest */
import { classifySheetSaveResponse, SAVE_RESPONSE } from '../sheetSaveResponse';

describe('classifySheetSaveResponse', function () {
  it('treats a stored sheet as saved', function () {
    expect(classifySheetSaveResponse({ id: 1, status: 'unlisted', dateModified: '2026-01-01T00:00:00' })).toBe(
      SAVE_RESPONSE.SAVED
    );
  });

  it('treats the stale-sheet response as a conflict, not a save', function () {
    expect(classifySheetSaveResponse({ id: 1, error: 'Sheet updated.', rebuild: true })).toBe(SAVE_RESPONSE.CONFLICT);
  });

  it('treats any other error body as an error', function () {
    expect(classifySheetSaveResponse({ error: 'Unknown error.' })).toBe(SAVE_RESPONSE.ERROR);
  });

  it('treats an empty or non-object body as an error', function () {
    expect(classifySheetSaveResponse(undefined)).toBe(SAVE_RESPONSE.ERROR);
    expect(classifySheetSaveResponse(null)).toBe(SAVE_RESPONSE.ERROR);
    expect(classifySheetSaveResponse('oops')).toBe(SAVE_RESPONSE.ERROR);
  });
});
