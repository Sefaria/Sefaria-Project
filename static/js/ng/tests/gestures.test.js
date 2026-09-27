import {classifyDrag, startsInEdgeZone, swipeDirection, SWIPE} from '../gestures';

const W = 390;

describe('horizontal swipes start anywhere on the text except the edge zones', () => {
  test('edge zones on both sides are reserved for the OS back gesture', () => {
    expect(startsInEdgeZone(5, W)).toBe(true);
    expect(startsInEdgeZone(W - 5, W)).toBe(true);
    expect(startsInEdgeZone(W / 2, W)).toBe(false);
    expect(classifyDrag({x: 10, y: 300}, {x: 120, y: 300}, W)).toBe('ignored');
  });

  test('the axis locks once the finger has travelled far enough', () => {
    expect(classifyDrag({x: 200, y: 300}, {x: 204, y: 302}, W)).toBe('pending');
    expect(classifyDrag({x: 200, y: 300}, {x: 240, y: 305}, W)).toBe('horizontal');
    expect(classifyDrag({x: 200, y: 300}, {x: 212, y: 340}, W)).toBe('vertical');
    // Diagonal drags scroll the page: horizontal needs a clear majority.
    expect(classifyDrag({x: 200, y: 300}, {x: 230, y: 325}, W)).toBe('vertical');
  });

  test('directions are logical and mirror in a Hebrew interface', () => {
    const far = SWIPE.commitDistance + 1;
    expect(swipeDirection(far, 'ltr')).toBe('toTrailing');
    expect(swipeDirection(-far, 'ltr')).toBe('toLeading');
    expect(swipeDirection(far, 'rtl')).toBe('toLeading');
    expect(swipeDirection(-far, 'rtl')).toBe('toTrailing');
    expect(swipeDirection(SWIPE.commitDistance - 1, 'ltr')).toBeNull();
  });
});
