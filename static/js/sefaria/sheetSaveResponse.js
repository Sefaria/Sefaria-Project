/*
  Classifies the JSON body returned by POST /api/sheets/.
  The server answers HTTP 200 both for a stored save and for a rejected one: when the sheet was
  changed elsewhere since the editor last loaded it, the body is the stored sheet plus
  `error` and `rebuild`, and nothing was written. Only a body with neither is a successful save.
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
  return SAVE_RESPONSE.SAVED;
}
