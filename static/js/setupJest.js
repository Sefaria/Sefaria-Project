import 'regenerator-runtime/runtime';
import '@testing-library/jest-dom/extend-expect';
import { server } from './__mocks__/msw/server';
import Sefaria from './sefaria/sefaria';
import DJANGO_DATA_VARS from './__mocks__/msw/data';

Sefaria.setup(DJANGO_DATA_VARS);
Sefaria.interfaceLang = "english";
beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());