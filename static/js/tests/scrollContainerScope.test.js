/**
 * Scroll and focus lookups in the reader panels stay inside their own panel.
 *
 * With two panels open, a panel's scroll bookkeeping must read and write only its own
 * DOM subtree. Document-wide lookups reach into sibling panels.
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
jest.mock('../TextRange', () => new Proxy({ __esModule: true }, { get: (t, p) => (p in t ? t[p] : () => null) }));
jest.mock('../LexiconEntryEditBox', () => new Proxy({ __esModule: true }, { get: (t, p) => (p in t ? t[p] : () => null) }));
jest.mock('../LexiconWysiwygValue', () => new Proxy({ __esModule: true }, { get: (t, p) => (p in t ? t[p] : () => null) }));
jest.mock('../AdminEditor', () => new Proxy({ __esModule: true }, { get: (t, p) => (p in t ? t[p] : () => null) }));
jest.mock('react-image-crop', () => new Proxy({ __esModule: true }, { get: (t, p) => (p in t ? t[p] : () => null) }));
jest.mock('react-tag-autocomplete', () => new Proxy({ __esModule: true }, { get: (t, p) => (p in t ? t[p] : () => null) }));
jest.mock('react-simple-wysiwyg', () => new Proxy({ __esModule: true }, { get: (t, p) => (p in t ? t[p] : () => null) }));
jest.mock('dompurify', () => new Proxy({ __esModule: true }, { get: (t, p) => (p in t ? t[p] : () => null) }));
jest.mock('json-edit-react', () => new Proxy({ __esModule: true }, { get: (t, p) => (p in t ? t[p] : () => null) }));

import ReactDOM from 'react-dom';
import $ from '../sefaria/sefariaJquery';
import { ConnectionsPanel } from '../ConnectionsPanel';
import TextColumn from '../TextColumn';

// Two reader panels side by side, each with its own text column and connections panel.
const buildTwoPanels = () => {
  document.body.innerHTML = `
    <div class="readerPanel" id="panelA">
      <div class="textColumn" id="textA">
        <div class="textRange" data-ref="Genesis 1">
          <div class="basetext"><span class="segment" data-ref="Genesis 1:1" tabindex="0">a</span></div>
        </div>
      </div>
      <div class="connectionsPanel"><div class="texts content" id="connA"></div></div>
    </div>
    <div class="readerPanel" id="panelB">
      <div class="textColumn" id="textB">
        <div class="textRange" data-ref="Genesis 2">
          <div class="basetext"><span class="segment" data-ref="Genesis 2:2" tabindex="0">b</span></div>
        </div>
      </div>
      <div class="connectionsPanel"><div class="texts content" id="connB"></div></div>
    </div>`;
  return {
    panelB: document.getElementById('panelB'),
    textA: document.getElementById('textA'),
    connA: document.getElementById('connA'),
    connB: document.getElementById('connB'),
  };
};

// jsdom does not keep scrollTop writes, so each element gets a plain accessor to record them.
const recordScrollTop = (el) => {
  let value = 0;
  Object.defineProperty(el, 'scrollTop', {
    configurable: true,
    get: () => value,
    set: (v) => { value = v; },
  });
};

afterEach(() => {
  jest.restoreAllMocks();
  document.body.classList.remove('user-is-tabbing');
  document.body.innerHTML = '';
});

describe('ConnectionsPanel scroll listener scope', () => {
  test('attaches the scroll listener to its own panel, not the first panel in the document', () => {
    const { panelB, connA, connB } = buildTwoPanels();
    const panel = Object.create(ConnectionsPanel.prototype);
    panel.props = { mode: 'Sheets' };
    jest.spyOn(ReactDOM, 'findDOMNode').mockReturnValue(panelB);
    const spyA = jest.spyOn(connA, 'addEventListener');
    const spyB = jest.spyOn(connB, 'addEventListener');

    panel.addScrollListener();

    expect(spyB).toHaveBeenCalledWith('scroll', panel.handleScroll);
    expect(spyA).not.toHaveBeenCalled();
  });

  test('restores the saved scroll position only on its own panel', () => {
    const { panelB, connA, connB } = buildTwoPanels();
    recordScrollTop(connA);
    recordScrollTop(connB);
    const srefs = ['Genesis 2:2'];
    srefs.compare = () => true;
    const props = {
      mode: 'Sheets',
      scrollPosition: 120,
      srefs,
      currVersions: {},
      masterPanelLanguage: 'english',
      connectionsCategory: null,
      setSideScrollPosition: jest.fn(),
    };
    const panel = Object.create(ConnectionsPanel.prototype);
    panel.props = props;
    panel.setCurrentVersions = jest.fn();
    jest.spyOn(ReactDOM, 'findDOMNode').mockReturnValue(panelB);
    const prevProps = { ...props, mode: 'TextList' };

    panel.componentDidUpdate(prevProps, {});

    expect(connB.scrollTop).toBe(120);
    expect(connA.scrollTop).toBe(0);
  });
});

describe('TextColumn focused-segment lookup scope', () => {
  const makeColumn = (node) => {
    const column = Object.create(TextColumn.prototype);
    column.props = {
      multiPanel: true,
      mode: 'Text',
      hasSidebar: false,
      setCurrentlyVisibleRef: jest.fn(),
      setTextListHighlight: jest.fn(),
    };
    column._isMounted = true;
    column.node = node;
    column.$container = $(node);
    column.windowMiddle = 10;
    column.highlightThreshhold = 140;
    return column;
  };

  test('ignores a segment focused in a sibling panel while tabbing', () => {
    const { textA } = buildTwoPanels();
    document.body.classList.add('user-is-tabbing');
    document.querySelector('#panelB .segment').focus();
    const column = makeColumn(textA);

    column.adjustHighlightedAndVisible();

    expect(column.props.setCurrentlyVisibleRef).not.toHaveBeenCalledWith('Genesis 2');
    expect(column.props.setTextListHighlight).not.toHaveBeenCalled();
  });

  test('uses a segment focused inside its own panel while tabbing', () => {
    const { textA } = buildTwoPanels();
    document.body.classList.add('user-is-tabbing');
    document.querySelector('#panelA .segment').focus();
    const column = makeColumn(textA);

    column.adjustHighlightedAndVisible();

    expect(column.props.setCurrentlyVisibleRef).toHaveBeenCalledWith('Genesis 1');
  });
});
