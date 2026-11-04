/* Testing done using Jest */
// The cookie banner publishes its height so the Library Assistant's floating button sits
// above it, and takes it back when the banner goes away.
import { liftLauncherAbove, LAUNCHER_OFFSET } from "../sefaria/launcherOffset";

describe("liftLauncherAbove", function () {
  let banner, resize, disconnected, set, removed;

  beforeEach(() => {
    disconnected = false;
    global.ResizeObserver = class {
      constructor(cb) { resize = cb; }
      observe() { resize(); }
      disconnect() { disconnected = true; }
    };
    banner = document.createElement("div");
    Object.defineProperty(banner, "offsetHeight", { configurable: true, value: 101 });
    document.body.appendChild(banner);
    // jsdom drops custom properties, so watch the calls instead of reading the value back
    set = jest.spyOn(document.documentElement.style, "setProperty");
    removed = jest.spyOn(document.documentElement.style, "removeProperty");
  });
  afterEach(() => {
    banner.remove();
    jest.restoreAllMocks();
    delete global.ResizeObserver;
  });

  const offset = () => set.mock.calls.length ? set.mock.calls[set.mock.calls.length - 1][1] : "";

  it("sets the offset to the banner's height, and follows it when it changes", function () {
    liftLauncherAbove(banner);
    expect(offset()).toBe("101px");
    Object.defineProperty(banner, "offsetHeight", { configurable: true, value: 140 });
    resize();
    expect(offset()).toBe("140px");
  });

  it("puts the button back when released", function () {
    const release = liftLauncherAbove(banner);
    release();
    expect(removed).toHaveBeenCalledWith(LAUNCHER_OFFSET);
    expect(disconnected).toBe(true);
  });

  it("does nothing without a banner", function () {
    liftLauncherAbove(null)();
    expect(set).not.toHaveBeenCalled();
  });
});
