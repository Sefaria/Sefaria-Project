import { render } from '@testing-library/react';
import { AdoptedHtml } from './AdoptedHtml';
import { clearServerNodes, collectServerNodes, takeServerNodes } from './adopt';

afterEach(() => {
  clearServerNodes();
  document.body.innerHTML = '';
});

describe('AdoptedHtml', () => {
  it("moves the server's nodes in instead of re-parsing the HTML", () => {
    const server = document.createElement('div');
    server.innerHTML = '<div data-dp-adopt="body"><p>server</p><img alt="figure"></div>';
    const image = server.querySelector('img')!;
    collectServerNodes(server);
    expect(server.querySelector('[data-dp-adopt="body"]')).toBeEmptyDOMElement();

    const { container } = render(<AdoptedHtml adoptKey="body" html="<p>payload</p>" />);
    const element = container.querySelector('[data-dp-adopted="body"]')!;
    expect(element).toHaveTextContent('server');
    expect(element.querySelector('img')).toBe(image);
    expect(takeServerNodes('body')).toBeNull();
  });

  it('sets the payload HTML when there are no server nodes, and follows changes', () => {
    const { container, rerender } = render(<AdoptedHtml adoptKey="body" html="<p>first</p>" className="dp-article" />);
    const element = container.querySelector('[data-dp-adopted="body"]')!;
    expect(element).toHaveClass('dp-article');
    expect(element.innerHTML).toBe('<p>first</p>');
    rerender(<AdoptedHtml adoptKey="body" html="<p>second</p>" />);
    expect(element.innerHTML).toBe('<p>second</p>');
  });
});
