import 'regenerator-runtime/runtime';
import { setupSefaria, getPropsByUrl } from './tests/testUtils';
import '@testing-library/jest-dom/extend-expect';
import { server } from './__mocks__/msw/server';


beforeAll(() => {
    server.listen();
    setupSefaria(getPropsByUrl('/texts', ['']));
});
afterEach(() => server.resetHandlers());
afterAll(() => server.close());