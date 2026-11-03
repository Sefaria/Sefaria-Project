/**
 * The shared scroll listener (scroll.js): a listener that moves the page (the stream inserting
 * the previous section and correcting the scroll, synchronously) must not leave the listeners
 * after it with a stale offset; the header read that as a long scroll down and hid.
 */
import {pokeScroll, subscribeScroll} from '../scroll';

test('listeners after one that moved the page see the new offset', () => {
  let y = 800;
  Object.defineProperty(window, 'pageYOffset', {configurable: true, get: () => y});
  Object.defineProperty(document.documentElement, 'scrollHeight', {configurable: true, value: 10000});
  const seen = [];
  const offA = subscribeScroll(() => { if (y === 800) { y = 1900; } });  // inserts above, corrects the scroll
  const offB = subscribeScroll((e) => seen.push(e.y));
  pokeScroll();
  expect(seen).toEqual([1900]);
  offA(); offB();
  delete window.pageYOffset;
});
