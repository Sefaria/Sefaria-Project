/**
 * Tests for stripHtmlTags utility function
 *
 * This function is security-critical for XSS prevention.
 * It safely extracts text content from HTML strings.
 */
import { stripHtmlTags } from '../components/shared';

describe('stripHtmlTags', () => {
  describe('basic HTML removal', () => {
    it('removes simple HTML tags', () => {
      expect(stripHtmlTags('<p>Hello</p>')).toBe('Hello');
    });

    it('removes nested HTML tags', () => {
      expect(stripHtmlTags('<div><p><span>Nested</span></p></div>')).toBe('Nested');
    });

    it('removes self-closing tags', () => {
      expect(stripHtmlTags('Hello<br/>World')).toBe('HelloWorld');
    });

    it('removes tags with attributes', () => {
      expect(stripHtmlTags('<a href="http://example.com">Link</a>')).toBe('Link');
    });

    it('removes script tags', () => {
      expect(stripHtmlTags('<script>alert("xss")</script>Safe')).toBe('alert("xss")Safe');
    });

    it('removes style tags', () => {
      expect(stripHtmlTags('<style>.red{color:red}</style>Text')).toBe('.red{color:red}Text');
    });
  });

  describe('HTML entity decoding', () => {
    it('decodes &nbsp; to space', () => {
      expect(stripHtmlTags('Hello&nbsp;World')).toBe('Hello World');
    });

    it('decodes &amp; to ampersand', () => {
      expect(stripHtmlTags('Tom &amp; Jerry')).toBe('Tom & Jerry');
    });

    it('decodes &lt; to less-than', () => {
      expect(stripHtmlTags('5 &lt; 10')).toBe('5 < 10');
    });

    it('decodes &gt; to greater-than', () => {
      expect(stripHtmlTags('10 &gt; 5')).toBe('10 > 5');
    });

    it('decodes &quot; to quote', () => {
      expect(stripHtmlTags('He said &quot;hello&quot;')).toBe('He said "hello"');
    });

    it('decodes multiple entities in one string', () => {
      expect(stripHtmlTags('&lt;div&gt;&amp;&nbsp;&quot;test&quot;')).toBe('<div>& "test"');
    });
  });

  describe('edge cases', () => {
    it('returns empty string for null', () => {
      expect(stripHtmlTags(null)).toBe('');
    });

    it('returns empty string for undefined', () => {
      expect(stripHtmlTags(undefined)).toBe('');
    });

    it('returns empty string for empty string', () => {
      expect(stripHtmlTags('')).toBe('');
    });

    it('trims whitespace', () => {
      expect(stripHtmlTags('  hello  ')).toBe('hello');
    });

    it('handles plain text without HTML', () => {
      expect(stripHtmlTags('Just plain text')).toBe('Just plain text');
    });

    it('handles malformed HTML', () => {
      expect(stripHtmlTags('<p>Unclosed paragraph')).toBe('Unclosed paragraph');
    });

    it('handles empty tags', () => {
      expect(stripHtmlTags('<div></div>')).toBe('');
    });
  });

  describe('real-world error messages', () => {
    it('strips HTML from typical error response', () => {
      const errorHtml = '<div class="error"><strong>Error:</strong> Invalid reference</div>';
      expect(stripHtmlTags(errorHtml)).toBe('Error: Invalid reference');
    });

    it('handles multi-line HTML content', () => {
      const multiLine = `<ul>
        <li>Error 1</li>
        <li>Error 2</li>
      </ul>`;
      const result = stripHtmlTags(multiLine);
      expect(result).toContain('Error 1');
      expect(result).toContain('Error 2');
    });
  });
});
