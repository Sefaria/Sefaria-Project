/**
 * IndexSelector - Card-based grid for selecting indices
 *
 * Shared component used by BulkVersionEditor, BulkIndexEditor, and AutoLinkCommentaryTool
 * to display indices in a visual card grid with filtering.
 *
 * Features:
 * - Card-based 3-column grid layout (scrollable, max-height 400px)
 * - Text search filtering (searches both title and categories)
 * - Select All checkbox in header (toggles selection of filtered items)
 * - Visual distinction for selected items (blue left border)
 * - Category display on cards (when indexMetadata prop is provided)
 *
 * Props:
 * - indices: string[] - Array of index titles to display
 * - selectedIndices: Set<string> - Set of currently selected indices
 * - onSelectionChange: (Set) => void - Callback when selection changes
 * - label: string - Label for the items (e.g., "texts", "indices", "commentaries")
 * - indexMetadata: object - Optional metadata for each index { title: { categories: [...] } }
 *
 * Parent components should:
 * - Pass indexMetadata from the /api/version-indices response to show categories
 * - Implement their own Clear Search button and searched state
 *
 * For AI agents: This component manages a Set of selected indices.
 * The onSelectionChange callback receives the new Set when selection changes.
 */
import React, { useState, useMemo } from 'react';
import PropTypes from 'prop-types';

const IndexSelector = ({
  indices,
  selectedIndices,
  onSelectionChange,
  label = 'texts',
  maxHeight = null, // Set to null to let page scroll; set value like '400px' for inner scroll
  indexMetadata = {} // Optional: { indexTitle: { categories: [...], ... } }
}) => {
  const [searchFilter, setSearchFilter] = useState('');

  // Filter indices based on search
  const filteredIndices = useMemo(() => {
    if (!searchFilter.trim()) return indices;
    const search = searchFilter.toLowerCase();
    return indices.filter(idx => {
      const titleMatch = idx.toLowerCase().includes(search);
      const meta = indexMetadata[idx];
      const categoryMatch = meta?.categories?.some(cat =>
        cat.toLowerCase().includes(search)
      );
      return titleMatch || categoryMatch;
    });
  }, [indices, searchFilter, indexMetadata]);

  if (!indices || indices.length === 0) return null;

  const selectAll = () => {
    // Select all currently filtered indices
    const toSelect = new Set(selectedIndices);
    filteredIndices.forEach(idx => toSelect.add(idx));
    onSelectionChange(toSelect);
  };

  const deselectAll = () => {
    // Deselect all currently filtered indices
    const toKeep = new Set(selectedIndices);
    filteredIndices.forEach(idx => toKeep.delete(idx));
    onSelectionChange(toKeep);
  };

  const toggleOne = (index, checked) => {
    const newSet = new Set(selectedIndices);
    if (checked) {
      newSet.add(index);
    } else {
      newSet.delete(index);
    }
    onSelectionChange(newSet);
  };

  const allFilteredSelected = filteredIndices.every(idx => selectedIndices.has(idx));

  // Get display category for an index
  const getDisplayCategory = (indexTitle) => {
    const meta = indexMetadata[indexTitle];
    if (meta?.categories && meta.categories.length > 0) {
      // Show first 2 categories joined
      return meta.categories.slice(0, 2).join(' • ');
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

      {/* Card Grid */}
      <div className="indexCardGrid" style={maxHeight ? { maxHeight, overflowY: 'auto' } : undefined}>
        {filteredIndices.length === 0 ? (
          <div className="indexNoResults">
            No {label} match "{searchFilter}"
          </div>
        ) : (
          filteredIndices.map(idx => {
            const isSelected = selectedIndices.has(idx);
            const category = getDisplayCategory(idx);

            return (
              <div
                key={idx}
                className={`indexCard ${isSelected ? 'selected' : ''}`}
                onClick={() => toggleOne(idx, !isSelected)}
              >
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={e => {
                    e.stopPropagation();
                    toggleOne(idx, e.target.checked);
                  }}
                />
                <div className="indexCardContent">
                  <div className="indexCardTitle">{idx}</div>
                  {category && (
                    <div className="indexCardCategory">{category}</div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

IndexSelector.propTypes = {
  indices: PropTypes.arrayOf(PropTypes.string).isRequired,
  selectedIndices: PropTypes.instanceOf(Set).isRequired,
  onSelectionChange: PropTypes.func.isRequired,
  label: PropTypes.string,
  maxHeight: PropTypes.string,
  indexMetadata: PropTypes.object
};

export default IndexSelector;
