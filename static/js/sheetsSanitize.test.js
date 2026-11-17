const { escapeHtml, sanitizeHtml, sanitizeCaptionHtml, parseMediaUrl, safeMediaUrl } = require('./sheetsSanitize');

describe('escapeHtml', () => {
  test('escapes markup and both quote kinds', () => {
    expect(escapeHtml(`<a href="x" title='y'>&</a>`)).toBe(
      '&lt;a href=&quot;x&quot; title=&#39;y&#39;&gt;&amp;&lt;/a&gt;'
    );
  });

  test('null and undefined become an empty string', () => {
    expect(escapeHtml(null)).toBe('');
    expect(escapeHtml(undefined)).toBe('');
  });

  test('an escaped option value stays inside a quoted attribute', () => {
    const attr = " data-sourceprefix='" + escapeHtml("a' onmouseover='x") + "'";
    const el = document.createElement('div');
    el.innerHTML = '<li' + attr + '></li>';
    const li = el.firstChild;
    expect(li.getAttribute('data-sourceprefix')).toBe("a' onmouseover='x");
    expect(li.attributes.length).toBe(1);
  });
});

describe('sanitizeHtml', () => {
  test('keeps simple formatting', () => {
    expect(sanitizeHtml('<b>bold</b> and <i>it</i>')).toBe('<b>bold</b> and <i>it</i>');
  });

  test('drops script, event handlers and unknown tags', () => {
    const out = sanitizeHtml('<img src=x onerror=alert(1)><script>alert(2)</script><b onclick="x()">hi</b>');
    expect(out).toBe('<b>hi</b>');
  });

  test('removes unsafe link targets', () => {
    expect(sanitizeHtml('<a href="javascript:alert(1)">x</a>')).toBe('<a>x</a>');
    expect(sanitizeHtml('<a href="https://example.com">x</a>')).toContain('href="https://example.com"');
  });

  test('keeps entity-encoded text as text', () => {
    expect(sanitizeHtml('a &lt;b&gt; c')).toBe('a &lt;b&gt; c');
  });
});

describe('sanitizeCaptionHtml', () => {
  test('keeps lists, tables, data-ref and the allowed styles', () => {
    const html =
      '<ul><li>a</li></ul><table><tbody><tr><td colspan="2">x</td></tr></tbody></table>' +
      '<a href="/Genesis.1" data-ref="Genesis 1">g</a><span style="color: red">r</span>';
    const out = sanitizeCaptionHtml(html);
    expect(out).toContain('<ul><li>a</li></ul>');
    expect(out).toContain('<td colspan="2">x</td>');
    expect(out).toContain('data-ref="Genesis 1"');
    expect(out).toContain('style="color: red"');
  });

  test('drops styles and attributes outside the allowed set', () => {
    const out = sanitizeCaptionHtml('<span style="position: fixed; color: blue" onclick="x()">t</span><img src=x>');
    expect(out).toBe('<span style="color: blue">t</span>');
  });

  test('keeps the default policy unchanged for other fields', () => {
    expect(sanitizeHtml('<ul><li>a</li></ul>')).toBe('a');
  });
});

describe('media URLs saved with encoded query separators', () => {
  test('an encoded ampersand is decoded before validation', () => {
    const url =
      'https://w.soundcloud.com/player/?url=https%3A//api.soundcloud.com/tracks/1&amp;color=ff5500&amp;auto_play=false';
    const parsed = parseMediaUrl(url);
    expect(parsed.kind).toBe('soundcloud');
    expect(parsed.url).toContain('&color=ff5500&auto_play=false');
    expect(parsed.url).not.toContain('&amp;');
    expect(escapeHtml(safeMediaUrl(url))).toContain('&amp;color=ff5500&amp;auto_play=false');
  });
});
