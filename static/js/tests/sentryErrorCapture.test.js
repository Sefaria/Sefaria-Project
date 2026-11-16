import {
  DEFAULT_SENTRY_SAMPLE_RATE,
  resolveSentrySampleRate,
  installGlobalErrorCapture,
} from '../sefaria/sentryErrorCapture';

describe('resolveSentrySampleRate', () => {
  it('uses a non-zero default when remote config does not set a rate', () => {
    expect(resolveSentrySampleRate(undefined)).toBe(DEFAULT_SENTRY_SAMPLE_RATE);
    expect(resolveSentrySampleRate(null)).toBe(DEFAULT_SENTRY_SAMPLE_RATE);
    expect(DEFAULT_SENTRY_SAMPLE_RATE).toBeGreaterThan(0);
    expect(DEFAULT_SENTRY_SAMPLE_RATE).toBeLessThanOrEqual(1);
  });

  it('honours an explicit remote config rate, including an explicit zero', () => {
    expect(resolveSentrySampleRate(0)).toBe(0);
    expect(resolveSentrySampleRate(0.5)).toBe(0.5);
    expect(resolveSentrySampleRate(1)).toBe(1);
  });
});

describe('installGlobalErrorCapture', () => {
  let target;
  let sentry;

  beforeEach(() => {
    target = document.createElement('div');
    sentry = { captureException: jest.fn() };
    installGlobalErrorCapture(target, sentry);
  });

  it('forwards uncaught errors to Sentry', () => {
    const error = new Error('boom');
    const event = new Event('error');
    Object.defineProperty(event, 'error', { value: error });
    target.dispatchEvent(event);
    expect(sentry.captureException).toHaveBeenCalledWith(error);
  });

  it('forwards unhandled promise rejections to Sentry', () => {
    const reason = new Error('rejected');
    const event = new Event('unhandledrejection');
    Object.defineProperty(event, 'reason', { value: reason });
    target.dispatchEvent(event);
    expect(sentry.captureException).toHaveBeenCalledWith(reason);
  });

  it('does not replace an existing window.onerror handler', () => {
    const existing = jest.fn();
    const win = { onerror: existing, addEventListener: jest.fn() };
    installGlobalErrorCapture(win, sentry);
    expect(win.onerror).toBe(existing);
    expect(win.addEventListener).toHaveBeenCalledWith('error', expect.any(Function));
    expect(win.addEventListener).toHaveBeenCalledWith('unhandledrejection', expect.any(Function));
  });
});
