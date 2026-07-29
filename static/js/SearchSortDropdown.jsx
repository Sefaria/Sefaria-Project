import React, { useState } from 'react';
import PropTypes from 'prop-types';
import classNames from 'classnames';
import { InterfaceText, DropdownModal, DropdownOptionList } from './Misc';


export const ENTITY_SORT_OPTIONS = {
  books: [
    { type: 'relevance',  name: 'Relevance',                       heName: 'רלוונטיות' },
    { type: 'year_asc',   name: 'Composition Date (Oldest First)', heName: 'תאריך חיבור (ישן לחדש)' },
    { type: 'year_desc',  name: 'Composition Date (Newest First)', heName: 'תאריך חיבור (חדש לישן)' },
    { type: 'alpha',      name: 'A-Z',                             heName: 'א-ת' },
  ],
  authors: [
    { type: 'relevance', name: 'Relevance',           heName: 'רלוונטיות' },
    { type: 'year_asc',  name: 'Year (Oldest First)', heName: 'שנה (ישן לחדש)' },
    { type: 'year_desc', name: 'Year (Newest First)', heName: 'שנה (חדש לישן)' },
    { type: 'alpha',     name: 'A-Z',                 heName: 'א-ת' },
  ],
  topics: [
    { type: 'relevance', name: 'Relevance', heName: 'רלוונטיות' },
    { type: 'alpha',     name: 'A-Z',       heName: 'א-ת' },
  ],
};

export const sortEntityHits = (hits, type, sortKey) => {
  if (!hits || sortKey === 'relevance') return hits;
  const sorted = [...hits];
  if (sortKey === 'alpha') {
    return sorted.sort((a, b) =>
      (a.title_en || a.title_he || '').localeCompare(b.title_en || b.title_he || '')
    );
  }
  // Some author records carry their years as numeric strings ('1804') rather than ints,
  // so coerce before comparing — string subtraction happens to work, but '' would coerce
  // to 0 and sort as year zero.
  const toYear = (val) => {
    if (val === null || val === undefined || val === '') { return null; }
    const num = Number(val);
    return Number.isFinite(num) ? num : null;
  };
  const getYear = (hit) => {
    if (type === 'book')   return toYear(hit.compDate);
    if (type === 'author') return toYear(hit.deathYear) ?? toYear(hit.birthYear);
    return null;
  };
  const asc = sortKey.endsWith('_asc');
  return sorted.sort((a, b) => {
    const ya = getYear(a);
    const yb = getYear(b);
    if (ya == null && yb == null) return 0;
    if (ya == null) return 1;
    if (yb == null) return -1;
    return asc ? ya - yb : yb - ya;
  });
};


const SearchSortDropdown = ({ options, sortType, onSortChange }) => {
  const [isOpen, setIsOpen] = useState(false);

  if (!options || !options.length) return null;
  const currentOption = options.find(o => o.type === sortType) || options[0];

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
