/*
  Classifies the JSON body returned by POST /api/sheets/.
  The server answers HTTP 200 both for a stored save and for a rejected one: when the sheet was
  changed elsewhere since the editor last loaded it, the body is the stored sheet plus
  `error` and `rebuild`, and nothing was written. Only a body with neither, that also carries the
  sheet `id` and its new modification time (`dateModified`), is a successful save: the modification
  time is what the next save sends for conflict detection, so a body without it cannot be trusted.
*/
export const SAVE_RESPONSE = {
  SAVED: 'saved',
  CONFLICT: 'conflict',
  ERROR: 'error',
};

export function classifySheetSaveResponse(res) {
  if (!res || typeof res !== 'object') {
    return SAVE_RESPONSE.ERROR;
  }
  if (res.rebuild) {
    return SAVE_RESPONSE.CONFLICT;
  }
  if (res.error) {
    return SAVE_RESPONSE.ERROR;
  }
  if (res.id === undefined || res.id === null || !res.dateModified) {
    return SAVE_RESPONSE.ERROR;
  }
  return SAVE_RESPONSE.SAVED;
}

/*
  Each save carries the document revision (a counter bumped on every local change) it was built from.
  When its response arrives, the local state may be marked saved only if nothing changed since.
*/
export function isCurrentRevision(saveRevision, currentRevision) {
  return saveRevision === currentRevision;
}
