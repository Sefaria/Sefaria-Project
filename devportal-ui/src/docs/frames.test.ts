// Embeds and HTMLBlock frames.
import { axe } from 'vitest-axe';
import { DEFAULT_EMBED_TITLE, enhanceEmbeds } from './embeds';
import { FRAME_SANDBOX, enhanceHtmlBlockFrames, frameContentHeight, sizeFrame } from './htmlblock';
import { golden, mountArticle } from './test-utils';

afterEach(() => {
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('enhanceEmbeds', () => {
  it('keeps the golden YouTube frames, titled and with a referrer policy', async () => {
    const root = mountArticle(golden('14-embed'));
    enhanceEmbeds(root);
    const frames = root.querySelectorAll<HTMLIFrameElement>('.dp-embed iframe');
    expect(frames).toHaveLength(2);
    expect(frames[0]).toHaveAttribute('title', 'Sefaria Research at PyConn 2024');
    expect(frames[1]).toHaveAttribute('title', DEFAULT_EMBED_TITLE);
    for (const f of frames) {
      expect(f.src.startsWith('https://www.youtube-nocookie.com/embed/')).toBe(true);
      expect(f.referrerPolicy).toBe('strict-origin-when-cross-origin');
    }
    expect(root.querySelector('.dp-embed-link a')).toHaveAttribute(
      'href',
      'https://github.com/Sefaria/Sefaria-Project'
    );
    expect(await axe(root, { iframes: false })).toHaveNoViolations();
  });

  it('removes an embed frame that is not youtube-nocookie and titles an untitled one', () => {
    const root = mountArticle(
      '<div class="dp-embed"><div class="dp-embed-media"><iframe src="https://evil.example/x"></iframe></div></div>' +
        '<div class="dp-embed"><div class="dp-embed-media"><iframe src="https://www.youtube-nocookie.com/embed/a"></iframe></div></div>'
    );
    enhanceEmbeds(root);
    const frames = root.querySelectorAll('iframe');
    expect(frames).toHaveLength(1);
    expect(frames[0]).toHaveAttribute('title', DEFAULT_EMBED_TITLE);
  });
});

function frameWithHeight(height: number): HTMLIFrameElement {
  const root = mountArticle(golden('15-htmlblock'));
  const frame = root.querySelector<HTMLIFrameElement>('iframe.dp-htmlblock-frame')!;
  // jsdom does not load the frame's URL; give it a same-origin document to measure.
  const doc = document.implementation.createHTMLDocument('HTML block');
  Object.defineProperty(frame, 'contentDocument', { configurable: true, get: () => doc });
  vi.spyOn(doc.documentElement, 'getBoundingClientRect').mockReturnValue({ height } as DOMRect);
  return frame;
}

describe('HTMLBlock frames', () => {
  it('golden frames carry the sandbox without allow-scripts', () => {
    const root = mountArticle(golden('15-htmlblock'));
    const frames = root.querySelectorAll('iframe.dp-htmlblock-frame');
    expect(frames.length).toBeGreaterThan(0);
    for (const f of frames) {
      expect(f.getAttribute('sandbox')).toBe(FRAME_SANDBOX);
      expect(f.getAttribute('sandbox')).not.toContain('allow-scripts');
      expect(f.getAttribute('src')).toMatch(/^\/_portal\/htmlblock\/[A-Za-z0-9_-]+\/\d+$/);
    }
  });

  it('sizes a frame to its content through the height attribute, never a style', () => {
    const frame = frameWithHeight(812.4);
    expect(frameContentHeight(frame)).toBe(813);
    expect(sizeFrame(frame)).toBe(813);
    expect(frame).toHaveAttribute('height', '813');
    expect(frame).not.toHaveAttribute('style');
  });

  it('resizes on load and on window resize, and resets a widened sandbox', () => {
    const frame = frameWithHeight(400);
    frame.setAttribute('sandbox', 'allow-scripts allow-same-origin');
    const cleanup = enhanceHtmlBlockFrames(frame.parentElement!.parentElement!);
    expect(frame.getAttribute('sandbox')).toBe(FRAME_SANDBOX);
    frame.dispatchEvent(new Event('load'));
    expect(frame).toHaveAttribute('height', '400');
    vi.spyOn(frame.contentDocument!.documentElement, 'getBoundingClientRect').mockReturnValue({
      height: 250,
    } as DOMRect);
    window.dispatchEvent(new Event('resize'));
    expect(frame).toHaveAttribute('height', '250');
    cleanup();
    vi.spyOn(frame.contentDocument!.documentElement, 'getBoundingClientRect').mockReturnValue({
      height: 100,
    } as DOMRect);
    window.dispatchEvent(new Event('resize'));
    expect(frame).toHaveAttribute('height', '250');
  });

  it('leaves the height alone while the frame has no layout', () => {
    const frame = frameWithHeight(0);
    expect(sizeFrame(frame)).toBeNull();
    expect(frame).not.toHaveAttribute('height');
  });
});
