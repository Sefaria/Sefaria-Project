/* Testing done using Jest */
// The cookie banner publishes its height so the page and the Library Assistant's floating
// button sit above it, and takes it back when the banner goes away.
import { reserveBottomBar, BOTTOM_BAR_HEIGHT, LAUNCHER_OFFSET } from '../sefaria/launcherOffset';

describe('reserveBottomBar', function () {
  let banner, resize, disconnected, set, removed;

  beforeEach(() => {
    disconnected = false;
    global.ResizeObserver = class {
      constructor(cb) {
        resize = cb;
      }
      observe() {
        resize();
      }
      disconnect() {
        disconnected = true;
      }
    };
    banner = document.createElement('div');
    Object.defineProperty(banner, 'offsetHeight', { configurable: true, value: 101 });
    document.body.appendChild(banner);
    // jsdom drops custom properties, so watch the calls instead of reading the value back
    set = jest.spyOn(document.documentElement.style, 'setProperty');
    removed = jest.spyOn(document.documentElement.style, 'removeProperty');
  });
  afterEach(() => {
    banner.remove();
    jest.restoreAllMocks();
    delete global.ResizeObserver;
  });

  const latest = (property) => {
    const calls = set.mock.calls.filter(([name]) => name === property);
    return calls.length ? calls[calls.length - 1][1] : '';
  };

  it("sets the bar height and launcher offset to the banner's height, and follows it when it changes", function () {
    reserveBottomBar(banner);
    expect(latest(BOTTOM_BAR_HEIGHT)).toBe('101px');
    expect(latest(LAUNCHER_OFFSET)).toBe('101px');
    Object.defineProperty(banner, 'offsetHeight', { configurable: true, value: 140 });
    resize();
    expect(latest(BOTTOM_BAR_HEIGHT)).toBe('140px');
    expect(latest(LAUNCHER_OFFSET)).toBe('140px');
  });

  it('gives the space back when released', function () {
    const release = reserveBottomBar(banner);
    release();
    expect(removed).toHaveBeenCalledWith(BOTTOM_BAR_HEIGHT);
    expect(removed).toHaveBeenCalledWith(LAUNCHER_OFFSET);
    expect(disconnected).toBe(true);
  });

  it('does nothing without a banner', function () {
    reserveBottomBar(null)();
    expect(set).not.toHaveBeenCalled();
  });
});
