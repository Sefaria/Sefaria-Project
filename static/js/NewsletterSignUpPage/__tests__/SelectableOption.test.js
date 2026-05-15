import React from 'react';
import ReactDOM from 'react-dom';
import { act } from 'react-dom/test-utils';
import SelectableOption from '../SelectableOption';

let container;
beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
});
afterEach(() => {
  ReactDOM.unmountComponentAtNode(container);
  document.body.removeChild(container);
});

const render = (props = {}) => {
  act(() => {
    ReactDOM.render(
      React.createElement(SelectableOption, { label: 'Test', isSelected: false, onChange: () => {}, ...props }),
      container
    );
  });
};

describe('SelectableOption', () => {
  it('label has "selected" class when isSelected=true', () => {
    render({ isSelected: true });
    expect(container.querySelector('.selectableOptionLabel').classList.contains('selected')).toBe(true);
  });

  it('label lacks "selected" class when isSelected=false', () => {
    render({ isSelected: false });
    expect(container.querySelector('.selectableOptionLabel').classList.contains('selected')).toBe(false);
  });

  it('renders label text in .selectableOptionText', () => {
    render({ label: 'Sefaria News' });
    expect(container.querySelector('.selectableOptionText').textContent).toBe('Sefaria News');
  });

  it('defaults to checkbox input type', () => {
    render();
    expect(container.querySelector('.selectableOptionInput').type).toBe('checkbox');
  });

  it('renders radio input when type="radio"', () => {
    render({ type: 'radio', name: 'level', value: '1' });
    expect(container.querySelector('.selectableOptionInput').type).toBe('radio');
  });

  it('propagates disabled to input element', () => {
    render({ disabled: true });
    expect(container.querySelector('.selectableOptionInput').disabled).toBe(true);
  });

  it('renders icon span with maskImage when icon prop provided', () => {
    render({ icon: 'news-and-resources.svg' });
    const span = container.querySelector('.selectableOptionIcon');
    expect(span).not.toBeNull();
    expect(span.style.maskImage).toContain('news-and-resources.svg');
  });

  it('does not render icon span when icon prop absent', () => {
    render();
    expect(container.querySelector('.selectableOptionIcon')).toBeNull();
  });

  it('spreads analyticsAttributes onto input', () => {
    render({ analyticsAttributes: { 'data-anl-event': 'newsletter:click' } });
    expect(container.querySelector('.selectableOptionInput').getAttribute('data-anl-event')).toBe('newsletter:click');
  });

  it('always renders .selectedCheckmark regardless of selection state', () => {
    render({ isSelected: false });
    expect(container.querySelector('.selectedCheckmark')).not.toBeNull();
  });

  it('falls back to default icon on image load error', async () => {
    const OriginalImage = global.Image;
    const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    global.Image = class {
      set src(_v) { setTimeout(() => this.onerror && this.onerror(), 0); }
    };

    try {
      await act(async () => {
        ReactDOM.render(
          React.createElement(SelectableOption, { label: 'Test', icon: 'broken-icon.svg', isSelected: false, onChange: () => {} }),
          container
        );
        await new Promise(r => setTimeout(r, 50));
      });

      const span = container.querySelector('.selectableOptionIcon');
      expect(span.style.maskImage).toContain('news-and-resources.svg');
      expect(consoleWarnSpy).toHaveBeenCalledWith('Failed to load icon: broken-icon.svg, falling back to default');
    } finally {
      consoleWarnSpy.mockRestore();
      global.Image = OriginalImage;
    }
  });
});
