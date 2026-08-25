/* Testing done using Jest */
// No React Testing Library in this repo — react-dom directly, same pattern as the
// other hook/component tests in this directory.
import React from 'react';
import ReactDOM from 'react-dom';
import { act } from 'react-dom/test-utils';
import AuthCard from '../AuthCard.jsx';

let container = null;

function mount(props) {
  container = document.createElement('div');
  document.body.appendChild(container);
  act(() => { ReactDOM.render(React.createElement(AuthCard, props), container); });
}

function unmount() {
  act(() => { ReactDOM.unmountComponentAtNode(container); });
  document.body.removeChild(container);
  container = null;
}

const realSefaria = global.Sefaria;
beforeAll(() => { global.Sefaria = { _: (key) => key }; });
afterAll(() => { global.Sefaria = realSefaria; });

afterEach(() => {
  if (container) unmount();
});

describe('AuthCard heading focus', () => {
  // AuthPage swaps between view components (ChooseView/LoginView/...) rather than
  // navigating pages — each transition, including the back button (which just swaps to
  // a different view component too), mounts a fresh AuthCard. Screen-reader/keyboard
  // users need that transition announced the way a real page navigation would be.
  it('focuses the heading on mount, out of normal tab order', () => {
    mount({ heading: 'Sign In' });
    const heading = container.querySelector('.sefaria-auth-card-heading');
    expect(document.activeElement).toBe(heading);
    expect(heading.getAttribute('tabindex')).toBe('-1');
  });

  it('moves focus to the new heading on every remount (forward or back transitions alike)', () => {
    mount({ heading: 'Sign In' });
    unmount();
    mount({ heading: 'Create an Account' });
    expect(document.activeElement.textContent).toBe('Create an Account');
  });

  it('does not throw when there is no heading to focus', () => {
    expect(() => mount({ sub: 'just a sub-line' })).not.toThrow();
    expect(document.activeElement).not.toBe(container.querySelector('.sefaria-auth-card-sub'));
  });
});
