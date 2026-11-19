// src/shell (PLAN §2.1): the portal chrome. PortalHeader (self-contained), the frame, the sidebar of docs and
// reference pages, the Copy Page split button, the feedback widget, the 404 page. W2.
export {
  PortalHeader,
  SkipLink,
  SEARCH_OPEN_EVENT,
  NOT_FOUND_SECTION_LABEL,
  NOT_FOUND_SUBNAV_LABEL,
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
export { Sidebar, ExternalLinkIcon, type SidebarProps } from './Sidebar/Sidebar';
export {
  isFilterShortcut,
  SIDEBAR_LABEL,
  FILTER_LABEL,
  NO_MATCHES,
  HIDE_SIDEBAR_LABEL,
  SHOW_SIDEBAR_LABEL,
  MOBILE_QUERY,
} from './Sidebar/constants';
export { SIDEBAR_COLLAPSED_KEY, useSidebarCollapsed } from './Sidebar/collapse';
export { filterCategories, groupsContaining } from './Sidebar/tree';
export { CopyPage, type CopyPageProps, type CopyPageEnv } from './CopyPage/CopyPage';
export {
  MCP_SERVER_NAME,
  chatGptUrl,
  claudeUrl,
  cursorDeepLink,
  vscodeDeepLink,
  mcpConfig,
  mcpCommand,
} from './CopyPage/actions';
export { Feedback, type FeedbackProps } from './Feedback/Feedback';
export { FEEDBACK_STRINGS } from './Feedback/strings';
export { CSRF_URL, FEEDBACK_URL, COMMENT_MAX_LENGTH, feedbackBody, sendFeedback } from './Feedback/api';
export {
  EndpointFooter,
  type EndpointFooterProps,
  type EndpointFooterPlacement,
} from './EndpointFooter/EndpointFooter';
