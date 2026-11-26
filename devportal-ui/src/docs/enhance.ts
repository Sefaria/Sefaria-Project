// Attaches every docs behaviour to server-rendered article HTML (PLAN §2.5: React adopts the server's
// body nodes and never re-renders Markdown). Used by DocBody, the HTML-only fallback in page_doc.html's
// bundle path, and the editor's preview.
import { enhanceCodeBlocks } from './codeblocks';
import { enhanceCodeTabs } from './codetabs';
import { enhanceContactForm } from './contactForm';
import { enhanceCopyButtons } from './copy';
import { enhanceEmbeds } from './embeds';
import { enhanceHighlighting, loadTokenizer, type Tokenizer } from './highlight';
import { enhanceHtmlBlockFrames } from './htmlblock';
import { enhanceLightbox } from './lightbox';
import type { Cleanup } from './types';

export interface EnhanceOptions {
  /** Loads the highlighter (tests inject one). */
  loadTokenizer?: () => Promise<Tokenizer>;
  /** Reports contact_form_start (contract C8); defaults to a `dp-analytics` DOM event. */
  onContactFormStart?: () => void;
}

export interface Enhanced {
  /** Resolves when syntax highlighting has finished (the number of blocks highlighted). */
  highlighted: Promise<number>;
  cleanup: Cleanup;
}

export function enhanceArticle(root: HTMLElement, options: EnhanceOptions = {}): Enhanced {
  enhanceCodeBlocks(root);
  const highlight = enhanceHighlighting(root, options.loadTokenizer ?? loadTokenizer);
  const cleanups: Cleanup[] = [
    enhanceCodeTabs(root),
    enhanceCopyButtons(root),
    enhanceLightbox(root),
    enhanceEmbeds(root),
    enhanceHtmlBlockFrames(root),
    enhanceContactForm(root, options.onContactFormStart),
    highlight.cleanup,
  ];
  return {
    highlighted: highlight.done,
    cleanup: () => cleanups.forEach((c) => c()),
  };
}
