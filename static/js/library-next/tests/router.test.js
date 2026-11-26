import React from 'react';
import ReactDOM from 'react-dom';
import { act } from 'react-dom/test-utils';
import { registerRoute, matchRoute, navigate, Link, useRoute, compilePath, hasRoute, isInternal, _resetRouter } from '../router';

const Page = () => null;

beforeAll(() => { window.scrollTo = jest.fn(); });

beforeEach(() => {
  _resetRouter();
  window.history.replaceState({}, '', '/');
});

describe('compilePath', () => {
  test('static, params and wildcard', () => {
    expect(compilePath('/texts')('/texts')).toEqual({});
    expect(compilePath('/texts')('/texts/')).toEqual({});
    expect(compilePath('/texts')('/texts/Tanakh')).toBeNull();
    expect(compilePath('/topics/:slug')('/topics/moses')).toEqual({ slug: 'moses' });
    expect(compilePath('/topics/:slug')('/topics/a/b')).toBeNull();
    expect(compilePath('/texts/*')('/texts')).toEqual({ rest: '' });
    expect(compilePath('/texts/*')('/texts/Tanakh/Torah')).toEqual({ rest: 'Tanakh/Torah' });
    expect(compilePath('/')('/')).toEqual({});
    expect(compilePath('/')('/x')).toBeNull();
  });
  test('decodes params', () => {
    expect(compilePath('/topics/:slug')('/topics/%D7%9E%D7%A9%D7%94')).toEqual({ slug: 'משה' });
  });
});

describe('registry', () => {
  test('first registered match wins; re-registering a name replaces it', () => {
    registerRoute({ name: 'texts', path: '/texts', component: Page });
    registerRoute({ name: 'cat', path: '/texts/*', component: Page });
    expect(matchRoute('/texts').route.name).toBe('texts');
    expect(matchRoute('/texts/Tanakh').route.name).toBe('cat');
    expect(matchRoute('/texts/Tanakh').params).toEqual({ rest: 'Tanakh' });
    const Other = () => null;
    registerRoute({ name: 'texts', path: '/texts', component: Other });
    expect(matchRoute('/texts').route.component).toBe(Other);
    expect(hasRoute('texts')).toBe(true);
    expect(hasRoute('nope')).toBe(false);
  });
  test('custom match and query parsing', () => {
    registerRoute({ name: 'search', match: (p, s) => (p === '/search' ? { q: new URLSearchParams(s).get('q') } : null), component: Page });
    const m = matchRoute('/search', '?q=light&tab=text');
    expect(m.params).toEqual({ q: 'light' });
    expect(m.query).toEqual({ q: 'light', tab: 'text' });
    expect(matchRoute('/nothing')).toBeNull();
  });
  test('rejects incomplete routes', () => {
    expect(() => registerRoute({ name: 'x', component: Page })).toThrow();
    expect(() => registerRoute({ name: 'x', path: '/x' })).toThrow();
  });
});

describe('navigation', () => {
  let container;
  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    registerRoute({ name: 'home', path: '/', component: Page });
    registerRoute({ name: 'topic', path: '/topics/:slug', component: Page });
  });
  afterEach(() => {
    ReactDOM.unmountComponentAtNode(container);
    container.remove();
  });

  function Probe() {
    const match = useRoute();
    return <span data-testid="route">{match ? `${match.route.name}:${JSON.stringify(match.params)}` : 'none'}</span>;
  }

  test('navigate pushes state, useRoute follows, popstate goes back', () => {
    act(() => { ReactDOM.render(<Probe />, container); });
    expect(container.textContent).toBe('home:{}');
    act(() => { navigate('/topics/moses'); });
    expect(window.location.pathname).toBe('/topics/moses');
    expect(container.textContent).toBe('topic:{"slug":"moses"}');
    expect(window.history.length).toBeGreaterThan(1);
    act(() => { navigate('/topics/aaron', { replace: true }); });
    expect(container.textContent).toBe('topic:{"slug":"aaron"}');
    act(() => {
      window.history.replaceState({}, '', '/');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    expect(container.textContent).toBe('home:{}');
  });

  test('unknown paths fall through to a full navigation', () => {
    const assign = jest.fn();
    const original = window.location;
    delete window.location;
    window.location = { ...original, assign, origin: original.origin, href: original.href, pathname: '/', search: '' };
    navigate('/login');
    expect(assign).toHaveBeenCalledWith('http://localhost/login');
    navigate('https://example.com/topics/moses');
    expect(assign).toHaveBeenCalledWith('https://example.com/topics/moses');
    window.location = original;
    expect(isInternal('/topics/moses')).toBe(true);
    expect(isInternal('/login')).toBe(false);
  });

  test('Link intercepts plain clicks on known routes only', () => {
    act(() => {
      ReactDOM.render(
        <div>
          <Link to="/topics/moses" id="known">Moses</Link>
          <Link to="/login" id="unknown">Log in</Link>
          <Link to="/topics/aaron" id="blank" target="_blank">Aaron</Link>
          <Probe />
        </div>, container);
    });
    const click = (el, init = {}) => {
      const e = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0, ...init });
      el.dispatchEvent(e);
      return e.defaultPrevented;
    };
    expect(click(container.querySelector('#unknown'))).toBe(false);
    expect(click(container.querySelector('#blank'))).toBe(false);
    expect(click(container.querySelector('#known'), { metaKey: true })).toBe(false);
    let prevented;
    act(() => { prevented = click(container.querySelector('#known')); });
    expect(prevented).toBe(true);
    expect(window.location.pathname).toBe('/topics/moses');
    expect(container.querySelector('[data-testid=route]').textContent).toBe('topic:{"slug":"moses"}');
  });
});
