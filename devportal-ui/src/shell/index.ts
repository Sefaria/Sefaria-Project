// src/shell (PLAN §2.1): the portal chrome. PortalHeader (self-contained), the frame, the 404 page. W2.
export {
  PortalHeader,
  SkipLink,
  SEARCH_OPEN_EVENT,
  type PortalHeaderProps,
  type PortalHeaderSubnav,
} from './PortalHeader/PortalHeader';
export {
  PRIMARY_LINKS,
  LINKS_MENU_ITEMS,
  DRAWER_LINKS,
  type HeaderNavLink,
  type PortalHeaderTab,
} from './PortalHeader/headerLinks';
export { PortalFrame, type FrameLayout, type PortalFrameProps } from './PortalFrame/PortalFrame';
export { NotFoundPage, type NotFoundSuggestion } from './NotFoundPage/NotFoundPage';
