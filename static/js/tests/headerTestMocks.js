// Shared jest.mock factories for Header tests. Header's children are stubbed so the tests cover only
// Header's own choice of what to render (mobile vs. desktop bar, hidden on mobile text pages).
const React = require("react");

const stub = (name) => ({ children }) => React.createElement("span", { "data-stub": name }, children);

const sefariaMock = () => ({
  __esModule: true,
  default: {
    _: (k) => k,
    _v: ({ en }) => en,
    _uid: null,
    _debug: false,
    _siteSettings: { TORAH_SPECIFIC: true, HELP_CENTER_URLS: { HE: "/help-he", EN_US: "/help" } },
    interfaceLang: "english",
    activeModule: "library",
    LIBRARY_MODULE: "library",
    VOICES_MODULE: "voices",
    breakpoints: { MOBILE: "mobile", TABLET: "tablet", DESKTOP: "desktop" },
    getBreakpoint: jest.fn(() => "desktop"),
    getLogoutUrl: () => "/logout",
  },
});

const miscMock = () => ({
  GlobalWarningMessage: () => null,
  InterfaceLanguageMenu: stub("InterfaceLanguageMenu"),
  InterfaceText: ({ children, text }) => React.createElement("span", null, children || text?.en),
  LanguageToggleButton: stub("LanguageToggleButton"),
  DonateLink: stub("DonateLink"),
  useOnceFullyVisible: () => null,
});

const dropdownMenuMock = () => ({
  DropdownMenu: stub("DropdownMenu"),
  DropdownMenuSeparator: stub("DropdownMenuSeparator"),
  DropdownMenuItem: stub("DropdownMenuItem"),
  DropdownModuleItem: stub("DropdownModuleItem"),
  DropdownLanguageToggle: stub("DropdownLanguageToggle"),
  NextRedirectAnchor: stub("NextRedirectAnchor"),
});

const headerProps = (overrides = {}) => ({
  multiPanel: true,
  headerMode: false,
  onRefClick: () => {},
  showSearch: () => {},
  openTopic: () => {},
  openURL: () => {},
  module: "library",
  mobileNavMenuOpen: false,
  firstPanel: { menuOpen: "navigation", mode: null, settings: { language: "english" } },
  ...overrides,
});

const textPanel = { menuOpen: null, mode: "Text", settings: { language: "english" } };

module.exports = { stub, sefariaMock, miscMock, dropdownMenuMock, headerProps, textPanel };
