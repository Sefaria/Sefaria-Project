/**
 * ConnectionsPanel.setCurrentVersions when the text cannot be loaded.
 *
 * The error branch sets the version state to empty. It must return there: the code
 * after it reads data.versions and data.text, which do not exist on an error response.
 */
// Stylesheets imported by the component tree cannot be parsed by Jest; they carry no logic.
jest.mock('react-image-crop/dist/ReactCrop.css', () => ({}));
// The component tree pulls in editors and widgets that touch DOM APIs jsdom lacks at import
// time. Nothing here renders them, so each import is stubbed with a module whose every
// export is a no-op component.
jest.mock('../ContentText', () => new Proxy({ __esModule: true }, { get: (t, p) => (p in t ? t[p] : () => null) }));
jest.mock('../ConnectionFilters', () => new Proxy({ __esModule: true }, { get: (t, p) => (p in t ? t[p] : () => null) }));
jest.mock('../context', () => new Proxy({ __esModule: true }, { get: (t, p) => (p in t ? t[p] : () => null) }));
jest.mock('../SidebarSearch', () => new Proxy({ __esModule: true }, { get: (t, p) => (p in t ? t[p] : () => null) }));
jest.mock('../TextList', () => new Proxy({ __esModule: true }, { get: (t, p) => (p in t ? t[p] : () => null) }));
jest.mock('../ConnectionsPanelHeader', () => new Proxy({ __esModule: true }, { get: (t, p) => (p in t ? t[p] : () => null) }));
jest.mock('../AddToSourceSheet', () => new Proxy({ __esModule: true }, { get: (t, p) => (p in t ? t[p] : () => null) }));
jest.mock('../LexiconBox', () => new Proxy({ __esModule: true }, { get: (t, p) => (p in t ? t[p] : () => null) }));
jest.mock('../AboutBox', () => new Proxy({ __esModule: true }, { get: (t, p) => (p in t ? t[p] : () => null) }));
jest.mock('../GuideBox', () => new Proxy({ __esModule: true }, { get: (t, p) => (p in t ? t[p] : () => null) }));
jest.mock('../TranslationsBox', () => new Proxy({ __esModule: true }, { get: (t, p) => (p in t ? t[p] : () => null) }));
jest.mock('../LinkerAdminBox', () => new Proxy({ __esModule: true }, { get: (t, p) => (p in t ? t[p] : () => null) }));
jest.mock('../LexiconHeadwordEditBox', () => new Proxy({ __esModule: true }, { get: (t, p) => (p in t ? t[p] : () => null) }));
jest.mock('../LexiconContentEditBox', () => new Proxy({ __esModule: true }, { get: (t, p) => (p in t ? t[p] : () => null) }));
jest.mock('../ExtendedNotes', () => new Proxy({ __esModule: true }, { get: (t, p) => (p in t ? t[p] : () => null) }));
jest.mock('../BookPage', () => new Proxy({ __esModule: true }, { get: (t, p) => (p in t ? t[p] : () => null) }));
jest.mock('../CollectionsWidget', () => new Proxy({ __esModule: true }, { get: (t, p) => (p in t ? t[p] : () => null) }));
jest.mock('../TopicSearch', () => new Proxy({ __esModule: true }, { get: (t, p) => (p in t ? t[p] : () => null) }));
jest.mock('../WebPage', () => new Proxy({ __esModule: true }, { get: (t, p) => (p in t ? t[p] : () => null) }));
jest.mock('../sefaria/signupModalContent', () => new Proxy({ __esModule: true }, { get: (t, p) => (p in t ? t[p] : () => null) }));
jest.mock('../Misc', () => new Proxy({ __esModule: true }, { get: (t, p) => (p in t ? t[p] : () => null) }));
jest.mock('../LexiconEntryEditBox', () => new Proxy({ __esModule: true }, { get: (t, p) => (p in t ? t[p] : () => null) }));
jest.mock('../LexiconWysiwygValue', () => new Proxy({ __esModule: true }, { get: (t, p) => (p in t ? t[p] : () => null) }));
jest.mock('../AdminEditor', () => new Proxy({ __esModule: true }, { get: (t, p) => (p in t ? t[p] : () => null) }));
jest.mock('react-image-crop', () => new Proxy({ __esModule: true }, { get: (t, p) => (p in t ? t[p] : () => null) }));
jest.mock('react-tag-autocomplete', () => new Proxy({ __esModule: true }, { get: (t, p) => (p in t ? t[p] : () => null) }));
jest.mock('react-simple-wysiwyg', () => new Proxy({ __esModule: true }, { get: (t, p) => (p in t ? t[p] : () => null) }));
jest.mock('dompurify', () => new Proxy({ __esModule: true }, { get: (t, p) => (p in t ? t[p] : () => null) }));
jest.mock('json-edit-react', () => new Proxy({ __esModule: true }, { get: (t, p) => (p in t ? t[p] : () => null) }));

import { ConnectionsPanel } from '../ConnectionsPanel';

const makePanel = (data) => {
  const panel = Object.create(ConnectionsPanel.prototype);
  panel.props = {
    srefs: ['Genesis 1:1'],
    currVersions: {},
    translationLanguagePreference: null,
    masterPanelLanguage: 'english',
  };
  panel.setState = jest.fn();
  panel.getData = jest.fn().mockResolvedValue(data);
  return panel;
};

describe('ConnectionsPanel.setCurrentVersions', () => {
  test('stops after clearing versions when the text response is an error', async () => {
    const panel = makePanel({ error: 'Text not found' });

    await expect(panel.setCurrentVersions()).resolves.toBeUndefined();

    expect(panel.setState).toHaveBeenCalledTimes(1);
    expect(panel.setState).toHaveBeenCalledWith({
      currObjectVersions: { en: null, he: null },
    });
  });

  test('stops after clearing versions when no text response is available', async () => {
    const panel = makePanel(null);

    await expect(panel.setCurrentVersions()).resolves.toBeUndefined();

    expect(panel.setState).toHaveBeenCalledTimes(1);
  });
});
