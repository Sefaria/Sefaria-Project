import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { render } from '@testing-library/react';
import { HomePage, homeSlot, type HomePayload } from '.';

const here = path.dirname(fileURLToPath(import.meta.url));
const css = fs.readFileSync(path.join(here, 'home.css'), 'utf8');

const data = {
  kind: 'home',
  title: 'Sefaria',
  bodyHtml: '<div class="dp-home"><h1 class="dp-home__hero-title">Expand Digital Torah</h1></div>',
} as unknown as HomePayload;

describe('HomePage', () => {
  it('renders the server main (skip-link target) around the adopted body', () => {
    const { container } = render(<HomePage data={data} />);
    const main = container.querySelector('main#content.dp-rm-app')!;
    expect(main).toHaveAttribute('data-visual', 'main');
    expect(main.firstElementChild).toHaveAttribute('data-dp-adopted', 'body');
    expect(main.querySelector('.dp-home__hero-title')).toHaveTextContent('Expand Digital Torah');
  });

  it('is the home slot', () => {
    const { container } = render(homeSlot(data));
    expect(container.querySelector('main#content')).not.toBeNull();
  });
});

describe('home.css', () => {
  it('scopes every class under dp-home (contract C5); the Discord button keeps its own', () => {
    const classes = new Set(
      css
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/url\([^)]*\)/g, '')
        .match(/\.[a-z][\w-]*/g)
    );
    for (const name of classes) expect(name).toMatch(/^\.dp-(home|discord-button)/);
  });

  it.each([1, 2, 3, 4, 5, 6])('moves the carousel and lights the indicator for card %i', (n) => {
    expect(css).toContain(`#dp-home-featured-${n}:checked ~ .dp-home__viewport .dp-home__track`);
    expect(css).toContain(`#dp-home-featured-${n}:checked ~ .dp-home__indicators .dp-home__indicator--${n}`);
    expect(css).toContain(`#dp-home-featured-${n}:focus-visible ~ .dp-home__indicators .dp-home__indicator--${n}`);
  });

  it('dims the next card for every count from two to six, wrapping to the first', () => {
    for (let n = 2; n <= 6; n++) {
      expect(css).toContain(
        `.dp-home__carousel--n${n} #dp-home-featured-${n}:checked ~ .dp-home__viewport .dp-home__card--1`
      );
    }
  });

  it('uses the designer’s wave vectors, not live’s bitmap', () => {
    expect(css).toContain("url('/home/wavy-lines-desktop.svg')");
    expect(css).toContain("url('/home/wavy-lines-mobile.svg')");
    expect(css).not.toContain('files.readme.io');
  });
});
