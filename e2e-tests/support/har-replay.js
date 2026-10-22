import { randomUUID } from 'crypto';
import { readFileSync, unlinkSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';

/**
 * Shared HAR replay helpers for the e2e fixtures (support/har-fixture.js for the newsletter
 * suite, support/strapi-har-fixture.js for the retired Strapi recordings). Use these in any new
 * HAR-backed fixture instead of writing another copy.
 *
 * The problem they solve: Playwright replays a HAR entry only when the request URL matches the
 * recorded one exactly, host included. Our recordings are made at http://localhost:8000, but the
 * app calls its APIs with relative URLs, so on any other host (127.0.0.1, or the merge queue's
 * per-commit sandbox such as http://nginx-integration-<sha>.<namespace>/texts) nothing would
 * replay. `routeFromHAR`'s `url` option only filters which requests are intercepted; it does not
 * rewrite the entries. So before replaying, we point the entries at the host under test.
 */

/**
 * Return the path of a HAR whose entries use `baseURL`'s host, ready for `routeFromHAR`.
 *
 * Only the origin (scheme, host, port) changes; the recorded path, query, hash and POST body stay
 * as they were. When every entry already uses that origin, the committed file is returned as is.
 * Otherwise a rewritten copy is written to the OS temp folder (so e2e-tests/fixtures/ never
 * changes) and deleted when `context` closes.
 *
 * Playwright finds a HAR's sidecar body files (`_file`) relative to the HAR's own folder, so the
 * copy points at the originals by absolute path instead.
 *
 * @param context  the BrowserContext the HAR is replayed on; the copy lives as long as it does.
 * @param harPath  the committed recording.
 * @param baseURL  the URL the run is using, normally the test's `baseURL` fixture (SANDBOX_URL).
 */
export function harPathForBaseURL(context, harPath, baseURL) {
  const origin = new URL(baseURL).origin;
  const har = JSON.parse(readFileSync(harPath, 'utf8'));
  const entries = har.log?.entries || [];

  if (entries.every((entry) => new URL(entry.request.url).origin === origin)) return harPath;

  const harDir = path.dirname(harPath);
  const withAbsoluteFile = (body) =>
    body && body._file ? { ...body, _file: path.resolve(harDir, body._file) } : body;
  const withOrigin = (url) => {
    const recorded = new URL(url);
    return origin + recorded.pathname + recorded.search + recorded.hash;
  };

  const rewritten = entries.map((entry) => ({
    ...entry,
    request: {
      ...entry.request,
      url: withOrigin(entry.request.url),
      postData: withAbsoluteFile(entry.request.postData),
    },
    response: {
      ...entry.response,
      content: withAbsoluteFile(entry.response.content),
    },
  }));

  // A unique name per call, so parallel workers and repeated tests never share a file.
  const copyPath = path.join(tmpdir(), `sefaria-${path.basename(harPath, '.har')}-${randomUUID()}.har`);
  writeFileSync(copyPath, JSON.stringify({ ...har, log: { ...har.log, entries: rewritten } }));

  // routeFromHAR has read the file by the time it resolves, but keep it for the context's
  // lifetime in case Playwright needs it again while serving a later reload.
  context.once('close', () => {
    try {
      unlinkSync(copyPath);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  });

  return copyPath;
}
