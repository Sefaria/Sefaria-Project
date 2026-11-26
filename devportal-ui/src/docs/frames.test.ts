// Embeds and HTMLBlock frames.
import { axe } from 'vitest-axe';
import { DEFAULT_EMBED_TITLE, enhanceEmbeds } from './embeds';
import {
  FRAME_SANDBOX,
  enhanceHtmlBlockFrames,
  frameContentHeight,
  frameOuterMargins,
  sizeFrame,
  subpixelShift,
} from './htmlblock';
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

  it('passes the margins that collapse out of the block on to its wrapper and takes them out of the frame', () => {
    const frame = frameWithHeight(500);
    const doc = frame.contentDocument!;
    // The Hebrew guide's block: an h2 (28px top margin) first, then trailing text after the last element.
    doc.body.innerHTML =
      '<div class="dp-markdown dp-htmlblock-document"><div><h2>Title</h2><p>Body</p>Trailing text</div></div>';
    const content = doc.body.firstElementChild as HTMLElement;
    const h2 = doc.querySelector('h2')!;
    const p = doc.querySelector('p')!;
    vi.spyOn(content.firstElementChild!, 'getBoundingClientRect').mockReturnValue({ top: 0, bottom: 500 } as DOMRect);
    vi.spyOn(content, 'getBoundingClientRect').mockReturnValue({ top: 0, bottom: 500 } as DOMRect);
    vi.spyOn(h2, 'getBoundingClientRect').mockReturnValue({ top: 28, bottom: 60 } as DOMRect);
    vi.spyOn(p, 'getBoundingClientRect').mockReturnValue({ top: 75, bottom: 470 } as DOMRect);
    expect(frameOuterMargins(frame)).toEqual({ top: 28, bottom: 0 });
    sizeFrame(frame);
    const block = frame.parentElement!;
    expect(block.style.getPropertyValue('margin-top')).toBe('28px');
    expect(block.style.getPropertyPriority('margin-top')).toBe('important');
    expect(block.style.getPropertyValue('margin-bottom')).toBe('');
    expect(content.style.marginTop).toBe('-28px');
    expect(frame).not.toHaveAttribute('style');
  });

  it("keeps a block's own last-element margin: the CTA's 32px bottom margin goes to the wrapper (powered-by)", () => {
    const frame = frameWithHeight(267);
    const doc = frame.contentDocument!;
    // The frame document's shape (htmlblock_frame.html): the block in its own box, so the article's last-child reset
    // does not reach the block's elements. The CTA is a flex box; its margin collapses out of the block's box.
    doc.body.innerHTML =
      '<div class="dp-markdown dp-htmlblock-document"><div class="dp-htmlblock-html"><style></style>' +
      '<div class="pbs-cta" style="display: flex">CTA</div></div></div>';
    const content = doc.body.firstElementChild as HTMLElement;
    vi.spyOn(content, 'getBoundingClientRect').mockReturnValue({ top: 0, bottom: 298.69 } as DOMRect);
    vi.spyOn(content.firstElementChild!, 'getBoundingClientRect').mockReturnValue({
      top: 0,
      bottom: 266.69,
    } as DOMRect);
    expect(frameOuterMargins(frame)).toEqual({ top: 0, bottom: 32 });
    sizeFrame(frame);
    expect(frame.parentElement!.style.getPropertyValue('margin-bottom')).toBe('32px');
    expect(content.style.marginBottom).toBe('-32px');
  });

  it('moves the content by the sub-pixel part of the frame position, as live draws the inline block (D-12)', () => {
    const frame = frameWithHeight(267);
    const doc = frame.contentDocument!;
    doc.body.innerHTML = '<div class="dp-markdown dp-htmlblock-document"><div class="dp-htmlblock-html"></div></div>';
    const content = doc.body.firstElementChild as HTMLElement;
    // The frame at y 279.69 is painted at 280: its content moves up 0.31px, to live's coordinates.
    vi.spyOn(frame, 'getBoundingClientRect').mockReturnValue({ top: 279.6875 } as DOMRect);
    expect(subpixelShift(frame)).toBe(-0.31);
    sizeFrame(frame);
    expect(content.style.marginTop).toBe('-0.31px');
    // On a whole pixel nothing moves.
    vi.spyOn(frame, 'getBoundingClientRect').mockReturnValue({ top: 280 } as DOMRect);
    sizeFrame(frame);
    expect(content.style.marginTop).toBe('');
  });

  it('leaves the height alone while the frame has no layout', () => {
    const frame = frameWithHeight(0);
    expect(sizeFrame(frame)).toBeNull();
    expect(frame).not.toHaveAttribute('height');
  });
});
