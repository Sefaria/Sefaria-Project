// src/docs (PLAN §2.1, W7): the docs page layout and the behaviours attached to server-rendered
// article HTML (code tabs, copy buttons, highlighting, heading anchors, lightbox, TOC scroll spy,
// embeds, HTML-block frame sizing), the docs sidebar tree and the page footer.
import './docs.css';

export { DocPage, type DocPageProps, type DocPageSlots } from './DocPage';
export { DocBody, type DocBodyProps } from './DocBody';
export { takeServerBody, BODY_ELEMENT_ID } from './adopt';
export { DocsSidebarTree, ExternalLinkIcon } from './DocsSidebarTree';
export { containsPath } from './sidebar';
export { TableOfContents, TOC_LABEL, type TocItem } from './TableOfContents';
export { PageFooter, Pagination, UpdatedAt, PAGINATION_LABEL, DISCORD_PLACEMENT } from './PageFooter';
export { enhanceArticle, type Enhanced, type EnhanceOptions } from './enhance';
export { enhanceCodeTabs } from './codetabs';
export { enhanceCopyButtons, COPY_LABEL, COPIED_LABEL } from './copy';
export { enhanceHighlighting, highlightElement, loadTokenizer, modeFor } from './highlight';
export { enhanceLightbox, openLightbox } from './lightbox';
export { enhanceEmbeds } from './embeds';
export { enhanceContactForm, ANALYTICS_EVENT, CONTACT_FORM_TITLE } from './contactForm';
export { enhanceHtmlBlockFrames, sizeFrame, FRAME_SANDBOX } from './htmlblock';
export { attachScrollSpy } from './toc';
export { flattenPages, pagerFor } from './pager';
export { relativeTime, updatedText } from './relativeTime';
export type { Cleanup } from './types';
