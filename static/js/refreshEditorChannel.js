/**
 * Cross-tab "refresh the open sheet" broadcast.
 *
 * A message names the sheet that changed. Receivers reload only when that
 * sheet is the one they have open.
 */

export const REFRESH_EDITOR_CHANNEL = 'refresh-editor';

export function postRefreshEditor(sheetId) {
  const channel = new BroadcastChannel(REFRESH_EDITOR_CHANNEL);
  channel.postMessage({ type: 'refresh', sheetId });
  channel.close();
}

/**
 * Listen for refresh requests for one sheet.
 *
 * Messages without a sheet id (the older unscoped form) are treated as
 * applying to any open sheet.
 *
 * Returns an unsubscribe function that closes the channel.
 */
export function subscribeRefreshEditor({ sheetId, onRefresh }) {
  const channel = new BroadcastChannel(REFRESH_EDITOR_CHANNEL);
  const handleMessage = (event) => {
    const data = event.data;
    if (data && typeof data === 'object' && data.sheetId != null && String(data.sheetId) !== String(sheetId)) {
      return;
    }
    onRefresh();
  };
  channel.addEventListener('message', handleMessage);
  return () => {
    channel.removeEventListener('message', handleMessage);
    channel.close();
  };
}
