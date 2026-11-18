// YouTube embeds (contract C6 `YouTubeEmbed`). The renderer emits
//   div.dp-embed > div.dp-embed-media > iframe.dp-embed-iframe[src=https://www.youtube-nocookie.com/embed/<id>]
// (DIALECT.md, Embed). This makes sure every frame has an accessible title and sends the referrer
// YouTube's player requires, and removes any embed frame that does not point at youtube-nocookie
// (the sanitizer already guarantees that; this is defence in depth for HTML adopted from elsewhere).
import type { Cleanup } from './types';

export const YOUTUBE_ORIGIN = 'https://www.youtube-nocookie.com/';
export const DEFAULT_EMBED_TITLE = 'YouTube embed';

export function enhanceEmbeds(root: ParentNode): Cleanup {
  for (const frame of root.querySelectorAll<HTMLIFrameElement>('.dp-embed iframe')) {
    const src = frame.getAttribute('src') ?? '';
    if (!src.startsWith(YOUTUBE_ORIGIN)) {
      frame.remove();
      continue;
    }
    if (!frame.title.trim()) frame.title = DEFAULT_EMBED_TITLE;
    frame.referrerPolicy = 'strict-origin-when-cross-origin';
    frame.loading = 'lazy';
  }
  return () => {};
}
