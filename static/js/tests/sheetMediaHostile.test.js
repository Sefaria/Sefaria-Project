// Sheet media URLs are placed in iframe, img and audio markup. Only allowlisted https media may become
// markup; the same list is enforced on the server (sefaria/sheet_media.py).
import React from 'react';
import ReactDOM from 'react-dom';
import { act } from 'react-dom/test-utils';

jest.mock('../sefaria/sefaria', () => {
  const util = jest.requireActual('../sefaria/util').default;
  return { __esModule: true, default: { _: (k) => k, util } };
});

import { SheetMedia } from '../sheets/SheetContentSegments';
const sheetsSanitize = require('../sheetsSanitize');

const INVALID_URLS = [
  'javascript:alert(1)//x.png',
  'data:text/html,<script>alert(1)</script>.png',
  'https://www.youtube.com/embed/abc onload=alert(1)',
  'https://www.youtube.com/embed/abc" onload="alert(1)',
  "https://www.youtube.com/embed/abc' onload='alert(1)",
  'https://www.youtube.com.evil.example/embed/abc',
  'https://evil.example/embed/abc',
  'https://evil.example/page.html',
  'https://user:pw@example.com/pic.png',
  'https://www.youtube.com/watch?v=abc',
  'vbscript:x.png',
  '',
  null,
  undefined,
  { toString: () => 'https://example.com/a.png' },
];

describe('invalid media URLs are rejected by the shared allowlist', () => {
  test.each(INVALID_URLS)('url %p is not accepted', (url) => {
    expect(sheetsSanitize.isSafeMediaUrl(url)).toBe(false);
    expect(sheetsSanitize.safeMediaUrl(url)).toBeNull();
  });

  test('allowed media is kept and http and protocol-relative URLs are upgraded to https', () => {
    expect(sheetsSanitize.safeMediaUrl('https://www.youtube.com/embed/abc')).toBe('https://www.youtube.com/embed/abc');
    expect(sheetsSanitize.safeMediaUrl('http://example.com/pic.PNG')).toBe('https://example.com/pic.PNG');
    expect(sheetsSanitize.safeMediaUrl('//example.com/song.mp3')).toBe('https://example.com/song.mp3');
    expect(sheetsSanitize.parseMediaUrl('https://open.spotify.com/embed/track/1').kind).toBe('spotify');
    expect(sheetsSanitize.parseMediaUrl('https://bandcamp.com/EmbeddedPlayer/album=1/size=small').kind).toBe(
      'bandcamp'
    );
  });

  test('prototype property names are not treated as embed hosts', () => {
    expect(sheetsSanitize.isSafeMediaUrl('https://constructor/embed/x')).toBe(false);
    expect(sheetsSanitize.isSafeMediaUrl('https://__proto__/embed/x')).toBe(false);
  });
});

describe('SheetMedia with invalid media', () => {
  let container;
  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    window.__sheetMediaRan = undefined;
  });
  afterEach(() => {
    ReactDOM.unmountComponentAtNode(container);
    container.remove();
    delete window.__sheetMediaRan;
  });

  const render = (media) => {
    act(() => {
      ReactDOM.render(
        <SheetMedia
          source={{ media, node: 1 }}
          linkCount={0}
          highlighted={false}
          sheetSourceClick={() => {}}
          handleKeyPress={() => {}}
        />,
        container
      );
    });
  };

  test.each(INVALID_URLS.filter((url) => typeof url === 'string' && url))(
    'invalid url %p renders no iframe, img or audio',
    (url) => {
      render(url);
      expect(container.querySelector('iframe, img, audio, script')).toBeNull();
      expect(container.textContent).toContain('Error loading media');
    }
  );

  test('a media URL containing quote characters is not rendered with extra attributes', () => {
    render('https://www.youtube.com/embed/abc" onload="window.__sheetMediaRan=1');
    expect(container.querySelector('[onload]')).toBeNull();
    expect(window.__sheetMediaRan).toBeUndefined();
  });

  test('allowed youtube embed renders a quoted iframe src', () => {
    render('https://www.youtube.com/embed/abc123');
    const iframe = container.querySelector('iframe');
    expect(iframe).not.toBeNull();
    expect(iframe.getAttribute('src')).toBe('https://www.youtube.com/embed/abc123');
  });

  test('allowed spotify embed renders a quoted iframe src', () => {
    render('https://open.spotify.com/embed/episode/abc');
    const iframe = container.querySelector('iframe');
    expect(iframe.getAttribute('src')).toBe('https://open.spotify.com/embed/episode/abc');
    expect(iframe.getAttribute('height')).toBe('152');
  });

  test('a soundcloud embed saved with encoded ampersands keeps its query parameter names', () => {
    render(
      'https://w.soundcloud.com/player/?url=https%3A//api.soundcloud.com/tracks/1&amp;color=ff5500&amp;auto_play=false'
    );
    const src = container.querySelector('iframe').getAttribute('src');
    expect(src).toContain('&color=ff5500&auto_play=false');
    expect(src).not.toContain('amp;');
  });
});
