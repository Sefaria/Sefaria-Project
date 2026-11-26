// Spec descriptions are Markdown. Raw HTML is not allowed (markdown-it escapes it), links are validated by
// markdown-it (no javascript:), and a single newline is a line break, as live renders them.
import MarkdownIt from 'markdown-it';

const markdown = new MarkdownIt({ html: false, breaks: true, linkify: false });

export function renderMarkdown(source: string): string {
  return markdown.render(source);
}
