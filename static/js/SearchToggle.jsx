import React, { useRef, useState, useEffect, useLayoutEffect } from 'react';
import { InterfaceText } from './Misc';

const SearchToggle = ({ options, selected, onChange }) => {
  const containerRef = useRef(null);
  const optionRefs = useRef([]);
  const [sliderStyle, setSliderStyle] = useState({});

  const updateSlider = () => {
    const selectedIndex = options.findIndex(o => o.name === selected);
    const selectedEl = optionRefs.current[selectedIndex];
    const containerEl = containerRef.current;
    if (!selectedEl || !containerEl) return;
    const containerRect = containerEl.getBoundingClientRect();
    const optionRect = selectedEl.getBoundingClientRect();
    setSliderStyle({
      width: `${optionRect.width}px`,
      transform: `translateX(${optionRect.left - containerRect.left}px)`,
    });
  };

  // Set initial position synchronously before first paint (avoids flash, no transition needed)
  useLayoutEffect(() => { updateSlider(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Animate on change — fires after paint so the CSS transition has a "from" state
  useEffect(() => { updateSlider(); }, [selected]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="searchToggle" role="group" ref={containerRef}>
      <div className="searchToggle__slider" style={sliderStyle} aria-hidden="true" />
      {options.map((option, i) => (
        <button
          type="button"
          key={option.name}
          ref={el => { optionRefs.current[i] = el; }}
          className={`searchToggle__option${selected === option.name ? ' searchToggle__option--active' : ''}`}
          onClick={() => onChange(option.name)}
          aria-pressed={selected === option.name}
        >
          <InterfaceText text={{ en: option.en, he: option.he }} />
        </button>
      ))}
    </div>
  );
};

export default SearchToggle;
