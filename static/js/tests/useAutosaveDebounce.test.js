/**
 * useAutosaveDebounce: the sheet editor's debounced autosave hook.
 *
 * react-dom directly with act(), same pattern as lexiconEntryEditBox.test.js.
 */
import React from 'react';
import ReactDOM from 'react-dom';
import { act } from 'react-dom/test-utils';
import { useAutosaveDebounce } from '../useAutosaveDebounce';

let container;

function Harness({ value, save, onSchedule, enabled = true }) {
  useAutosaveDebounce(save, value, [value], { enabled, onSchedule });
  return null;
}

function render(props) {
  act(() => { ReactDOM.render(<Harness {...props} />, container); });
}

beforeEach(() => {
  jest.useFakeTimers();
  container = document.createElement('div');
  document.body.appendChild(container);
});

afterEach(() => {
  act(() => { ReactDOM.unmountComponentAtNode(container); });
  document.body.removeChild(container);
  container = null;
  jest.useRealTimers();
});

describe('useAutosaveDebounce', () => {
  test('saves the value once it has been stable for the delay', () => {
    const save = jest.fn();
    const onSchedule = jest.fn();
    render({ value: 'a', save, onSchedule });

    expect(onSchedule).toHaveBeenCalledTimes(1);
    expect(save).not.toHaveBeenCalled();

    act(() => { jest.advanceTimersByTime(500); });
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith('a');
  });

  test('a change inside the delay cancels the earlier save and restarts the timer', () => {
    const save = jest.fn();
    render({ value: 'a', save });

    act(() => { jest.advanceTimersByTime(300); });
    render({ value: 'ab', save });
    act(() => { jest.advanceTimersByTime(300); });
    expect(save).not.toHaveBeenCalled();

    act(() => { jest.advanceTimersByTime(200); });
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith('ab');
  });

  test('unmounting before the delay flushes the pending save with the latest value', () => {
    const save = jest.fn();
    render({ value: 'a', save });
    act(() => { jest.advanceTimersByTime(200); });
    render({ value: 'ab', save });
    act(() => { jest.advanceTimersByTime(100); });

    act(() => { ReactDOM.unmountComponentAtNode(container); });
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith('ab');

    // The timer was flushed, not left running: nothing more is saved later.
    act(() => { jest.advanceTimersByTime(1000); });
    expect(save).toHaveBeenCalledTimes(1);
  });

  test('unmounting after the save has fired does not save again', () => {
    const save = jest.fn();
    render({ value: 'a', save });
    act(() => { jest.advanceTimersByTime(500); });
    expect(save).toHaveBeenCalledTimes(1);

    act(() => { ReactDOM.unmountComponentAtNode(container); });
    expect(save).toHaveBeenCalledTimes(1);
  });

  test('unmounting while disabled does not save', () => {
    const save = jest.fn();
    render({ value: 'a', save, enabled: false });

    act(() => { ReactDOM.unmountComponentAtNode(container); });
    act(() => { jest.advanceTimersByTime(1000); });
    expect(save).not.toHaveBeenCalled();
  });

  test('does nothing when disabled', () => {
    const save = jest.fn();
    const onSchedule = jest.fn();
    render({ value: 'a', save, onSchedule, enabled: false });

    act(() => { jest.advanceTimersByTime(1000); });
    expect(onSchedule).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
  });
});
