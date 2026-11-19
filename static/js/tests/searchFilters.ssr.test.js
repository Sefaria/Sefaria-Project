/**
 * @jest-environment node
 *
 * The Node server renderer (node/server.js) renders search pages with
 * ReactDOMServer. SearchFilterGroup must not read `document` while it renders:
 * `document` does not exist on the server, so the whole page render threw.
 */
import React from 'react';
import ReactDOMServer from 'react-dom/server';
// Misc.jsx transitively imports a .css file, which this repo's Jest setup has no
// transform for. Only InterfaceText is reached from this tree, and it renders text.
jest.mock('../Misc.jsx', () => ({
  InterfaceText: ({ text, children }) => children ?? (text ? text.en : null),
  LoadingMessage: () => null,
  CloseButton: () => null,
}));

import Sefaria from '../sefaria/sefaria';
import { SearchFilterGroup } from '../SearchFilters';

const makeFilter = (aggKey, title) => ({
  aggKey,
  title,
  heTitle: title,
  selected: 0,
  children: [],
  isPartial: () => false,
  getLeafNodes: () => [],
  getSelectedTitles: () => [],
});

describe('SearchFilterGroup under Node SSR (no document)', () => {
  it('renders without touching document', () => {
    expect(typeof document).toBe('undefined');
    Sefaria.interfaceLang = 'english';
    const html = ReactDOMServer.renderToString(
      <SearchFilterGroup
        name="Texts"
        searchable={true}
        filters={[makeFilter('Tanakh', 'Tanakh')]}
        updateSelected={() => {}}
        expandable={true}
      />
    );
    expect(html).toContain('Tanakh');
  });
});
