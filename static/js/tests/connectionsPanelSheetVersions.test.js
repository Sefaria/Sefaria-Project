// A sheet ref is a virtual node with no text versions, so the version based texts API has
// nothing to answer for it. The connections panel must not ask for it, and must not throw on a
// response whose versions array is empty.
jest.mock('../sefaria/sefaria', () => ({
  __esModule: true,
  default: {
    isSheetRef: (ref) => ref.startsWith('Sheet'),
    sectionRef: (ref) => ref,
    getPrimaryAndTranslationFromVersions: (versions) => {
      if (versions.length === 1) return [versions[0], { text: [] }];
      if (versions[0].isPrimary && !versions[1].isSource) return versions;
      return [versions[1], versions[0]];
    },
  },
}));
jest.mock('../sefaria/util', () => ({ __esModule: true, default: {} }));
jest.mock('../sefaria/sefariaJquery', () => ({ __esModule: true, default: () => {} }));
jest.mock('../Misc', () => new Proxy({}, { get: () => () => null }));
jest.mock('../ContentText', () => new Proxy({}, { get: () => () => null }));
jest.mock('../Media', () => new Proxy({}, { get: () => () => null }));
jest.mock('../ConnectionFilters', () => new Proxy({}, { get: () => () => null }));
jest.mock('../context', () => new Proxy({}, { get: () => () => null }));
jest.mock('../SidebarSearch', () => ({ __esModule: true, default: () => null }));
jest.mock('../TextList', () => ({ __esModule: true, default: () => null }));
jest.mock('../ConnectionsPanelHeader', () => ({ __esModule: true, default: () => null }));
jest.mock('../AddToSourceSheet', () => new Proxy({}, { get: () => () => null }));
jest.mock('../LexiconBox', () => ({ __esModule: true, default: () => null }));
jest.mock('../AboutBox', () => ({ __esModule: true, default: () => null }));
jest.mock('../GuideBox', () => ({ __esModule: true, default: () => null }));
jest.mock('../TranslationsBox', () => ({ __esModule: true, default: () => null }));
jest.mock('../LinkerAdminBox', () => ({ __esModule: true, default: () => null }));
jest.mock('../LexiconHeadwordEditBox', () => ({ __esModule: true, default: () => null }));
jest.mock('../LexiconContentEditBox', () => ({ __esModule: true, default: () => null }));
jest.mock('../ExtendedNotes', () => ({ __esModule: true, default: () => null }));
jest.mock('../BookPage', () => new Proxy({}, { get: () => () => null }));
jest.mock('../CollectionsWidget', () => new Proxy({}, { get: () => () => null }));
jest.mock('../TopicSearch', () => ({ __esModule: true, default: () => null }));
jest.mock('../WebPage', () => ({ __esModule: true, default: () => null }));
jest.mock('../sefaria/signupModalContent', () => new Proxy({}, { get: () => () => null }));

import React from 'react';
import { ConnectionsPanel } from '../ConnectionsPanel';

const makePanel = (srefs) => {
  const panel = new ConnectionsPanel({ srefs, currentlyVisibleRef: srefs[0], masterPanelLanguage: 'english' });
  panel.state = { currObjectVersions: { en: null, he: null } };
  panel.setState = (next) => {
    panel.state = { ...panel.state, ...next };
  };
  panel.getData = jest.fn();
  panel.sectionRef = () => srefs[0];
  return panel;
};

describe('ConnectionsPanel.setCurrentVersions', () => {
  it('does not request text versions for a sheet ref', async () => {
    const panel = makePanel(['Sheet.759373']);
    await panel.setCurrentVersions();
    expect(panel.getData).not.toHaveBeenCalled();
    expect(panel.state.currObjectVersions).toEqual({ en: null, he: null });
    expect(panel.state.sectionRef).toBe('Sheet.759373');
  });

  it('stops without throwing when a response carries no versions', async () => {
    const panel = makePanel(['Genesis 1:1']);
    panel.getData.mockResolvedValue({
      ref: 'Genesis 1:1',
      versions: [],
      missings: [['primary', '']],
      text: [],
      he: [],
    });
    await panel.setCurrentVersions();
    expect(panel.getData).toHaveBeenCalled();
    expect(panel.state.currObjectVersions).toEqual({ en: null, he: null });
  });

  it('reads the primary and translation versions from a normal text response', async () => {
    const primary = { isPrimary: true, isSource: true, text: ['he'] };
    const translation = { isPrimary: false, isSource: false, text: ['en'] };
    const panel = makePanel(['Genesis 1:1']);
    panel.getData.mockResolvedValue({
      ref: 'Genesis 1:1',
      versions: [primary, translation],
      text: ['en'],
      he: ['he'],
      sectionRef: 'Genesis 1',
    });
    await panel.setCurrentVersions();
    // The panel shows one language at a time: with English panel language only the
    // translation is current, because the Hebrew text is available.
    expect(panel.state.currObjectVersions).toEqual({ en: translation, he: null });
    expect(panel.state.sectionRef).toBe('Genesis 1');
  });
});
