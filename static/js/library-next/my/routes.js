/**
 * Route registry for the `my` feature (My Library hub). Imported by ../routes.js.
 * One canonical route, `my` → `/my/*`; `MyHub` dispatches on `params.rest`
 * (shelf, history, notes, plans, flashcards, lessons[/new|/<id>[/handout]|/shared], notebook, data).
 */
import { registerRoute } from '../router';
import MyHub, { titleKeyFor } from './MyHub';
import './strings';

registerRoute({
  name: 'my',
  path: '/my/*',
  component: MyHub,
  title: (params, t) => t(titleKeyFor(params.rest)),
});
