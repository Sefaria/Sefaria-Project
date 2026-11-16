const { escapeHtml, sanitizeHtml } = require('./sheetsSanitize');

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
