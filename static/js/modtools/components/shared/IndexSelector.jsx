/**
 * IndexSelector - List-based display for selecting indices
 *
 * Shared component used by BulkVersionEditor, BulkIndexEditor (disabled), AutoLinkCommentaryTool (disabled)
 * to display indices in a compact list with filtering.
 *
 * Features:
 * - List-based layout with rows (scrollable, configurable max-height)
 * - Text search filtering (searches both title and categories)
 * - Select All checkbox in header (toggles selection of filtered items)
 * - Visual distinction for selected items (highlighted background)
 * - Category display inline (when categories are provided in index objects)
 *
 * Props:
 * - indices: Array<{title: string, categories?: string[]}> - Array of index objects with title and optional categories
 * - selectedIndices: Set<string> - Set of currently selected index titles
 * - onSelectionChange: (Set) => void - Callback when selection changes
 * - label: string - Label for the items (e.g., "texts", "indices", "commentaries")
 *
 * Parent components should:
 * - Transform API response to combine indices and metadata into single array
 * - Implement their own Clear Search button and searched state
 *
 * For AI agents: This component manages a Set of selected index titles.
 * The onSelectionChange callback receives the new Set when selection changes.
 */
import React, { useState, useMemo } from 'react';
import PropTypes from 'prop-types';

const IndexSelector = ({
  indices,
  selectedIndices,
  onSelectionChange,
  label = 'texts',
  maxHeight = null // Set to null to let page scroll; set value like '400px' for inner scroll
}) => {
  const [searchFilter, setSearchFilter] = useState('');

  // Filter indices based on search (searches both title and categories)
  const filteredIndices = useMemo(() => {
    if (!searchFilter.trim()) return indices;
    const search = searchFilter.toLowerCase();
    return indices.filter(item => {
      const titleMatch = item.title.toLowerCase().includes(search);
      const categoryMatch = item.categories?.some(cat =>
        cat.toLowerCase().includes(search)
      );
      return titleMatch || categoryMatch;
    });
  }, [indices, searchFilter]);

  if (!indices || indices.length === 0) return null;

  const selectAll = () => {
    // Select all currently filtered indices
    const toSelect = new Set(selectedIndices);
    filteredIndices.forEach(item => toSelect.add(item.title));
    onSelectionChange(toSelect);
  };

  const deselectAll = () => {
    // Deselect all currently filtered indices
    const toKeep = new Set(selectedIndices);
    filteredIndices.forEach(item => toKeep.delete(item.title));
    onSelectionChange(toKeep);
  };

  const toggleOne = (title, checked) => {
    const newSet = new Set(selectedIndices);
    if (checked) {
      newSet.add(title);
    } else {
      newSet.delete(title);
    }
    onSelectionChange(newSet);
  };

  const allFilteredSelected = filteredIndices.every(item => selectedIndices.has(item.title));

  // Get display category for an index (first 2 categories joined)
  const getDisplayCategory = (item) => {
    if (item.categories && item.categories.length > 0) {
      return item.categories.slice(0, 2).join(' • ');
    }
    return null;
  };

  return (
    <div className="indexSelectorContainer">
      {/* Header with count and search */}
      <div className="indexSelectorHeader">
        <div className="indexSelectorTitle">
          Found <span className="highlight">{indices.length} {label}</span> with this version
        </div>
        <div className="indexSelectorActions">
          <span className="selectionCount">
            {selectedIndices.size} of {indices.length} selected
          </span>
          <label className="selectAllToggle">
            <input
              type="checkbox"
              checked={allFilteredSelected && filteredIndices.length > 0}
              onChange={e => e.target.checked ? selectAll() : deselectAll()}
            />
            Select All
          </label>
        </div>
      </div>

      {/* Search filter */}
      <div className="indexSearchWrapper">
        <input
          type="text"
          className="indexSearchInput"
          placeholder={`Search ${label}...`}
          value={searchFilter}
          onChange={e => setSearchFilter(e.target.value)}
        />
        {searchFilter && (
          <button
            className="indexSearchClear"
            onClick={() => setSearchFilter('')}
            type="button"
            aria-label="Clear search"
          >
            ×
          </button>
        )}
      </div>

      {/* Index List */}
      <div className="indexList" style={maxHeight ? { maxHeight, overflowY: 'auto' } : undefined}>
        {filteredIndices.length === 0 ? (
          <div className="indexNoResults">
            No {label} match "{searchFilter}"
          </div>
        ) : (
          filteredIndices.map(item => {
            const isSelected = selectedIndices.has(item.title);
            const category = getDisplayCategory(item);

            return (
              <div
                key={item.title}
                className={`indexListRow ${isSelected ? 'selected' : ''}`}
                onClick={() => toggleOne(item.title, !isSelected)}
              >
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={e => {
                    e.stopPropagation();
                    toggleOne(item.title, e.target.checked);
                  }}
                />
                <span className="indexListTitle">{item.title}</span>
                {category && (
                  <span className="indexListCategory">{category}</span>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

IndexSelector.propTypes = {
  indices: PropTypes.arrayOf(PropTypes.shape({
    title: PropTypes.string.isRequired,
    categories: PropTypes.arrayOf(PropTypes.string)
  })).isRequired,
  selectedIndices: PropTypes.instanceOf(Set).isRequired,
  onSelectionChange: PropTypes.func.isRequired,
  label: PropTypes.string,
  maxHeight: PropTypes.string
};

export default IndexSelector;
