/**
 * Route registry for the `reader` feature (owned by the `reader` agent). Imported by ../routes.js.
 * `ref` claims section- and segment-level refs only (see ./refKind.js); book-level refs are the
 * browse agent's `book` route and unknown paths fall through to the server.
 */
import { registerRoute } from '../router';
import ReaderPage from './ReaderPage';
import { matchReaderRef } from './refKind';
import './strings';
import './tools/builtin';
import '../tools/learn/index';

registerRoute({
  name: 'ref',
  match: matchReaderRef,
  component: ReaderPage,
  title: (params) => params.tref,
});
