import 'regenerator-runtime/runtime';
import { server } from './__mocks__/msw/server.js';
import Sefaria from './sefaria/sefaria';

Sefaria.interfaceLang = "english";
beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());