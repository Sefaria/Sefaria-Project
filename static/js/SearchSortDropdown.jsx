import React, { useState } from 'react';
import PropTypes from 'prop-types';
import classNames from 'classnames';
import { InterfaceText, DropdownModal, DropdownOptionList } from './Misc';


// The sort options and the hit-sorting function live in a React-free module so they can
// be unit tested without pulling in the component tree; re-exported here so the existing
// `import {ENTITY_SORT_OPTIONS, sortEntityHits} from './SearchSortDropdown'` keeps working.
export { ENTITY_SORT_OPTIONS, sortEntityHits } from './sefaria/entitySort';


const SearchSortDropdown = ({ options, sortType, onSortChange, disabled }) => {
  const [isOpen, setIsOpen] = useState(false);

  if (!options || !options.length) return null;
  const currentOption = options.find(o => o.type === sortType) || options[0];

  if (disabled) {
    return (
      <div className="searchSortDropdown disabled" aria-disabled="true" tabIndex={-1}>
        <img className="searchSortDropdown__icon" src="/static/icons/sort.svg" alt="" aria-hidden="true" />
        <span className="searchSortDropdown__label">
          <InterfaceText text={{ en: currentOption.name, he: currentOption.heName }} />
        </span>
        <img className="searchSortDropdown__chevron" src="/static/icons/chevron-down.svg" alt="" aria-hidden="true" />
      </div>
    );
  }

  const handleSelect = (newSortType) => {
    if (newSortType !== sortType) {
      onSortChange(newSortType);
    }
    setIsOpen(false);
  };

  const toggle = () => setIsOpen(prev => !prev);

  return (
    <DropdownModal close={() => setIsOpen(false)} isOpen={isOpen}>
      <div
        className={classNames('searchSortDropdown', { open: isOpen })}
        onClick={toggle}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); }}}
        tabIndex="0"
        role="button"
        aria-haspopup="true"
        aria-expanded={isOpen}
        aria-label={`Sort by ${currentOption.name}`}
      >
        <img className="searchSortDropdown__icon" src="/static/icons/sort.svg" alt="" aria-hidden="true" />
        <span className="searchSortDropdown__label">
          <InterfaceText text={{ en: currentOption.name, he: currentOption.heName }} />
        </span>
        <img
          className="searchSortDropdown__chevron"
          src="/static/icons/chevron-down.svg"
          alt=""
          aria-hidden="true"
        />
      </div>
      <DropdownOptionList
        isOpen={isOpen}
        options={options}
        currOptionSelected={currentOption.type}
        handleClick={handleSelect}
      />
    </DropdownModal>
  );
};

SearchSortDropdown.propTypes = {
  options: PropTypes.arrayOf(PropTypes.shape({
    type:   PropTypes.string.isRequired,
    name:   PropTypes.string.isRequired,
    heName: PropTypes.string.isRequired,
  })).isRequired,
  sortType:     PropTypes.string.isRequired,
  onSortChange: PropTypes.func.isRequired,
};

export default SearchSortDropdown;
