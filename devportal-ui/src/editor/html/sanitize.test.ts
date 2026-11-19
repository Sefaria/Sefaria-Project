// V-security: the canvas's raw-HTML preview parses the author's HTML in an inert document, so nothing in it loads or
// runs before the allow-list removes it (PLAN §6.7).
import { afterEach, describe, expect, it, vi } from 'vitest';

import { sanitizeHtml } from './sanitize';

describe('sanitizeHtml', () => {
  afterEach(() => vi.restoreAllMocks());

  it('never parses the HTML in the live document', () => {
    const create = vi.spyOn(document, 'createElement');
    const out = sanitizeHtml('<img src="https://evil.example/x.png" onerror="alert(1)"><script>alert(2)</script>');
    expect(create).not.toHaveBeenCalled();
    expect(out).not.toMatch(/onerror|<script|alert/);
  });

  it('removes event handlers, scripts and javascript: links', () => {
    const out = sanitizeHtml(
      '<a href="javascript:alert(1)" onclick="x()">a</a><svg onload="x()"></svg><p style="x">p</p>'
    );
    expect(out).not.toMatch(/javascript:|onclick|onload|<svg|style=/);
    expect(out).toContain('<p>p</p>');
  });
});
