import React, { useState } from 'react';
import PropTypes from 'prop-types';
import classNames from 'classnames';
import Sefaria from './sefaria/sefaria';
import { InterfaceText, DropdownModal, DropdownOptionList } from './Misc';


// Labels live in i18n/interface/{en,he}.json. Both consumers of these options
// (DropdownOptionList here, SortRadioList in SearchFilters) render an English *and* a
// Hebrew span and let CSS hide one, hence _bilingual rather than Sefaria._().
const makeSortOption = (type, stringId) => {
  const {en, he} = Sefaria._bilingual(stringId);
  return {type, name: en, heName: he};
};

export const ENTITY_SORT_OPTIONS = {
  books: [
    makeSortOption('relevance', 'search.sort.relevance'),
    makeSortOption('year_asc',  'search.sort.books.year_asc'),
    makeSortOption('year_desc', 'search.sort.books.year_desc'),
    makeSortOption('alpha',     'search.sort.alphabetical'),
  ],
  authors: [
    makeSortOption('relevance', 'search.sort.relevance'),
    makeSortOption('year_asc',  'search.sort.authors.year_asc'),
    makeSortOption('year_desc', 'search.sort.authors.year_desc'),
    makeSortOption('alpha',     'search.sort.alphabetical'),
  ],
  topics: [
    makeSortOption('relevance', 'search.sort.relevance'),
    makeSortOption('alpha',     'search.sort.alphabetical'),
  ],
};

// The `type` values above are sent straight to /api/entity-search as its `sort` param, which
// orders the entire match set in Elasticsearch (ENTITY_SORTS in sefaria/helper/search.py).
// There is deliberately no client-side sort helper here: sorting the hits already downloaded
// could only ever reorder those hits, so on "A-Z" the alphabetically-first result would still
// be missing whenever it happened to fall outside the pages fetched so far.


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
        <img className="searchSortDropdown__chevron" src="/static/icons/chevron-down-line.svg" alt="" aria-hidden="true" />
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
          src="/static/icons/chevron-down-line.svg"
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
